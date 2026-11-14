import type { Request, Response } from "express";
import type { LogEvent, Project, ProjectStatus } from "@protoforge/shared";

/**
 * Per-project event bus. Pipelines publish logs/snapshots; SSE clients subscribe.
 * Snapshots are throttled to at most one every SNAPSHOT_MS per project (trailing edge, latest state wins).
 */
const SNAPSHOT_MS = 250;
const BACKLOG = 300;
const HEARTBEAT_MS = 15_000;

interface Bus {
  clients: Set<Response>;
  backlog: LogEvent[];
  snapshotTimer: NodeJS.Timeout | null;
  getProject: (() => Project | null) | null;
}

const buses = new Map<string, Bus>();

function bus(projectId: string): Bus {
  let b = buses.get(projectId);
  if (!b) {
    b = { clients: new Set(), backlog: [], snapshotTimer: null, getProject: null };
    buses.set(projectId, b);
  }
  return b;
}

function write(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* client went away; cleanup happens on 'close' */
  }
}

function broadcast(projectId: string, event: string, data: unknown): void {
  const b = buses.get(projectId);
  if (!b) return;
  for (const res of b.clients) write(res, event, data);
}

/** Record a log line in the in-memory backlog and push it to subscribers. */
export function publishLog(projectId: string, ev: LogEvent): void {
  const b = bus(projectId);
  b.backlog.push(ev);
  if (b.backlog.length > BACKLOG) b.backlog.splice(0, b.backlog.length - BACKLOG);
  broadcast(projectId, "log", ev);
}

/** Register the live project accessor used for throttled snapshots. */
export function setProjectSource(projectId: string, getProject: () => Project | null): void {
  bus(projectId).getProject = getProject;
}

/** Schedule a snapshot push (throttled). */
export function scheduleSnapshot(projectId: string): void {
  const b = bus(projectId);
  if (b.snapshotTimer) return;
  b.snapshotTimer = setTimeout(() => {
    b.snapshotTimer = null;
    const p = b.getProject?.();
    if (p && b.clients.size) broadcast(projectId, "snapshot", p);
  }, SNAPSHOT_MS);
}

/** Flush a snapshot immediately and send the done event. */
export function publishDone(projectId: string, status: ProjectStatus): void {
  const b = bus(projectId);
  if (b.snapshotTimer) {
    clearTimeout(b.snapshotTimer);
    b.snapshotTimer = null;
  }
  const p = b.getProject?.();
  if (p) broadcast(projectId, "snapshot", p);
  broadcast(projectId, "done", { status });
}

/** In-memory log backlog (last 300 lines) if this process has seen the project. */
export function backlogFor(projectId: string): LogEvent[] | null {
  const b = buses.get(projectId);
  return b && b.backlog.length ? [...b.backlog] : null;
}

export function dropBus(projectId: string): void {
  const b = buses.get(projectId);
  if (!b) return;
  if (b.snapshotTimer) clearTimeout(b.snapshotTimer);
  for (const res of b.clients) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  buses.delete(projectId);
}

/**
 * Attach an SSE client: sends the current snapshot, then the log backlog, then live events.
 * If the project already finished, also sends "done" right away so the client can close.
 */
export function attachStream(req: Request, res: Response, project: Project, logs: LogEvent[]): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`retry: 3000\n\n`);

  const b = bus(project.id);
  write(res, "snapshot", b.getProject?.() || project);
  for (const ev of logs.slice(-BACKLOG)) write(res, "log", ev);

  const live = b.getProject?.() || project;
  if (live.status === "done" || live.status === "error") write(res, "done", { status: live.status });

  b.clients.add(res);
  const hb = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      /* ignore */
    }
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(hb);
    b.clients.delete(res);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
}

/**
 * SSE for serverless hosts: the pipeline may be running in a different function instance, so instead of the
 * in-process bus this polls the store and forwards changes. Closes after `maxMs`; EventSource reconnects.
 */
export function attachPollingStream(
  req: Request,
  res: Response,
  project: Project,
  logs: LogEvent[],
  opts: {
    load: () => Promise<Project | null>;
    logs: () => Promise<LogEvent[]>;
    onTick?: (p: Project) => void;
    intervalMs?: number;
    maxMs?: number;
  },
): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`retry: 2000\n\n`);

  const key = (l: LogEvent) => `${l.ts}|${l.agentId || ""}|${l.message}`;
  const seen = new Set<string>();
  write(res, "snapshot", project);
  for (const ev of logs.slice(-BACKLOG)) {
    seen.add(key(ev));
    write(res, "log", ev);
  }
  if (project.status === "done" || project.status === "error") {
    write(res, "done", { status: project.status });
    res.end();
    return;
  }

  let lastUpdated = project.updatedAt;
  let busy = false;
  let closed = false;
  const started = Date.now();
  const maxMs = opts.maxMs ?? 240_000;
  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  const timer = setInterval(async () => {
    if (busy || closed) return;
    busy = true;
    try {
      const p = await opts.load();
      if (!p) return finish();
      if (p.updatedAt !== lastUpdated) {
        lastUpdated = p.updatedAt;
        write(res, "snapshot", p);
      }
      for (const ev of await opts.logs()) {
        const k = key(ev);
        if (seen.has(k)) continue;
        seen.add(k);
        write(res, "log", ev);
      }
      opts.onTick?.(p);
      if (p.status !== "running") {
        write(res, "done", { status: p.status });
        finish();
      } else if (Date.now() - started > maxMs) finish();
      else res.write(`: tick\n\n`);
    } catch (err) {
      console.error("[stream] poll failed:", (err as Error).message);
    } finally {
      busy = false;
    }
  }, opts.intervalMs ?? 2000);
  req.on("close", finish);
  res.on("close", finish);
}
