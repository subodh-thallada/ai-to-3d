/**
 * Vercel serverless entry (bundled by scripts/build-vercel.mjs into .vercel/output/functions/api.func).
 * One Express app per warm instance; the MongoDB client is reused across invocations.
 * Pipelines run under waitUntil() and are resumable: when an invocation hits its time limit, the next
 * request for that project (GET /api/projects/:id, the stream, or POST /resume) takes the lease and continues.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { createApp } from "./app";
import { setBackgroundRunner } from "./pipeline";
import { initStore } from "./store";

setBackgroundRunner((p) => waitUntil(p));

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let appPromise: Promise<Handler> | null = null;

function getApp(): Promise<Handler> {
  if (!appPromise) {
    appPromise = initStore().then(({ store, mongoError }) => createApp(store, mongoError, { serveWeb: false }) as unknown as Handler);
    appPromise.catch(() => {
      appPromise = null;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Routes rewrite /api/* to this function with the original path in __pf_path (see build-vercel.mjs)
  const url = new URL(req.url || "/", "http://localhost");
  const original = url.searchParams.get("__pf_path");
  if (original) {
    url.searchParams.delete("__pf_path");
    const qs = url.searchParams.toString();
    req.url = original + (qs ? `?${qs}` : "");
  }
  try {
    const app = await getApp();
    app(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: `server failed to start: ${(err as Error)?.message || err}` }));
  }
}
