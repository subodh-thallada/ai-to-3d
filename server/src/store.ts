import dns from "node:dns";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { MongoClient, type Collection, type Db } from "mongodb";
import type { LogEvent, Project, ProjectSummary } from "@protoforge/shared";
import { DATA_DIR, SEED_DIR, SERVERLESS } from "./config";

export interface ProjectStore {
  readonly kind: "mongodb" | "memory";
  list(limit?: number): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
  appendLog(projectId: string, ev: LogEvent): Promise<void>;
  getLogs(projectId: string, limit?: number): Promise<LogEvent[]>;
  /** Projects left "running"/"queued" by a previous process can never finish: mark them as errored. */
  markInterrupted(): Promise<number>;
  /** Atomically take the execution lease of a running project if it is free or expired. */
  acquireLease(id: string, owner: string, until: string): Promise<boolean>;
  close(): Promise<void>;
}

export function summarize(p: Project): ProjectSummary {
  const cost = (p.bom || []).reduce((s, b) => s + (Number(b.qty) || 0) * (Number(b.unitPrice) || 0), 0);
  return {
    id: p.id,
    prompt: p.prompt,
    name: p.brief?.name,
    tagline: p.brief?.tagline,
    category: p.brief?.category,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    partCount: p.cad?.parts?.length,
    costUsd: p.bom ? Math.round(cost * 100) / 100 : undefined,
    score: p.review?.score,
  };
}

function stripMongoId<T extends object>(doc: T): T {
  const { _id, ...rest } = doc as T & { _id?: unknown };
  void _id;
  return rest as T;
}

const LOG_CAP = 2000;

/* ------------------------------------------------------------------ */
/* MongoDB                                                             */
/* ------------------------------------------------------------------ */

type ProjectDoc = Project & { _id: string };
type LogDoc = LogEvent & { projectId: string };

export class MongoStore implements ProjectStore {
  readonly kind = "mongodb" as const;
  private projects: Collection<ProjectDoc>;
  private logs: Collection<LogDoc>;

  private constructor(private client: MongoClient, db: Db) {
    this.projects = db.collection<ProjectDoc>("projects");
    this.logs = db.collection<LogDoc>("logs");
  }

  static async connect(uri: string, dbName: string): Promise<MongoStore> {
    await ensureSrvResolvable(uri);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
    try {
      await client.connect();
      const db = client.db(dbName);
      await db.command({ ping: 1 });
      const store = new MongoStore(client, db);
      await store.logs.createIndex({ projectId: 1, ts: 1 });
      await store.projects.createIndex({ createdAt: -1 });
      return store;
    } catch (err) {
      await client.close().catch(() => undefined);
      throw err;
    }
  }

  async acquireLease(id: string, owner: string, until: string): Promise<boolean> {
    const now = new Date().toISOString();
    const r = await this.projects.updateOne(
      { _id: id, status: "running", $or: [{ lease: { $exists: false } }, { "lease.until": { $lt: now } }] },
      { $set: { lease: { owner, until } } },
    );
    return r.modifiedCount === 1;
  }

