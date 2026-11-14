import { nanoid } from "nanoid";
import type {
  AgentRun,
  BomItem,
  CadModel,
  CadPart,
  ElectronicsSpec,
  FirmwareSpec,
  LogEvent,
  ProductBrief,
  Project,
  ReviewReport,
  StageId,
  SubsystemPlan,
} from "@protoforge/shared";
import { effortFor, FUNCTION_BUDGET_MS, modelFor, SERVERLESS, type AgentKey } from "./config";
import { publishDone, publishLog, scheduleSnapshot, setProjectSource } from "./events";
import { callStructured, LlmError } from "./llm";
import {
  approxSize,
  arr,
  asObj,
  isObj,
  makePartResolver,
  normalizeAgentReview,
  normalizeAssembly,
  normalizeBom,
  normalizeBrief,
  normalizeCadOutput,
  normalizeElectronics,
  normalizeFirmware,
  normalizeJoints,
  str,
  vec3,
  type CadPartsResult,
} from "./normalize";
import * as P from "./prompts";
import { deterministicReview } from "./review";
import * as S from "./schemas";
import type { ProjectStore } from "./store";

/* ------------------------------------------------------------------ */
/* Live project registry                                               */
/* ------------------------------------------------------------------ */

/** Projects currently generating (authoritative in-memory copy). */
const live = new Map<string, Project>();

export function getLiveProject(id: string): Project | null {
  return live.get(id) || null;
}

export function isRunning(id: string): boolean {
  return live.has(id);
}

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Semantic checks per tool: an unusable answer is retried with feedback instead of failing the agent. */
const VALIDATORS: Record<string, (d: unknown) => string | null> = {
  submit_brief: (d) => (arr(asObj(d).subsystems).some(isObj) ? null : "the subsystems array is missing or empty"),
  submit_subsystem_cad: (d) => (arr(asObj(d).parts).some(isObj) ? null : "the parts array is missing or empty"),
  submit_bom: (d) => (arr(asObj(d).items).some(isObj) ? null : "the items array is missing or empty"),
  submit_electronics: (d) => (arr(asObj(d).components).some(isObj) ? null : "the components array is missing or empty"),
  submit_firmware: (d) =>
    arr(asObj(d).files).some((f) => isObj(f) && typeof f.content === "string" && f.content.trim().length > 0)
      ? null
      : "no source files with content",
  submit_assembly: (d) => (arr(asObj(d).steps).some(isObj) ? null : "the steps array is missing or empty"),
};

/* ------------------------------------------------------------------ */
/* Run context                                                         */
/* ------------------------------------------------------------------ */

class Run {
  private saving: Promise<void> = Promise.resolve();
  private dirty = false;
  private saveQueued = false;
  readonly startedAt = Date.now();

  constructor(readonly store: ProjectStore, readonly project: Project) {}

