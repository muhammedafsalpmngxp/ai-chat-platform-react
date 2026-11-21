import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Proxy for the TWise Ask Data service.
 *
 * The server signs in to TWise itself with the account in .env (TWISE_EMAIL and
 * TWISE_PASSWORD), keeps the session in memory and renews it when it expires, so the
 * app is always signed in. The browser never sees the password or the tokens.
 *
 * Upstream endpoints:
 *   POST {TWISE_AUTH_URL}/auth/login            {email, password}  -> {token, refreshToken, ...}
 *   POST {TWISE_AUTH_URL}/auth/refresh-token    {refreshToken}     -> {token, refreshToken, ...}
 *   GET  {TWISE_API_URL}/ai/askdata/starters                       -> string[]
 *   POST {TWISE_API_URL}/ai/ask                 {conversationId, question, ...} -> Server-Sent Events
 */

const ENV_FILE = path.resolve(import.meta.dirname, "../.env");

/**
 * Read a setting, preferring the .env file as it is now. Re-reading it means a changed
 * account takes effect on the next sign-in, without restarting the server.
 */
function setting(name: string): string {
  let fromFile: string | undefined;
  try {
    fromFile = parseEnv(readFileSync(ENV_FILE, "utf8"))[name];
  } catch {
    // No .env file.
  }
  return (fromFile || process.env[name] || "").trim();
}

// Defaults point at the QA environment; override them in .env (see .env.example).
const authUrl = () => (setting("TWISE_AUTH_URL") || "http://20.98.112.250:7007").replace(/\/$/, "");
const apiUrl = () => (setting("TWISE_API_URL") || "http://20.98.112.250:5069/api").replace(/\/$/, "");

/** Rows of a result table forwarded to the browser (it is saved with the chat). */
const MAX_ROWS = 200;

/** After a failed sign-in, wait this long before trying the same account again (avoids lockouts). */
const SIGN_IN_RETRY_MS = 30_000;

class AskDataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The upstream error message, if the body has one. */
async function upstreamError(res: globalThis.Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown; title?: unknown };
    for (const v of [body.message, body.error, body.title]) if (typeof v === "string" && v.trim()) return v;
  } catch {
    // Not JSON.
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Session: one TWise session for the whole server.
// ---------------------------------------------------------------------------

interface Session {
  token: string;
  refreshToken: string;
}

let session: Session | null = null;
/** Sign-in or refresh in progress, shared by all requests that need it. */
let pending: Promise<Session> | null = null;
let lastFailure: { account: string; at: number; error: AskDataError } | null = null;

async function requestSession(pathname: string, body: unknown, failure: string): Promise<Session> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${authUrl()}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AskDataError("Couldn't reach the Ask Data sign-in service.", 502);
  }
  if (!res.ok) throw new AskDataError(`${failure}: ${await upstreamError(res, `HTTP ${res.status}`)}`, 502);
  const data = (await res.json().catch(() => ({}))) as { token?: unknown; refreshToken?: unknown };
  if (typeof data.token !== "string" || typeof data.refreshToken !== "string") {
    throw new AskDataError("Ask Data returned a session without tokens.", 502);
  }
  return { token: data.token, refreshToken: data.refreshToken };
}

async function signIn(): Promise<Session> {
  const email = setting("TWISE_EMAIL");
  const password = setting("TWISE_PASSWORD");
  if (!email || !password) {
    throw new AskDataError("Ask Data isn't set up: add TWISE_EMAIL and TWISE_PASSWORD to the .env file.", 503);
  }
  const account = `${email}\n${password}`;
  if (lastFailure && lastFailure.account === account && Date.now() - lastFailure.at < SIGN_IN_RETRY_MS) {
    throw lastFailure.error;
  }
  try {
    const s = await requestSession("/auth/login", { email, password }, "Ask Data sign-in failed");
    lastFailure = null;
    console.log("Signed in to Ask Data.");
    return s;
  } catch (err) {
    const error = err instanceof AskDataError ? err : new AskDataError("Ask Data sign-in failed.", 502);
    lastFailure = { account, at: Date.now(), error };
    throw error;
  }
}

/** Run one sign-in/refresh at a time; concurrent callers share its result. */
function startSession(make: () => Promise<Session>): Promise<Session> {
  pending ??= make()
    .then((s) => (session = s))
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The current session, signing in if there is none. */
const currentSession = () => (session ? Promise.resolve(session) : (pending ?? startSession(signIn)));

/** Replace a session TWise rejected: refresh it, or sign in again if that fails. */
function renewSession(rejected: Session): Promise<Session> {
  if (session && session !== rejected) return Promise.resolve(session); // already renewed
  if (pending) return pending;
  session = null;
  return startSession(() =>
    requestSession("/auth/refresh-token", { refreshToken: rejected.refreshToken }, "Refresh failed").catch(() =>
      signIn(),
    ),
  );
}

/** Call the TWise API as the signed-in account, renewing the session once if it expired. */
async function twiseFetch(pathname: string, init: RequestInit = {}): Promise<globalThis.Response> {
  const call = (s: Session) =>
    fetch(`${apiUrl()}${pathname}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${s.token}` } });
  const s = await currentSession();
  const res = await call(s);
  if (res.status !== 401) return res;
  return call(await renewSession(s));
}

