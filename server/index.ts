import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";

import { askDataRouter, warmUpAskData } from "./askdata";

// Settings from .env (see .env.example).
try {
  process.loadEnvFile();
} catch {
  // No .env file.
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// TWise Ask Data: status, suggestions and questions (server/askdata.ts).
app.use("/api/askdata", askDataRouter);

// JSON errors for API requests instead of Express's HTML page.
app.use("/api", (err: { status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  res.status(err.status ?? 500).json({ error: "Bad request." });
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
  warmUpAskData();
});
