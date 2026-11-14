import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogEntry, HealthInfo, LogEvent, Project, ProjectStatus, ProjectSummary } from "@protoforge/shared";

/* ------------------------------------------------------------------ */
/* Typed HTTP client                                                   */
/* ------------------------------------------------------------------ */

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch (err) {
    throw new ApiError(`Cannot reach the Protoforge server (${err instanceof Error ? err.message : "network error"})`, 0);
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed: HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    throw new ApiError(msg, res.status);
  }
  if (body === null && text) throw new ApiError("Server returned a non-JSON response", res.status);
  return body as T;
}

export function getHealth(): Promise<HealthInfo> {
  return request<HealthInfo>("/health");
}

export function getCatalog(): Promise<CatalogEntry[]> {
  return request<CatalogEntry[]>("/catalog");
}

export function listProjects(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>("/projects");
}

export function createProject(prompt: string): Promise<{ id: string }> {
  return request<{ id: string }>("/projects", { method: "POST", body: JSON.stringify({ prompt }) });
}

export function getProject(id: string): Promise<Project> {
  return request<Project>(`/projects/${encodeURIComponent(id)}`);
}

export function deleteProject(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function refineProject(id: string, instruction: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/projects/${encodeURIComponent(id)}/refine`, {
    method: "POST",
    body: JSON.stringify({ instruction }),
  });
}

export function getProjectLogs(id: string): Promise<LogEvent[]> {
  return request<LogEvent[]>(`/projects/${encodeURIComponent(id)}/logs`);
}

export function projectStreamUrl(id: string): string {
  return `${BASE}/projects/${encodeURIComponent(id)}/stream`;
}

export const api = {
  health: getHealth,
  catalog: getCatalog,
  listProjects,
  createProject,
  getProject,
  deleteProject,
  refineProject,
  getProjectLogs,
};

/* ------------------------------------------------------------------ */
/* Live project stream (SSE with reconnect + polling fallback)         */
/* ------------------------------------------------------------------ */

export interface ProjectStreamState {
  project: Project | null;
  logs: LogEvent[];
  /** True while an SSE connection is open and delivering events */
  connected: boolean;
  /** "sse" while streaming, "polling" when SSE is unavailable, "idle" once the pipeline finished */
  mode: "sse" | "polling" | "idle";
  /** Load error (e.g. 404) when no project could be fetched */
  error: string | null;
  notFound: boolean;
  /** Re-open the live stream, e.g. after starting a refinement */
  reconnect: () => void;
  /** Apply a project snapshot locally (e.g. optimistic status change) */
  setProject: (p: Project) => void;
}

const MAX_LOGS = 3000;
const POLL_MS = 3000;

function logKey(l: LogEvent): string {
  return `${l.ts}|${l.agentId ?? ""}|${l.level}|${l.message}`;
}

function isFinished(status: ProjectStatus | undefined): boolean {
  return status === "done" || status === "error";
}

/** Guard against partially-written snapshots so views can rely on array fields being arrays. */
function normalizeProject(p: Project): Project {
  const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);
  return {
    ...p,
    agents: arr(p.agents),
    cad: p.cad ? { ...p.cad, units: "mm", parts: arr(p.cad.parts), joints: arr(p.cad.joints) } : p.cad,
    bom: p.bom ? arr(p.bom) : p.bom,
    assembly: p.assembly ? arr(p.assembly) : p.assembly,
    revisions: arr(p.revisions),
    review: p.review ? { ...p.review, checks: arr(p.review.checks), suggestions: arr(p.review.suggestions) } : p.review,
  };
}

function newer(a: Project | null, b: Project): boolean {
  if (!a || a.id !== b.id) return true;
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true;
  return tb >= ta;
}

export function useProjectStream(id: string | undefined): ProjectStreamState {
  const [project, setProjectState] = useState<Project | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<"sse" | "polling" | "idle">("sse");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const projectRef = useRef<Project | null>(null);
  const seenLogs = useRef<Set<string>>(new Set());

  const applyProject = useCallback((p: Project) => {
    if (!p || typeof p !== "object" || typeof p.id !== "string") return;
    if (!newer(projectRef.current, p)) return;
    const next = normalizeProject(p);
    projectRef.current = next;
    setProjectState(next);
    setError(null);
    setNotFound(false);
  }, []);

  const addLogs = useCallback((incoming: LogEvent[]) => {
    const fresh: LogEvent[] = [];
    for (const l of incoming) {
      if (!l || typeof l.message !== "string") continue;
      const k = logKey(l);
      if (seenLogs.current.has(k)) continue;
      seenLogs.current.add(k);
      fresh.push(l);
    }
    if (fresh.length === 0) return;
    setLogs((prev) => {
      const merged = prev.concat(fresh);
      // keep chronological order even when a backlog arrives after live lines
      const needsSort = prev.length > 0 && fresh.some((l) => l.ts < prev[prev.length - 1].ts);
      if (needsSort) merged.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
      return merged.length > MAX_LOGS ? merged.slice(merged.length - MAX_LOGS) : merged;
    });
  }, []);

  // Reset when the project id changes
  useEffect(() => {
    projectRef.current = null;
    seenLogs.current = new Set();
    setProjectState(null);
    setLogs([]);
    setError(null);
    setNotFound(false);
    setConnected(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let polling = false;
    let gone = false;

    const fetchOnce = async (): Promise<Project | null> => {
      try {
        const [p, l] = await Promise.all([getProject(id), getProjectLogs(id).catch(() => [] as LogEvent[])]);
        if (disposed) return null;
        applyProject(p);
        addLogs(l);
        return p;
      } catch (err) {
        if (disposed) return null;
        if (err instanceof ApiError && err.status === 404) {
          gone = true;
          setNotFound(true);
          setError(err.message || "Project not found");
          stopAll();
        } else if (!projectRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return null;
      }
    };

    const stopPolling = () => {
      polling = false;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    };

    const stopAll = () => {
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (es) es.close();
      es = null;
      setConnected(false);
    };

    const pollLoop = async () => {
      if (disposed || !polling) return;
      const p = await fetchOnce();
      if (disposed || !polling) return;
      if (p && isFinished(p.status)) {
        stopPolling();
        setMode("idle");
        return;
      }
      pollTimer = setTimeout(pollLoop, POLL_MS);
    };

    const startPolling = () => {
      if (polling || disposed) return;
      polling = true;
      setMode("polling");
      void pollLoop();
    };

    const open = () => {
      if (disposed || gone) return;
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      const source = new EventSource(projectStreamUrl(id));
      es = source;

      source.onopen = () => {
        if (disposed || es !== source) return;
        failures = 0;
        setConnected(true);
        setMode("sse");
        stopPolling();
      };

      source.addEventListener("snapshot", (ev) => {
        try {
          applyProject(JSON.parse((ev as MessageEvent<string>).data) as Project);
        } catch {
          /* malformed frame — ignore, the next snapshot will correct state */
        }
      });

      source.addEventListener("log", (ev) => {
        try {
          addLogs([JSON.parse((ev as MessageEvent<string>).data) as LogEvent]);
        } catch {
          /* ignore malformed log frame */
        }
      });

      source.addEventListener("done", () => {
        // Server keeps the connection open; the client closes it. A final snapshot was already sent.
        if (es === source) {
          source.close();
          es = null;
        }
        setConnected(false);
        setMode("idle");
        // make sure the final state is in (snapshot debounce may lag the done event)
        void fetchOnce();
      });

      source.onerror = () => {
        if (disposed || es !== source) return;
        source.close();
        es = null;
        setConnected(false);
        failures += 1;
        if (isFinished(projectRef.current?.status)) {
          setMode("idle");
          return;
        }
        // SSE unavailable (proxy, 404, server restart): keep data fresh by polling while we retry
        if (failures >= 2 || !projectRef.current) startPolling();
        const delay = Math.min(1000 * 2 ** (failures - 1), 15000);
        reconnectTimer = setTimeout(open, delay);
      };
    };

    setMode("sse");
    void fetchOnce().then((p) => {
      if (disposed) return;
      // Do not hold a stream open for a finished project we already loaded in full
      if (p && isFinished(p.status) && epoch === 0) {
        setMode("idle");
        return;
      }
      open();
    });

    return () => {
      disposed = true;
      stopAll();
    };
  }, [id, epoch, applyProject, addLogs]);

  const reconnect = useCallback(() => setEpoch((e) => e + 1), []);

  const forceProject = useCallback((p: Project) => {
    projectRef.current = p;
    setProjectState(p);
  }, []);

  return { project, logs, connected, mode, error, notFound, reconnect, setProject: forceProject };
}
