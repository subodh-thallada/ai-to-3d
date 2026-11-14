import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { CATALOG, type HealthInfo, type Project } from "@protoforge/shared";
import { MODEL_FAST, MODEL_HEAVY, SERVERLESS, WEB_DIST } from "./config";
import { attachPollingStream, attachStream, backlogFor, dropBus } from "./events";
import { anthropicConfigured } from "./llm";
import { getLiveProject, isRunning, refineProject, resumeIfStalled, startProject } from "./pipeline";
import type { ProjectStore } from "./store";


const MAX_PROMPT = 2000;

/** Build the Express app. Used by the long-running server (index.ts) and the Vercel function (vercel.ts). */
export function createApp(store: ProjectStore, mongoError?: string, opts: { serveWeb?: boolean } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  const api = express.Router();

  const loadProject = async (id: string) => getLiveProject(id) || (await store.get(id));
  /** Serverless: continue a pipeline whose invocation ran out of time (no-op elsewhere). */
  const kick = (p: Project) =>
    resumeIfStalled(store, p).catch((err) => {
      console.error("[resume]", (err as Error).message);
      return false;
    });

  api.get("/health", (_req, res) => {
    const info: HealthInfo = {
      ok: true,
      storage: store.kind,
      anthropic: anthropicConfigured(),
      models: { heavy: MODEL_HEAVY, fast: MODEL_FAST },
    };
    if (mongoError) info.mongoError = mongoError;
    res.json(info);
  });

  api.get("/catalog", (_req, res) => {
    res.json(CATALOG);
  });

  api.get("/projects", async (_req, res) => {
    const list = await store.list(50);
    // Running projects: prefer the live in-memory status
    res.json(
      list.map((s) => {
        const p = getLiveProject(s.id);
        return p ? { ...s, status: p.status, name: p.brief?.name ?? s.name, tagline: p.brief?.tagline ?? s.tagline, partCount: p.cad?.parts.length ?? s.partCount } : s;
      }),
    );
  });

  api.post("/projects", async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) return void res.status(400).json({ error: "prompt is required" });
    if (prompt.length > MAX_PROMPT) return void res.status(400).json({ error: `prompt is too long (max ${MAX_PROMPT} characters)` });
    if (!anthropicConfigured()) return void res.status(503).json({ error: "ANTHROPIC_API_KEY is not configured on the server" });
    const project = await startProject(store, prompt);
    res.status(201).json({ id: project.id });
  });

  api.get("/projects/:id", async (req, res) => {
    const p = await loadProject(req.params.id);
    if (!p) return void res.status(404).json({ error: "project not found" });
    if (SERVERLESS && p.status === "running") await kick(p);
    res.json(p);
  });

  api.post("/projects/:id/resume", async (req, res) => {
    const p = await loadProject(req.params.id);
    if (!p) return void res.status(404).json({ error: "project not found" });
    res.json({ resumed: await kick(p) });
  });

  api.delete("/projects/:id", async (req, res) => {
    if (isRunning(req.params.id)) return void res.status(409).json({ error: "project is still generating; wait for it to finish" });
    await store.delete(req.params.id);
    dropBus(req.params.id);
    res.json({ ok: true });
  });

  api.post("/projects/:id/refine", async (req, res) => {
    const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
    if (!instruction) return void res.status(400).json({ error: "instruction is required" });
    if (instruction.length > MAX_PROMPT) return void res.status(400).json({ error: `instruction is too long (max ${MAX_PROMPT} characters)` });
    if (isRunning(req.params.id)) return void res.status(409).json({ error: "project is already generating" });
    if (!anthropicConfigured()) return void res.status(503).json({ error: "ANTHROPIC_API_KEY is not configured on the server" });
    const p = await store.get(req.params.id);
    if (!p) return void res.status(404).json({ error: "project not found" });
    await refineProject(store, p, instruction);
    res.json({ id: p.id });
  });

  api.get("/projects/:id/logs", async (req, res) => {
    const p = await loadProject(req.params.id);
    if (!p) return void res.status(404).json({ error: "project not found" });
    res.json(await store.getLogs(req.params.id));
  });

  api.get("/projects/:id/stream", async (req, res) => {
    const p = await loadProject(req.params.id);
    if (!p) return void res.status(404).json({ error: "project not found" });
    const logs = backlogFor(p.id) || (await store.getLogs(p.id, 300));
    if (!SERVERLESS) return attachStream(req, res, p, logs);
    // Serverless: the pipeline may run in another instance, so poll the store instead of the in-process bus.
    if (p.status === "running") await kick(p);
    attachPollingStream(req, res, p, logs, {
      load: async () => getLiveProject(p.id) || (await store.get(p.id)),
      logs: () => store.getLogs(p.id, 300),
      onTick: (cur) => {
        if (cur.status === "running") void kick(cur);
      },
    });
  });

  api.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  app.use("/api", api);

  // Static web build (production) with SPA fallback
  if (opts.serveWeb !== false && fs.existsSync(path.join(WEB_DIST, "index.html"))) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: "1h" }));
    app.get("/{*splat}", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(WEB_DIST, "index.html"));
    });
    console.log(`[web] serving ${WEB_DIST}`);
  }

  // Error handler: never leak stack traces, never crash.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const status = (err as { status?: number; statusCode?: number })?.status || (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : String(err);
    if (status >= 500) console.error("[http]", message);
    if (res.headersSent) return;
    res.status(status).json({ error: status >= 500 ? `internal error: ${message}` : message });
  });

  return app;
}
