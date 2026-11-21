# Chat AI

A ChatGPT-style chat app for asking questions about your **TWise** data: a **React (Vite)** front end and a small **Express** server that connects to the TWise Ask Data service.

- Answers stream in with progress steps, followed by key insights, the result table, the SQL that ran, and follow-up questions you can click
- Follow-up questions in the same chat keep their context
- Suggested questions on the start screen
- Conversation history in the sidebar, grouped by date and saved in the browser
- Light and dark themes that follow the OS, plus a mobile layout

## Run it

```bash
npm install
cp .env.example .env   # then fill in TWISE_EMAIL and TWISE_PASSWORD
npm run dev
```

Open http://localhost:5173. The dot at the bottom of the sidebar is green when the server is signed in to Ask Data.

`npm run dev` starts both parts:

| Part | Port | Code |
|---|---|---|
| React UI (Vite) | 5173 | `src/` |
| API (Express) | 8787 | `server/` |

Vite forwards `/api/*` to the Express server.

### Production

```bash
npm run build   # type-checks, then builds the UI into dist/
npm start       # Express serves dist/ and /api on http://localhost:8787
```

## Always signed in

The server signs in to TWise with the account in `.env` (`TWISE_EMAIL`, `TWISE_PASSWORD`) when it starts. It keeps the session in memory, renews it with the refresh token when it expires, and signs in again if that fails. The browser never sees the password or the tokens, so there's no sign-in screen.

- Changes to `.env` apply on the next sign-in, without a restart. Click the status row in the sidebar (or **Try again** on the start screen) to retry.
- After a failed sign-in, the same account isn't retried for 30 seconds, so a wrong password can't lock the account.
- Everyone who can open the app asks questions as that one TWise account. Don't expose it publicly without adding auth.

## How it works

`server/askdata.ts` forwards to the TWise APIs, so the browser never calls them directly (no CORS setup needed):

| This app | TWise |
|---|---|
| (server start, session renewal) | `POST {TWISE_AUTH_URL}/auth/login`, `POST {TWISE_AUTH_URL}/auth/refresh-token` |
| `GET /api/askdata/status` | Signs in if needed; returns `{connected, error?}` |
| `GET /api/askdata/starters` | `GET {TWISE_API_URL}/ai/askdata/starters` |
| `POST /api/askdata/ask` | `POST {TWISE_API_URL}/ai/ask` (Server-Sent Events, re-streamed as NDJSON) |

- The hosts default to the QA environment. Set `TWISE_AUTH_URL` and `TWISE_API_URL` in `.env` to point elsewhere.
- Result tables are capped at 200 rows in the browser (the row count shows the full total).
- Charts from Ask Data aren't drawn; the data table and insights are shown instead.
- `src/App.tsx` is the chat screen; `src/components/AskDataDetails.tsx` shows the insights, table, SQL and follow-ups.