  log(level: LogEvent["level"], message: string, agentId?: string): void {
    const ev: LogEvent = { ts: nowIso(), level, message };
    if (agentId) ev.agentId = agentId;
    publishLog(this.project.id, ev);
    this.store.appendLog(this.project.id, ev).catch(() => undefined);
    const tag = `[${this.project.id}]${agentId ? ` ${agentId}` : ""}`;
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`${tag} ${message}`);
  }

  /** Mark the project changed: push a snapshot (throttled) and persist (coalesced, ordered). */
  touch(): void {
    this.project.updatedAt = nowIso();
    scheduleSnapshot(this.project.id);
    this.persist();
  }

  persist(): Promise<void> {
    this.dirty = true;
    if (this.saveQueued) return this.saving;
    this.saveQueued = true;
    this.saving = this.saving.then(async () => {
      this.saveQueued = false;
      if (!this.dirty) return;
      this.dirty = false;
      try {
        await this.store.save(this.project);
      } catch (err) {
        console.error(`[${this.project.id}] save failed:`, (err as Error).message);
      }
    });
    return this.saving;
  }

  async flush(): Promise<void> {
    await this.persist();
    await this.saving;
  }

  agent(id: string, stage: StageId, name: string, role: string, parentId?: string): AgentRun {
    const existing = this.project.agents.find((x) => x.id === id);
    if (existing) return existing; // resumed run: keep status/results of finished agents
    const a: AgentRun = { id, stage, name, role, status: "pending" };
    if (parentId) a.parentId = parentId;
    this.project.agents.push(a);
    return a;
  }

  start(a: AgentRun, model?: string): void {
    a.status = "running";
    a.startedAt = nowIso();
    if (model) a.model = model;
    delete a.error;
    this.log("info", `${a.name}: started${model ? ` (${model})` : ""}`, a.id);
    this.touch();
  }

  done(a: AgentRun, summary: string, tokensIn?: number, tokensOut?: number): void {
    a.status = "done";
    a.endedAt = nowIso();
    a.summary = summary;
    if (tokensIn !== undefined) a.tokensIn = (a.tokensIn || 0) + tokensIn;
    if (tokensOut !== undefined) a.tokensOut = (a.tokensOut || 0) + tokensOut;
    this.log("info", `${a.name}: ${summary} (${this.secs(a)}s)`, a.id);
    this.touch();
  }

  fail(a: AgentRun, err: unknown): void {
    a.status = "error";
    a.endedAt = nowIso();
    a.error = err instanceof Error ? err.message : String(err);
    if (err instanceof LlmError) {
      a.tokensIn = (a.tokensIn || 0) + err.tokensIn;
      a.tokensOut = (a.tokensOut || 0) + err.tokensOut;
    }
    this.log("error", `${a.name} failed: ${a.error}`, a.id);
    this.touch();
  }

  skip(a: AgentRun, reason: string): void {
    a.status = "skipped";
    a.summary = reason;
    a.endedAt = nowIso();
    this.log("info", `${a.name}: skipped (${reason})`, a.id);
    this.touch();
  }

  secs(a: AgentRun): string {
    if (!a.startedAt) return "0";
    return r1(((a.endedAt ? Date.parse(a.endedAt) : Date.now()) - Date.parse(a.startedAt)) / 1000).toFixed(1);
  }

  /** Run a structured LLM call for an agent with logging of retries. */
  async call<T>(a: AgentRun, key: AgentKey, opts: { system: string; user: string; tool: string; desc: string; schema: Record<string, unknown>; maxTokens: number }) {
    const model = modelFor(key);
    this.start(a, model);
    const res = await callStructured<T>({
      model,
      system: opts.system,
      user: opts.user,
      toolName: opts.tool,
      toolDescription: opts.desc,
      schema: opts.schema,
      maxTokens: opts.maxTokens,
      validate: VALIDATORS[opts.tool],
      effort: effortFor(key),
      onRetry: (attempt, reason) => this.log("warn", `${a.name}: attempt ${attempt} failed (${reason}); retrying`, a.id),
    });
    if (res.model !== model) a.model = res.model;
    if (res.truncated) this.log("warn", `${a.name}: output was truncated; using the partial result`, a.id);
    return res;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers for prompts                                                 */
/* ------------------------------------------------------------------ */

function briefForPrompt(b: ProductBrief): string {
  return JSON.stringify(b, null, 1);
}

function fmtV(v: number[]): string {
  return `(${v.map((n) => r1(n)).join(",")})`;
}

function partsTable(parts: CadPart[], jointCount?: Map<string, number>): string {
  return parts
    .map((p) => {
      const g = p.geometry.type === "component" ? `component:${p.geometry.model}` : p.geometry.type;
      const size = approxSize(p.geometry).map((n) => r1(n)).join("x");
      const rot = p.rotation ? fmtV(p.rotation) : "-";
      const j = jointCount ? ` | ${jointCount.get(p.id) || 0}` : "";
      return `${p.id} | ${p.name} | ${p.subsystem} | ${g} | ${fmtV(p.position)} | ${size} | ${rot}${j}`;
    })
    .join("\n");
}

function normPn(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Deterministic BOM linking for parts the integration agent left unlinked (by part number). */
function autoLinkBom(parts: CadPart[], bom: BomItem[], partNumbers: Map<string, string>): number {
  let n = 0;
  const byPn = bom.filter((b) => b.partNumber).map((b) => ({ b, pn: normPn(b.partNumber!) }));
  const byName = new Map(bom.map((b) => [b.name.toLowerCase(), b]));
  for (const p of parts) {
    if (p.bomId) continue;
    const pn = partNumbers.get(p.id);
    let hit: BomItem | undefined;
    if (pn) {
      const k = normPn(pn);
      hit = byPn.find((x) => x.pn && (x.pn === k || (k.length >= 5 && (x.pn.includes(k) || k.includes(x.pn)))))?.b;
    }
    if (!hit) hit = byName.get(p.name.toLowerCase());
    if (hit) {
      p.bomId = hit.id;
      n++;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export interface RunOptions {
  instruction?: string;
  previousBrief?: ProductBrief;
  /** Continue a pipeline whose previous (serverless) invocation ended: finished agents are skipped. */
  resume?: boolean;
}

/** How background work is kept alive. Serverless hosts install waitUntil here; a normal server just lets it run. */
let backgroundRunner: (p: Promise<unknown>) => void = () => undefined;
export function setBackgroundRunner(fn: (p: Promise<unknown>) => void): void {
  backgroundRunner = fn;
}

/**
 * Serverless only: if a project is "running" but its invocation's lease has expired (the function hit its time
 * limit or was recycled), atomically take the lease and continue the pipeline from where it stopped.
 */
export async function resumeIfStalled(store: ProjectStore, project: Project): Promise<boolean> {
  if (!SERVERLESS || project.status !== "running" || live.has(project.id)) return false;
  if (project.lease && Date.parse(project.lease.until) > Date.now()) return false;
  const owner = nanoid(8);
  const until = new Date(Date.now() + FUNCTION_BUDGET_MS + 5000).toISOString();
  if (!(await store.acquireLease(project.id, owner, until))) return false;
  const fresh = (await store.get(project.id)) || project;
  fresh.lease = { owner, until };
  const last = fresh.revisions?.at(-1);
  const archDone = fresh.agents.some((a) => a.id === "architect" && a.status === "done");
  launch(store, fresh, { resume: true, instruction: last?.instruction, previousBrief: last && !archDone ? fresh.brief : undefined });
  return true;
}

/** Create a new project and start its pipeline asynchronously. */
export async function startProject(store: ProjectStore, prompt: string): Promise<Project> {
  const ts = nowIso();
  const project: Project = { id: nanoid(10), prompt, status: "running", createdAt: ts, updatedAt: ts, agents: [] };
  await store.save(project);
  launch(store, project, {});
  return project;
}

/** Re-run the pipeline on an existing project with a refinement instruction. */
export async function refineProject(store: ProjectStore, project: Project, instruction: string): Promise<Project> {
  project.revisions = [...(project.revisions || []), { instruction, at: nowIso() }];
  project.status = "running";
  delete project.error;
  project.updatedAt = nowIso();
  await store.save(project);
  launch(store, project, { instruction, previousBrief: project.brief });
  return project;
}

function launch(store: ProjectStore, project: Project, opts: RunOptions): void {
  if (SERVERLESS && !project.lease) {
    project.lease = { owner: nanoid(8), until: new Date(Date.now() + FUNCTION_BUDGET_MS + 5000).toISOString() };
  }
  live.set(project.id, project);
  setProjectSource(project.id, () => live.get(project.id) || null);
  const run = new Run(store, project);
  const p = runPipeline(run, opts)
    .catch((err) => {
      project.status = "error";
      project.error = `Pipeline crashed: ${(err as Error)?.message || err}`;
      run.log("error", project.error);
    })
    .finally(async () => {
      project.updatedAt = nowIso();
      if (project.status !== "running") delete project.lease;
      await run.flush().catch(() => undefined);
      publishDone(project.id, project.status);
      live.delete(project.id);
    });
  backgroundRunner(p);
}

async function runPipeline(run: Run, opts: RunOptions): Promise<void> {
  const project = run.project;
  const resume = Boolean(opts.resume);
  if (!resume) project.agents = [];
  const refining = Boolean(opts.instruction && opts.previousBrief);
  const finished = (a: AgentRun) => resume && (a.status === "done" || a.status === "skipped");
  run.log(
    "info",
    resume
      ? "Resuming pipeline in a new invocation (finished agents are kept)"
      : refining
        ? `Refinement started: "${opts.instruction}"`
        : `Pipeline started for "${project.prompt}"`,
  );

  const aArch = run.agent("architect", "architect", "Architect", "Turns the request into a product brief: subsystems, envelopes, interfaces, key components");
  const aCad = run.agent("cad", "cad", "CAD lead", "Spawns one CAD engineer per subsystem and merges their parts");
  const aSrc = run.agent("sourcing", "sourcing", "Sourcing", "Bill of materials with real part numbers, prices and suppliers");
  const aEl = run.agent("electronics", "electronics", "Electronics", "Netlist, pinout, power budget and wiring steps");
  const aFw = run.agent("firmware", "firmware", "Firmware", "Complete firmware using the netlist pin assignments");
  const aInt = run.agent("integration", "cad", "Integration", "Cross-subsystem joints, position fixes, CAD↔BOM↔netlist links");
  const aAsm = run.agent("assembly", "assembly", "Assembly", "Step-by-step build, wiring, flashing and test instructions");
  const aRev = run.agent("review", "review", "Reviewer", "Deterministic checks plus an engineering design review");
  run.touch();

  /* ---------------- 1. Architect ---------------- */
  let brief: ProductBrief;
  if (finished(aArch) && project.brief) {
    brief = project.brief;
  } else try {
    const res = await run.call(aArch, "architect", {
      system: P.ARCHITECT_SYSTEM,
      user: P.architectUser(
        project.prompt,
        refining ? { briefJson: JSON.stringify(opts.previousBrief), instruction: opts.instruction! } : undefined,
      ),
      tool: "submit_brief",
      desc: "Submit the complete product brief.",
      schema: S.briefSchema,
      maxTokens: 20000,
    });
    brief = normalizeBrief(res.data, project.prompt, (m) => run.log("warn", `Architect: ${m}`, aArch.id));
    project.brief = brief;
    run.done(
      aArch,
      `${brief.name}: ${brief.subsystems.length} subsystems, envelope ${brief.envelope.map((n) => r1(n)).join("×")} mm, ${brief.keyComponents.length} key components`,
      res.tokensIn,
      res.tokensOut,
    );
  } catch (err) {
    run.fail(aArch, err);
    for (const a of [aCad, aSrc, aEl, aFw, aInt, aAsm, aRev]) run.skip(a, "architect failed");
    if (!project.brief) {
      project.status = "error";
      project.error = `Architect failed: ${(err as Error)?.message || err}`;
    } else {
      project.status = "done"; // refinement failed; previous result is still intact
      project.error = `Refinement failed: ${(err as Error)?.message || err}`;
    }
    return;
  }

  const briefJson = briefForPrompt(brief);

  /* ---------------- 2a. CAD (parallel sub-agents) ---------------- */
  const subAgents = brief.subsystems.map((s) =>
    run.agent(`cad-${s.id}`, "cad", `CAD · ${s.name}`, `Models the ${s.name} subsystem`, aCad.id),
  );
  run.touch();
  const usedPartIds = new Set<string>();
  const usedJointIds = new Set<string>();
  const partNumbers = new Map<string, string>();
  let cadFresh = resume && Boolean(project.cad);
  if (resume && project.cad) {
    for (const p of project.cad.parts) usedPartIds.add(p.id);
    for (const j of project.cad.joints) usedJointIds.add(j.id);
  }

  const mergeCad = (res: CadPartsResult) => {
    if (!cadFresh || !project.cad) {
      cadFresh = true;
      project.cad = { units: "mm", parts: [], joints: [] };
      if (refining) {
        delete project.assembly;
        delete project.review;
      }
    }
    project.cad = {
      units: "mm",
      parts: [...project.cad.parts, ...res.parts],
      joints: [...project.cad.joints, ...res.joints],
    };
    for (const [k, v] of res.partNumbers) partNumbers.set(k, v);
  };

  const runCadSub = async (sub: SubsystemPlan, a: (typeof subAgents)[number]) => {
    if (finished(a)) return true; // parts already merged into project.cad by the previous invocation
    try {
      const others = brief.subsystems
        .filter((o) => o.id !== sub.id)
        .map((o) => ({ id: o.id, name: o.name, envelope: o.envelope, keyParts: o.keyParts, interfaces: o.interfaces }));
      const res = await run.call(a, "cad", {
        system: P.CAD_SYSTEM,
        user: P.cadUser(briefJson, JSON.stringify(sub, null, 1), JSON.stringify(others, null, 1)),
        tool: "submit_subsystem_cad",
        desc: `Submit all parts and joints of the ${sub.name} subsystem.`,
        schema: S.cadSchema,
        maxTokens: 32000,
      });
      const out = normalizeCadOutput(res.data, sub, usedPartIds, usedJointIds, (m) => run.log("warn", `CAD · ${sub.name}: ${m}`, a.id));
      if (!out.parts.length) throw new Error("no valid parts returned");
      mergeCad(out);
      run.done(a, `generated ${out.parts.length} parts, ${out.joints.length} joints`, res.tokensIn, res.tokensOut);
      return out;
    } catch (err) {
      run.fail(a, err);
      return null;
    }
  };

  const cadP = (async () => {
    if (finished(aCad) && project.cad) return project.cad;
    run.start(aCad);
    run.log("info", `CAD lead: spawning ${brief.subsystems.length} subsystem engineers (${brief.subsystems.map((s) => s.name).join(", ")})`, aCad.id);
    const results = await Promise.all(brief.subsystems.map((s, i) => runCadSub(s, subAgents[i])));
    const ok = results.filter(Boolean).length;
    const tokIn = subAgents.reduce((s, a) => s + (a.tokensIn || 0), 0);
    const tokOut = subAgents.reduce((s, a) => s + (a.tokensOut || 0), 0);
    if (!ok) {
      run.fail(aCad, new Error("all CAD sub-agents failed"));
      return null;
    }
    aCad.tokensIn = tokIn;
    aCad.tokensOut = tokOut;
    run.done(aCad, `${ok}/${results.length} subsystems merged: ${project.cad?.parts.length || 0} parts, ${project.cad?.joints.length || 0} joints`);
    return project.cad || null;
  })();

  /* ---------------- Sourcing (runs once electronics is known so the BOM covers the netlist) ---------------- */
  const runSourcing = async (el: ElectronicsSpec | null): Promise<BomItem[] | null> => {
    if (finished(aSrc)) return project.bom || null;
    try {
      const compTable = el
        ? el.components.map((c) => `${c.id} | ${c.name} | ${c.partNumber || "-"} | ${c.value || "-"} | ${c.kind}`).join("\n")
        : undefined;
      const res = await run.call(aSrc, "sourcing", {
        system: P.SOURCING_SYSTEM,
        user: P.sourcingUser(briefJson, compTable),
        tool: "submit_bom",
        desc: "Submit the full bill of materials.",
        schema: S.bomSchema,
        maxTokens: 24000,
      });
      const elLinks = new Map<string, string[]>();
      const bom = normalizeBom(res.data, (m) => run.log("warn", `Sourcing: ${m}`, aSrc.id), elLinks);
      if (!bom.length) throw new Error("no valid BOM lines returned");
      project.bom = bom;
      let linked = 0;
      if (el) {
        const comps = new Map(el.components.map((c) => [c.id.toLowerCase(), c]));
        for (const [bomId, ids] of elLinks) {
          for (const cid of ids) {
            const c = comps.get(cid.toLowerCase());
            if (c && !c.bomId) {
              c.bomId = bomId;
              linked++;
            }
          }
        }
      }
      const cost = bom.reduce((s, b) => s + b.qty * b.unitPrice, 0);
      run.done(
        aSrc,
        `${bom.length} BOM lines, $${cost.toFixed(2)} per unit${el ? `, ${linked}/${el.components.length} netlist parts linked` : ""}`,
        res.tokensIn,
        res.tokensOut,
      );
      return bom;
    } catch (err) {
      run.fail(aSrc, err);
      return null;
    }
  };

  /* ---------------- 2c. Electronics -> 3. Firmware ---------------- */
  const elP = (async (): Promise<ElectronicsSpec | null> => {
    if (finished(aEl)) return project.electronics ?? null;
    if (!brief.hasElectronics) {
      project.electronics = null;
      run.skip(aEl, "product has no electronics");
      return null;
    }
    try {
      const res = await run.call(aEl, "electronics", {
        system: P.ELECTRONICS_SYSTEM,
        user: P.electronicsUser(briefJson),
        tool: "submit_electronics",
        desc: "Submit the complete electronics spec (components, pins, nets, power budget, wiring steps).",
        schema: S.electronicsSchema,
        maxTokens: 32000,
      });
      const el = normalizeElectronics(res.data, (m) => run.log("warn", `Electronics: ${m}`, aEl.id));
      if (!el.components.length) throw new Error("no components returned");
      project.electronics = el;
      const draw = el.powerBudget.reduce((s, p) => s + p.currentMa, 0);
      run.done(aEl, `${el.components.length} components, ${el.nets.length} nets, ${Math.round(draw)} mA budget`, res.tokensIn, res.tokensOut);
      return el;
    } catch (err) {
      run.fail(aEl, err);
      return null;
    }
  })();

  const fwP = (async (): Promise<FirmwareSpec | null> => {
    if (finished(aFw)) return project.firmware ?? null;
    const el = await elP;
    if (!brief.hasFirmware) {
      project.firmware = null;
      run.skip(aFw, "product has no firmware");
      return null;
    }
    if (!el) {
      run.skip(aFw, "electronics unavailable");
      return null;
    }
    try {
      const platform = brief.firmwarePlatform || "Arduino";
      const res = await run.call(aFw, "firmware", {
        system: P.FIRMWARE_SYSTEM,
        user: P.firmwareUser(briefJson, JSON.stringify({ components: el.components, nets: el.nets, supplyVoltage: el.supplyVoltage, logicVoltage: el.logicVoltage }), platform),
        tool: "submit_firmware",
        desc: "Submit the complete firmware project.",
        schema: S.firmwareSchema,
        maxTokens: 40000,
      });
      const fw = normalizeFirmware(res.data, platform, (m) => run.log("warn", `Firmware: ${m}`, aFw.id));
      if (!fw.files.length) throw new Error("no source files returned");
      project.firmware = fw;
      const lines = fw.files.reduce((s, f) => s + f.content.split("\n").length, 0);
      run.done(aFw, `${fw.files.length} files, ${lines} lines for ${fw.target}`, res.tokensIn, res.tokensOut);
      return fw;
    } catch (err) {
      run.fail(aFw, err);
      return null;
    }
  })();

  const bomP = elP.then(runSourcing);

  /* ---------------- 4. Integration ---------------- */
  const [cad, bom, el] = await Promise.all([cadP, bomP, elP]);

  if (finished(aInt)) {
    /* already integrated */
  } else if (cad && cad.parts.length) {
    await runIntegration(run, aInt, cad, bom, el, partNumbers, usedJointIds);
  } else {
    run.skip(aInt, "no CAD model");
  }

  /* ---------------- 5. Assembly ---------------- */
  // Give the firmware agent a little time so assembly can include its exact flashing steps.
  if (!finished(aAsm)) await Promise.race([fwP, sleep(15_000)]);
  if (finished(aAsm)) {
    /* already done */
  } else if (project.cad && project.cad.parts.length) {
    await runAssembly(run, aAsm, project.cad, project.electronics || null, project.firmware || null);
  } else {
    run.skip(aAsm, "no CAD model");
  }

  /* ---------------- 6. Review ---------------- */
  await fwP;
  if (!finished(aRev)) await runReview(run, aRev);

  /* ---------------- Finish ---------------- */
  const ok = Boolean(project.brief && project.cad && project.cad.parts.length);
  project.status = ok ? "done" : "error";
  if (!ok) project.error = "CAD generation failed for every subsystem";
  else delete project.error;
  const totalIn = project.agents.filter((a) => !a.parentId).reduce((s, a) => s + (a.tokensIn || 0), 0);
  const totalOut = project.agents.filter((a) => !a.parentId).reduce((s, a) => s + (a.tokensOut || 0), 0);
  const errors = project.agents.filter((a) => a.status === "error").length;
  run.log(
    errors ? "warn" : "info",
    `Pipeline ${project.status} in ${r1((Date.now() - run.startedAt) / 1000)}s · ${project.cad?.parts.length || 0} parts · ${totalIn} tokens in / ${totalOut} out${errors ? ` · ${errors} agent error(s)` : ""}`,
  );
  run.touch();
}

/* ------------------------------------------------------------------ */
/* Integration                                                         */
/* ------------------------------------------------------------------ */

async function runIntegration(
  run: Run,
  a: AgentRun,
  cad: CadModel,
  bom: BomItem[] | null,
  el: ElectronicsSpec | null,
  partNumbers: Map<string, string>,
  usedJointIds: Set<string>,
): Promise<void> {
  const project = run.project;
  try {
    const jointCount = new Map<string, number>();
    for (const j of cad.joints) {
      jointCount.set(j.partA, (jointCount.get(j.partA) || 0) + 1);
      jointCount.set(j.partB, (jointCount.get(j.partB) || 0) + 1);
    }
    const bomTable = (bom || []).map((b) => `${b.id} | ${b.name} | ${b.partNumber || "-"} | ${b.qty}`).join("\n");
    const compTable = (el?.components || []).map((c) => `${c.id} | ${c.name} | ${c.partNumber || "-"}`).join("\n");
    const res = await run.call(a, "integration", {
      system: P.INTEGRATION_SYSTEM,
      user:
        `PRODUCT: ${project.brief?.name} — envelope ${project.brief?.envelope.join("x")} mm. ${project.brief?.coordinateNotes || ""}\n` +
        `INTERFACES:\n${(project.brief?.subsystems || []).map((s) => `- ${s.name}: ${s.interfaces.join("; ")}`).join("\n")}\n\n` +
        P.integrationUser(partsTable(cad.parts, jointCount), bomTable || "(none)", compTable),
      tool: "submit_integration",
      desc: "Submit cross-subsystem joints, position fixes and part links.",
      schema: S.integrationSchema,
      maxTokens: 24000,
    });
    const data = isObj(res.data) ? res.data : {};
    const parts = cad.parts.map((p) => ({ ...p }));
    const resolve = makePartResolver(parts);
    const byId = new Map(parts.map((p) => [p.id, p]));

    // Joints
    const existingPairs = new Set(cad.joints.map((j) => [j.partA, j.partB].sort().join("|")));
    const newJoints = normalizeJoints(data.joints, resolve, "x-j", usedJointIds, (m) => run.log("warn", `Integration: ${m}`, a.id)).filter(
      (j) => !existingPairs.has([j.partA, j.partB].sort().join("|")),
    );

    // Position fixes (bounded so a confused answer cannot wreck the model)
    const env = project.brief?.envelope || [500, 500, 500];
    const maxShift = Math.max(30, 0.5 * Math.max(...env));
    let fixes = 0;
    let rejected = 0;
    for (const f of Array.isArray(data.positionFixes) ? data.positionFixes : []) {
      if (!isObj(f)) continue;
      const id = resolve(f.partId);
      const part = id ? byId.get(id) : undefined;
      if (!part) continue;
      const np = vec3(f.position, part.position);
      const d = Math.hypot(np[0] - part.position[0], np[1] - part.position[1], np[2] - part.position[2]);
      if (d < 0.01) continue;
      if (d > maxShift) {
        rejected++;
        continue;
      }
      part.position = np;
      fixes++;
    }

    // Links
    const bomIds = new Map((bom || []).flatMap((b) => [[b.id, b.id], [b.id.toLowerCase(), b.id], [b.name.toLowerCase(), b.id]] as [string, string][]));
    const compById = new Map((el?.components || []).map((c) => [c.id.toLowerCase(), c]));
    let bomLinks = 0;
    let elLinks = 0;
    for (const l of Array.isArray(data.links) ? data.links : []) {
      if (!isObj(l)) continue;
      const id = resolve(l.partId);
      const part = id ? byId.get(id) : undefined;
      if (!part) continue;
      const bid = bomIds.get(str(l.bomId)) || bomIds.get(str(l.bomId).toLowerCase());
      if (bid) {
        part.bomId = bid;
        bomLinks++;
      }
      const comp = compById.get(str(l.electronicsId).toLowerCase());
      if (comp) {
        part.electronicsId = comp.id;
        comp.cadPartIds = [...new Set([...(comp.cadPartIds || []), part.id])];
        elLinks++;
      }
    }
    const auto = bom ? autoLinkBom(parts, bom, partNumbers) : 0;

    project.cad = { units: "mm", parts, joints: [...cad.joints, ...newJoints] };
    if (el && project.electronics) project.electronics = { ...el };
    run.done(
      a,
      `${newJoints.length} cross-subsystem joints, ${fixes} position fixes${rejected ? ` (${rejected} rejected)` : ""}, ${bomLinks + auto} BOM links, ${elLinks} netlist links`,
      res.tokensIn,
      res.tokensOut,
    );
  } catch (err) {
    // Deterministic linking still helps when the agent fails.
    if (bom) {
      const parts = cad.parts.map((p) => ({ ...p }));
      autoLinkBom(parts, bom, partNumbers);
      project.cad = { ...cad, parts };
    }
    run.fail(a, err);
  }
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

async function runAssembly(run: Run, a: AgentRun, cad: CadModel, el: ElectronicsSpec | null, fw: FirmwareSpec | null): Promise<void> {
  const project = run.project;
  try {
    const b = project.brief!;
    const res = await run.call(a, "assembly", {
      system: P.ASSEMBLY_SYSTEM,
      user: P.assemblyUser(
        `${b.name} — ${b.tagline}\n${b.description}\nSubsystems: ${b.subsystems.map((s) => s.name).join(", ")}`,
        cad.parts.map((p) => `${p.id} | ${p.name} | ${p.subsystem}`).join("\n"),
        (el?.wiringSteps || []).map((s, i) => `${i + 1}. ${s}`).join("\n"),
        fw ? [`Platform: ${fw.platform}, target ${fw.target}`, ...fw.build.map((s, i) => `${i + 1}. ${s}`)].join("\n") : "",
      ),
      tool: "submit_assembly",
      desc: "Submit the ordered assembly steps.",
      schema: S.assemblySchema,
      maxTokens: 20000,
    });
    const steps = normalizeAssembly(res.data, cad.parts, (m) => run.log("warn", `Assembly: ${m}`, a.id));
    if (!steps.length) throw new Error("no assembly steps returned");
    project.assembly = steps;
    const mins = steps.reduce((s, x) => s + (x.durationMin || 0), 0);
    const covered = new Set(steps.flatMap((s) => s.partIds)).size;
    run.done(a, `${steps.length} steps, ~${mins} min, covers ${covered}/${cad.parts.length} parts`, res.tokensIn, res.tokensOut);
  } catch (err) {
    run.fail(a, err);
  }
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

function designSummary(p: Project): string {
  const b = p.brief!;
  const lines: string[] = [];
  lines.push(`Product: ${b.name} (${b.category}) — ${b.tagline}`);
  lines.push(`Description: ${b.description}`);
  lines.push(`Envelope: ${b.envelope.join(" x ")} mm. Performance targets: ${Object.entries(b.requirements.performance).map(([k, v]) => `${k}=${v}`).join("; ")}`);
  lines.push(`Key components: ${b.keyComponents.map((k) => `${k.qty}x ${k.name}${k.partNumber ? ` (${k.partNumber})` : ""}`).join("; ")}`);
  if (p.cad) {
    const bySub = new Map<string, number>();
    for (const part of p.cad.parts) bySub.set(part.subsystem, (bySub.get(part.subsystem) || 0) + 1);
    lines.push(`CAD: ${p.cad.parts.length} parts (${[...bySub].map(([k, v]) => `${k}: ${v}`).join(", ")}), ${p.cad.joints.length} joints`);
    const comps = p.cad.parts.filter((x) => x.geometry.type === "component").map((x) => `${x.name}@${fmtV(x.position)}`);
    lines.push(`Purchased components placed: ${comps.slice(0, 40).join("; ")}`);
  }
  if (p.bom) {
    const cost = p.bom.reduce((s, x) => s + x.qty * x.unitPrice, 0);
    lines.push(`BOM: ${p.bom.length} lines, $${cost.toFixed(2)}:`);
    for (const x of p.bom.slice(0, 50)) lines.push(`  - ${x.qty}x ${x.name} ${x.partNumber || ""} $${x.unitPrice} ${x.massG ? x.massG + "g" : ""} ${x.specs ? JSON.stringify(x.specs) : ""}`.trimEnd());
  }
  if (p.electronics) {
    const e = p.electronics;
    lines.push(`Electronics: supply ${e.supplyVoltage} V, logic ${e.logicVoltage} V, ${e.components.length} components, ${e.nets.length} nets`);
    for (const c of e.components) lines.push(`  ${c.id}: ${c.name} ${c.partNumber || ""} [${c.kind}, ${c.mount}]${c.value ? " " + c.value : ""}`);
    for (const n of e.nets) lines.push(`  net ${n.name} (${n.type}${n.voltage !== undefined ? ` ${n.voltage}V` : ""}): ${n.nodes.map((x) => `${x.component}.${x.pin}`).join(", ")}`);
    lines.push(`  power budget: ${e.powerBudget.map((x) => `${x.component} ${x.voltage}V ${x.currentMa}mA`).join("; ")}`);
  }
  if (p.firmware) {
    const f = p.firmware;
    lines.push(`Firmware: ${f.platform} (${f.language}) for ${f.target}; files: ${f.files.map((x) => `${x.path} (${x.content.split("\n").length} lines)`).join(", ")}`);
    lines.push(`  pinMap: ${f.pinMap.map((x) => `${x.pin}->${x.component} ${x.function}`).join("; ")}`);
    const main = f.files.find((x) => /main\.(c|cpp|ino|py)$/.test(x.path)) || f.files[0];
    if (main) lines.push(`  ${main.path} excerpt:\n${main.content.slice(0, 3500)}`);
  }
  if (p.assembly) lines.push(`Assembly: ${p.assembly.map((s) => `${s.step}. ${s.title}`).join(" | ")}`);
  const failed = p.agents.filter((a) => a.status === "error").map((a) => `${a.name}: ${a.error}`);
  if (failed.length) lines.push(`Agent failures: ${failed.join("; ")}`);
  return lines.join("\n");
}

async function runReview(run: Run, a: AgentRun): Promise<void> {
  const project = run.project;
  if (!project.brief) {
    run.skip(a, "no brief");
    return;
  }
  const det = deterministicReview(project);
  // Publish the deterministic part straight away.
  const base: ReviewReport = {
    score: det.score,
    summary: "Automated checks complete; engineering review in progress.",
    checks: det.checks,
    metrics: det.metrics,
    suggestions: [],
  };
  project.review = base;
  run.touch();
  try {
    const detText = det.checks.map((c) => `[${c.status.toUpperCase()}] ${c.category} · ${c.name}: ${c.detail}`).join("\n");
    const res = await run.call(a, "review", {
      system: P.REVIEW_SYSTEM,
      user: P.reviewUser(designSummary(project), detText),
      tool: "submit_review",
      desc: "Submit the design review.",
      schema: S.reviewSchema,
      maxTokens: 12000,
    });
    const ag = normalizeAgentReview(res.data);
    const score = ag.score === undefined ? det.score : Math.round(0.65 * ag.score + 0.35 * det.score);
    project.review = {
      score,
      summary: ag.summary || base.summary,
      checks: [...det.checks, ...ag.checks],
      metrics: det.metrics,
      suggestions: ag.suggestions,
    };
    const fails = project.review.checks.filter((c) => c.status === "fail").length;
    const warns = project.review.checks.filter((c) => c.status === "warn").length;
    run.done(a, `score ${score}/100 · ${project.review.checks.length} checks (${fails} fail, ${warns} warn)`, res.tokensIn, res.tokensOut);
  } catch (err) {
    project.review = { ...base, summary: "Automated checks only (reviewer agent failed)." };
    run.fail(a, err);
  }
}