const errorStatus = (err: unknown) => (err instanceof AskDataError ? err.status : 502);
const errorMessage = (err: unknown, fallback: string) => (err instanceof AskDataError ? err.message : fallback);

/** Sign in when the server starts, so the first question doesn't wait for it. */
export function warmUpAskData() {
  currentSession().catch((err) => console.warn(errorMessage(err, "Ask Data sign-in failed.")));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const askDataRouter = express.Router();

/** GET /api/askdata/status -> {connected: true} or {connected: false, error} */
askDataRouter.get("/status", async (_req, res) => {
  try {
    await currentSession();
    res.json({ connected: true });
  } catch (err) {
    res.json({ connected: false, error: errorMessage(err, "Couldn't sign in to Ask Data.") });
  }
});

/** GET /api/askdata/starters -> string[] (suggested questions) */
askDataRouter.get("/starters", async (_req, res) => {
  try {
    const upstream = await twiseFetch("/ai/askdata/starters");
    if (!upstream.ok) {
      res.status(502).json({ error: await upstreamError(upstream, "Couldn't load suggestions.") });
      return;
    }
    const list = (await upstream.json()) as unknown;
    res.json(Array.isArray(list) ? list.filter((q): q is string => typeof q === "string") : []);
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err, "Couldn't reach Ask Data.") });
  }
});

/** Pick a readable message out of a `clarify` event, whatever its exact shape. */
function clarifyText(data: unknown): string {
  if (typeof data === "string") return data;
  const d = data as { question?: unknown; message?: unknown; text?: unknown; options?: unknown } | null;
  const text = [d?.question, d?.message, d?.text].find((v) => typeof v === "string") as string | undefined;
  const options = Array.isArray(d?.options)
    ? d.options.map((o) => (typeof o === "string" ? o : (o as { label?: unknown })?.label)).filter((o) => typeof o === "string")
    : [];
  return [text ?? "Could you clarify your question?", ...options.map((o) => `- ${o}`)].join("\n");
}

/**
 * POST /api/askdata/ask — runs an Ask Data question and re-streams it as NDJSON:
 *   {"type":"status","text"} {"type":"token","text"} {"type":"sql","sql"}
 *   {"type":"result","columns","rows","totalRows"} {"type":"insights","items"}
 *   {"type":"followups","items"} {"type":"done","conversationId"} {"type":"error","message"}
 */
askDataRouter.post("/ask", async (req, res) => {
  const { question, conversationId } = (req.body ?? {}) as { question?: unknown; conversationId?: unknown };
  if (typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "Type a question." });
    return;
  }

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  let upstream: globalThis.Response;
  try {
    upstream = await twiseFetch("/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: typeof conversationId === "number" ? conversationId : null,
        sourceType: null,
        sourceId: null,
        question: question.trim(),
        spec: null,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (!controller.signal.aborted) {
      res.status(errorStatus(err)).json({ error: errorMessage(err, "Couldn't reach Ask Data.") });
    }
    return;
  }
  if (!upstream.ok || !upstream.body) {
    res.status(502).json({ error: await upstreamError(upstream, `Ask Data failed (HTTP ${upstream.status}).`) });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  const send = (event: object) => res.write(JSON.stringify(event) + "\n");

  const handle = (type: string, data: unknown) => {
    switch (type) {
      case "status":
        if (typeof data === "string") send({ type: "status", text: data });
        break;
      case "answer":
        if (typeof data === "string" && data) send({ type: "token", text: data });
        break;
      case "clarify":
        send({ type: "token", text: clarifyText(data) });
        break;
      case "sql": {
        const sql = typeof data === "string" ? data : (data as { sql?: unknown })?.sql;
        if (typeof sql === "string") send({ type: "sql", sql });
        break;
      }
      case "result": {
        const r = data as { columns?: unknown; rows?: unknown; totalRows?: unknown } | null;
        if (Array.isArray(r?.columns) && Array.isArray(r?.rows)) {
          send({
            type: "result",
            columns: r.columns.map(String),
            rows: r.rows.slice(0, MAX_ROWS),
            totalRows: typeof r.totalRows === "number" ? r.totalRows : r.rows.length,
          });
        }
        break;
      }
      case "insights":
      case "followups":
        if (Array.isArray(data)) send({ type, items: data.filter((s) => typeof s === "string") });
        break;
      case "error":
        send({ type: "error", message: typeof data === "string" ? data : "Ask Data couldn't answer that." });
        break;
      case "done": {
        const d = data as { conversationId?: unknown } | null;
        send({ type: "done", conversationId: typeof d?.conversationId === "number" ? d.conversationId : null });
        break;
      }
      // spec, chartspec, trace, suggestions, choices: not shown in this UI.
    }
  };

  try {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split: RegExpExecArray | null;
      while ((split = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, split.index);
        buffer = buffer.slice(split.index + split[0].length);
        const type = /^event: ?(.+)$/m.exec(block)?.[1]?.trim();
        const dataLines = [...block.matchAll(/^data: ?(.*)$/gm)].map((m) => m[1]);
        if (!type || !dataLines.length) continue;
        let data: unknown;
        try {
          data = JSON.parse(dataLines.join("\n"));
        } catch {
          data = dataLines.join("\n");
        }
        handle(type, data);
      }
    }
  } catch {
    if (!controller.signal.aborted) send({ type: "error", message: "The Ask Data stream was interrupted." });
  } finally {
    res.end();
  }
});
