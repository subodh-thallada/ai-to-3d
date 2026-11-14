// Copies projects (and their logs) from the local file store (server/data) and server/seed into MongoDB.
// Usage: cd server && npx tsx --env-file=.env src/scripts/import.ts
import fs from "node:fs";
import path from "node:path";
import type { LogEvent, Project } from "@protoforge/shared";
import { DATA_DIR, SEED_DIR } from "../config";
import { MongoStore } from "../store";

async function main() {
  const store = await MongoStore.connect(process.env.MONGODB_URI!, process.env.MONGODB_DB || "protoforge");
  const projects = new Map<string, Project>();
  const file = path.join(DATA_DIR, "projects.json");
  if (fs.existsSync(file)) for (const p of Object.values(JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Project>)) projects.set(p.id, p);
  if (fs.existsSync(SEED_DIR))
    for (const f of fs.readdirSync(SEED_DIR).filter((x) => x.endsWith(".json"))) {
      const p = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), "utf8")) as Project;
      if (!projects.has(p.id)) projects.set(p.id, p);
    }
  const logsFile = path.join(DATA_DIR, "logs.json");
  const logs: Record<string, LogEvent[]> = fs.existsSync(logsFile) ? JSON.parse(fs.readFileSync(logsFile, "utf8")) : {};
  for (const p of projects.values()) {
    if (p.status === "running" || p.status === "queued") {
      // interrupted locally: keep whatever finished
      p.status = p.cad?.parts?.length ? "done" : "error";
      for (const a of p.agents) if (a.status === "running" || a.status === "pending") a.status = "skipped";
    }
    delete p.lease;
    await store.save(p);
    const existing = await store.getLogs(p.id, 1);
    if (!existing.length) for (const ev of logs[p.id] || []) await store.appendLog(p.id, ev);
    console.log(`imported ${p.id} "${p.prompt}" status=${p.status} parts=${p.cad?.parts.length ?? 0} logs=${(logs[p.id] || []).length}`);
  }
  await store.close();
}
main().catch((e) => {
  console.error("IMPORT FAILED:", e?.message || e);
  process.exit(1);
});