  async list(limit = 50): Promise<ProjectSummary[]> {
    const rows = await this.projects
      .aggregate<ProjectSummary>([
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            id: 1,
            prompt: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            name: "$brief.name",
            tagline: "$brief.tagline",
            category: "$brief.category",
            score: "$review.score",
            partCount: { $cond: [{ $isArray: "$cad.parts" }, { $size: "$cad.parts" }, "$$REMOVE"] },
            costUsd: {
              $cond: [
                { $isArray: "$bom" },
                {
                  $round: [
                    {
                      $sum: {
                        $map: {
                          input: "$bom",
                          as: "b",
                          in: { $multiply: [{ $ifNull: ["$$b.qty", 0] }, { $ifNull: ["$$b.unitPrice", 0] }] },
                        },
                      },
                    },
                    2,
                  ],
                },
                "$$REMOVE",
              ],
            },
          },
        },
      ])
      .toArray();
    return rows;
  }

  async get(id: string): Promise<Project | null> {
    const doc = await this.projects.findOne({ _id: id });
    return doc ? stripMongoId(doc) : null;
  }

  async save(project: Project): Promise<void> {
    const doc: ProjectDoc = { ...project, _id: project.id };
    await this.projects.replaceOne({ _id: project.id }, doc, { upsert: true });
  }

  async delete(id: string): Promise<boolean> {
    const r = await this.projects.deleteOne({ _id: id });
    await this.logs.deleteMany({ projectId: id });
    return r.deletedCount > 0;
  }

  async count(): Promise<number> {
    return this.projects.countDocuments();
  }

  async appendLog(projectId: string, ev: LogEvent): Promise<void> {
    await this.logs.insertOne({ ...ev, projectId });
  }

  async getLogs(projectId: string, limit = LOG_CAP): Promise<LogEvent[]> {
    const rows = await this.logs.find({ projectId }).sort({ ts: -1, _id: -1 }).limit(limit).toArray();
    return rows.reverse().map((r) => {
      const { _id, projectId: _p, ...ev } = r as LogDoc & { _id: unknown };
      void _id;
      void _p;
      return ev as LogEvent;
    });
  }

  async markInterrupted(): Promise<number> {
    const r = await this.projects.updateMany(
      { status: { $in: ["running", "queued"] } },
      { $set: { status: "error", error: "Interrupted: the server restarted while this project was generating.", updatedAt: new Date().toISOString() } },
    );
    return r.modifiedCount;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/* ------------------------------------------------------------------ */
/* File store (fallback)                                               */
/* ------------------------------------------------------------------ */

export class FileStore implements ProjectStore {
  readonly kind = "memory" as const;
  private projects = new Map<string, Project>();
  private logs = new Map<string, LogEvent[]>();
  private file: string;
  private logsFile: string;
  private writeTimer: NodeJS.Timeout | null = null;
  private logTimer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private dir: string = DATA_DIR) {
    this.file = path.join(dir, "projects.json");
    this.logsFile = path.join(dir, "logs.json");
    fs.mkdirSync(dir, { recursive: true });
    this.projects = new Map(Object.entries(readJson<Record<string, Project>>(this.file) || {}));
    this.logs = new Map(Object.entries(readJson<Record<string, LogEvent[]>>(this.logsFile) || {}));
  }

  async list(limit = 50): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, limit)
      .map(summarize);
  }

  async acquireLease(id: string, owner: string, until: string): Promise<boolean> {
    const p = this.projects.get(id);
    if (!p || p.status !== "running") return false;
    if (p.lease && Date.parse(p.lease.until) > Date.now()) return false;
    p.lease = { owner, until };
    await this.save(p);
    return true;
  }

  async get(id: string): Promise<Project | null> {
    const p = this.projects.get(id);
    return p ? structuredClone(p) : null;
  }

  async save(project: Project): Promise<void> {
    this.projects.set(project.id, structuredClone(project));
    this.scheduleWrite();
  }

  async delete(id: string): Promise<boolean> {
    const had = this.projects.delete(id);
    this.logs.delete(id);
    this.scheduleWrite();
    this.scheduleLogWrite();
    return had;
  }

  async count(): Promise<number> {
    return this.projects.size;
  }

  async appendLog(projectId: string, ev: LogEvent): Promise<void> {
    let arr = this.logs.get(projectId);
    if (!arr) this.logs.set(projectId, (arr = []));
    arr.push(ev);
    if (arr.length > LOG_CAP) arr.splice(0, arr.length - LOG_CAP);
    this.scheduleLogWrite();
  }

  async getLogs(projectId: string, limit = LOG_CAP): Promise<LogEvent[]> {
    const arr = this.logs.get(projectId) || [];
    return arr.slice(-limit);
  }

  async markInterrupted(): Promise<number> {
    let n = 0;
    for (const p of this.projects.values()) {
      if (p.status === "running" || p.status === "queued") {
        p.status = "error";
        p.error = "Interrupted: the server restarted while this project was generating.";
        p.updatedAt = new Date().toISOString();
        n++;
      }
    }
    if (n) this.scheduleWrite();
    return n;
  }

  async close(): Promise<void> {
    await this.flush();
  }

  /** Write everything now (used on shutdown). */
  async flush(): Promise<void> {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    if (this.logTimer) clearTimeout(this.logTimer);
    this.writeTimer = this.logTimer = null;
    await this.enqueue(() => writeJsonAtomic(this.file, Object.fromEntries(this.projects)));
    await this.enqueue(() => writeJsonAtomic(this.logsFile, Object.fromEntries(this.logs)));
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.writing = this.writing.then(fn).catch((err) => console.error("[store] write failed:", err?.message || err));
    return this.writing;
  }

  private scheduleWrite() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.enqueue(() => writeJsonAtomic(this.file, Object.fromEntries(this.projects)));
    }, 300);
  }

  private scheduleLogWrite() {
    if (this.logTimer) return;
    this.logTimer = setTimeout(() => {
      this.logTimer = null;
      void this.enqueue(() => writeJsonAtomic(this.logsFile, Object.fromEntries(this.logs)));
    }, 1500);
  }
}

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    console.error(`[store] could not read ${file}: ${(err as Error).message}`);
    // Keep the unreadable file for inspection instead of overwriting it silently.
    try {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      /* ignore */
    }
    return null;
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  const json = JSON.stringify(data);
  await fsp.writeFile(tmp, json, "utf8");
  try {
    await fsp.rename(tmp, file);
  } catch {
    // Windows can refuse to replace a file that is momentarily open elsewhere (AV scanners); write directly.
    await fsp.writeFile(file, json, "utf8");
    await fsp.rm(tmp, { force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

/**
 * Some routers' DNS servers drop SRV queries (querySrv ENODATA), which breaks mongodb+srv:// URIs.
 * If the system resolver cannot resolve the SRV record, fall back to public resolvers.
 */
async function ensureSrvResolvable(uri: string): Promise<void> {
  const m = uri.match(/^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?]+)/);
  if (!m) return;
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${m[1]}`);
  } catch {
    dns.setServers(["1.1.1.1", "8.8.8.8", ...dns.getServers()]);
    console.warn("[store] system DNS could not resolve the MongoDB SRV record; using public resolvers (1.1.1.1, 8.8.8.8)");
  }
}

export interface StoreInit {
  store: ProjectStore;
  mongoError?: string;
}

export async function initStore(): Promise<StoreInit> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "protoforge";
  let store: ProjectStore;
  let mongoError: string | undefined;
  if (uri) {
    try {
      store = await MongoStore.connect(uri, dbName);
      console.log(`[store] connected to MongoDB (db=${dbName})`);
    } catch (err) {
      mongoError = (err as Error)?.message || String(err);
      console.warn(`[store] MongoDB unavailable (${mongoError}); using local file store at ${DATA_DIR}`);
      store = new FileStore();
    }
  } else {
    mongoError = "MONGODB_URI not set";
    console.log(`[store] MONGODB_URI not set; using local file store at ${DATA_DIR}`);
    store = new FileStore();
  }

  // In serverless mode a "running" project belongs to an invocation that may still be alive or will be resumed.
  if (!SERVERLESS) try {
    const n = await store.markInterrupted();
    if (n) console.log(`[store] marked ${n} interrupted project(s) as error`);
  } catch (err) {
    console.warn("[store] markInterrupted failed:", (err as Error).message);
  }

  await loadSeeds(store);
  return { store, mongoError };
}

/** Load seed/*.json into an empty store so the gallery is never empty. */
async function loadSeeds(store: ProjectStore): Promise<void> {
  try {
    if ((await store.count()) > 0) return;
    if (!fs.existsSync(SEED_DIR)) return;
    const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".json"));
    let n = 0;
    for (const f of files) {
      const p = readJson<Project>(path.join(SEED_DIR, f));
      if (p && typeof p.id === "string" && typeof p.prompt === "string") {
        if (p.status === "running" || p.status === "queued") p.status = "done";
        await store.save(p);
        n++;
      }
    }
    if (n) console.log(`[store] loaded ${n} seed project(s)`);
  } catch (err) {
    console.warn("[store] seed load failed:", (err as Error).message);
  }
}
