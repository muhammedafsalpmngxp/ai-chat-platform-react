# Chat AI

A ChatGPT-style chat app: **React (Vite)** front end, with a **LangGraph** agent running in a small **Express** server.

- Streaming replies with Markdown, code blocks with a copy button, and a Stop button
- Conversation history in the sidebar, grouped by date and saved in the browser
- **Settings**: pick a provider (Anthropic Claude or OpenAI), connect your API key, test it, pick a model, and edit the system prompt
- Light and dark themes that follow the OS, plus a mobile layout

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **Settings** (bottom left), paste your API key, press **Test**, then **Save**.

`npm run dev` starts both parts:

| Part | Port | Code |
|---|---|---|
| React UI (Vite) | 5173 | `src/` |
| LangGraph API (Express) | 8787 | `server/` |

Vite forwards `/api/*` to the Express server.

### Production

```bash
npm run build   # type-checks, then builds the UI into dist/
npm start       # Express serves dist/ and /api on http://localhost:8787
```

## How it works

```
React UI ──POST /api/chat──▶ Express ──▶ LangGraph StateGraph (START → chat → END)
   ▲                                          │
   └──────── NDJSON token stream ◀────────────┘   ChatAnthropic / ChatOpenAI
```

- `server/graph.ts` holds the LangGraph graph. The `chat` node builds the model from the request's settings (provider, key, model, system prompt), passed in through `config.configurable`. To add tools, retrieval, or routing, add nodes and edges here.
- `server/index.ts` has two routes:
  - `POST /api/chat` streams the graph's output (`streamMode: "messages"`) as NDJSON.
  - `POST /api/models` lists the models your key can use. The Settings **Test** button calls it, and it costs no tokens.
- `src/App.tsx` is the chat screen. `src/components/SettingsModal.tsx` is the settings dialog.

## API keys

- The key you enter in Settings is stored in **this browser's localStorage** and sent with each request to your own server, which passes it to the provider. It is never saved on the server.
- Optional: put fallback keys in a `.env` file (copy `.env.example`). The server uses them when no key is entered in Settings, which is useful for a shared deployment. Don't expose that kind of deployment publicly without adding auth.

## Models

- Anthropic: `claude-opus-5-5` (default), `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`. On Opus 5.5, Sonnet 5.5, and Fable 5.2, server-side refusal fallback (`fallbacks: "default"`) is turned on.
- OpenAI: press **Test** to load the models your key can use, or type any model ID.
