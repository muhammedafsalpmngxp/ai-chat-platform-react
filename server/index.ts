import Anthropic from "@anthropic-ai/sdk";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

import { chatGraph } from "./graph";
import { describeError, isProvider, resolveApiKey } from "./settings";

// Optional server-side fallback keys from .env (see .env.example).
try {
  process.loadEnvFile();
} catch {
  // No .env file — users connect their key in Settings.
}

const app = express();
app.use(express.json({ limit: "5mb" }));

interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  provider: unknown;
  model: string;
  apiKey?: string;
  systemPrompt?: string;
}

/** Pull plain text out of a streamed chunk (string, or content blocks incl. thinking). */
function chunkText(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((block) => (block.type === "text" && "text" in block ? String(block.text) : ""))
    .join("");
}

/**
 * POST /api/chat — runs the LangGraph chat graph and streams NDJSON events:
 *   {"type":"token","text":"..."} ... {"type":"done"}  or  {"type":"error","message":"..."}
 */
app.post("/api/chat", async (req, res) => {
  const body = req.body as ChatRequest;

  if (!isProvider(body.provider)) {
    res.status(400).json({ error: "Unknown provider." });
    return;
  }
  const apiKey = resolveApiKey(body.provider, body.apiKey);
  if (!apiKey) {
    res.status(401).json({ error: "No API key set. Open Settings and connect your API key." });
    return;
  }
  if (!body.model?.trim()) {
    res.status(400).json({ error: "No model selected." });
    return;
  }

  const messages = (body.messages ?? []).map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
  );

  // Stop the model call when the browser hits "Stop" or disconnects.
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  const send = (event: object) => res.write(JSON.stringify(event) + "\n");

  try {
    const events = await chatGraph.stream(
      { messages },
      {
        streamMode: "messages",
        signal: controller.signal,
        configurable: {
          provider: body.provider,
          apiKey,
          model: body.model.trim(),
          systemPrompt: body.systemPrompt,
        },
      },
    );

    let refused = false;
    for await (const [chunk] of events) {
      const text = chunkText(chunk.content);
      if (text) send({ type: "token", text });
      const meta = chunk.response_metadata as { stop_reason?: string } | undefined;
      if (meta?.stop_reason === "refusal") refused = true;
    }
    if (refused) send({ type: "token", text: "\n\n_The model declined to answer this request._" });
    send({ type: "done" });
  } catch (err) {
    if (!controller.signal.aborted) send({ type: "error", message: describeError(err) });
  } finally {
    res.end();
  }
});

/**
 * POST /api/models — "Test" button in Settings.
 * Lists the models the key can use (no tokens spent), which also proves the key works.
 */
app.post("/api/models", async (req, res) => {
  const { provider, apiKey: fromClient } = req.body as { provider: unknown; apiKey?: string };
  if (!isProvider(provider)) {
    res.status(400).json({ ok: false, error: "Unknown provider." });
    return;
  }
  const apiKey = resolveApiKey(provider, fromClient);
  if (!apiKey) {
    res.status(400).json({ ok: false, error: "Enter an API key first." });
    return;
  }

  try {
    let models: string[] = [];
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      for await (const m of client.models.list()) models.push(m.id);
    } else {
      const client = new OpenAI({ apiKey });
      for await (const m of client.models.list()) models.push(m.id);
      // Keep chat-capable families; drop embeddings, audio, image, moderation, etc.
      models = models
        .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id))
        .filter((id) => !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(id))
        .sort();
    }
    res.json({ ok: true, models, usingServerKey: !fromClient?.trim() });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: describeError(err) });
  }
});

// In production, also serve the built React app (`npm run build` -> dist/).
const dist = path.resolve(import.meta.dirname, "../dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// API_PORT (not PORT) so it never collides with the Vite dev server's port.
const port = Number(process.env.API_PORT) || 8787;
app.listen(port, () => {
  console.log(`Chat AI server running at http://localhost:${port}`);
});
