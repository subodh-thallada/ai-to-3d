import type { Project, ReviewCheck, ReviewReport, Vec3 } from "@protoforge/shared";
import { approxBounds } from "./normalize";

export interface DeterministicReview {
  checks: ReviewCheck[];
  metrics: ReviewReport["metrics"];
  /** Score derived purely from the deterministic checks (0-100). */
  score: number;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Parse a capacity in mAh from free text like "1500mAh", "2.2Ah", "2200 mAh 3S". */
function parseMah(s: string): number | undefined {
  const mah = s.match(/(\d+(?:\.\d+)?)\s*mAh/i);
  if (mah) return Number(mah[1]);
  const ah = s.match(/(\d+(?:\.\d+)?)\s*Ah\b/i);
  if (ah) return Number(ah[1]) * 1000;
  return undefined;
}

export function deterministicReview(p: Project): DeterministicReview {
  const checks: ReviewCheck[] = [];
  const add = (id: string, category: ReviewCheck["category"], name: string, status: ReviewCheck["status"], detail: string) =>
    checks.push({ id: `det-${id}`, category, name, status, detail, source: "deterministic" });

  const parts = p.cad?.parts || [];
  const joints = p.cad?.joints || [];
  const bom = p.bom || [];
  const el = p.electronics || null;
  const fw = p.firmware || null;
  const steps = p.assembly || [];

  /* ---------- CAD ---------- */
  const partIds = new Set<string>();
  const dupParts: string[] = [];
  for (const part of parts) {
    if (partIds.has(part.id)) dupParts.push(part.id);
    partIds.add(part.id);
  }
  add("part-ids", "consistency", "CAD part ids unique", dupParts.length ? "fail" : "pass",
    dupParts.length ? `Duplicate ids: ${dupParts.slice(0, 5).join(", ")}` : `${parts.length} parts, all ids unique`);

  const badJoints = joints.filter((j) => !partIds.has(j.partA) || !partIds.has(j.partB));
  add("joint-refs", "mechanical", "Joints reference real parts", badJoints.length ? "fail" : "pass",
    badJoints.length ? `${badJoints.length} joint(s) reference missing parts` : `${joints.length} joints, all valid`);

  const jointed = new Set<string>();
  for (const j of joints) {
    jointed.add(j.partA);
    jointed.add(j.partB);
  }
  const floating = parts.filter((x) => !jointed.has(x.id));
  const floatRatio = parts.length ? floating.length / parts.length : 0;
  add("floating", "mechanical", "Every part is connected", floating.length === 0 ? "pass" : floatRatio > 0.25 ? "fail" : "warn",
    floating.length === 0
      ? "Every part participates in at least one joint"
      : `${floating.length} part(s) have no joint (floating): ${floating.slice(0, 6).map((x) => x.name).join(", ")}${floating.length > 6 ? "…" : ""}`);

  // Connectivity: number of connected groups in the joint graph
  if (parts.length) {
    const parent = new Map(parts.map((x) => [x.id, x.id]));
    const find = (a: string): string => {
      let r = a;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(a, r);
      return r;
    };
    for (const j of joints) if (parent.has(j.partA) && parent.has(j.partB)) parent.set(find(j.partA), find(j.partB));
    const groups = new Set(parts.filter((x) => jointed.has(x.id)).map((x) => find(x.id)));
    add("assembly-graph", "mechanical", "Assembly is one connected structure", groups.size <= 1 ? "pass" : "warn",
      groups.size <= 1 ? "All jointed parts form a single assembly" : `Joint graph splits into ${groups.size} separate groups`);
  }

  // Bounding box vs brief envelope
  if (parts.length && p.brief) {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
      const b = approxBounds(part);
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], b.min[i]);
        max[i] = Math.max(max[i], b.max[i]);
      }
    }
    const size = max.map((v, i) => round(v - min[i], 1)) as Vec3;
    const env = p.brief.envelope;
    const ratios = size.map((s, i) => s / Math.max(1, env[i]));
    const worst = Math.max(...ratios);
    const status = worst > 1.6 ? "fail" : worst > 1.2 ? "warn" : "pass";
    add("envelope", "mechanical", "CAD fits the product envelope", status,
      `Assembly bounds ≈ ${size.join(" × ")} mm vs brief envelope ${env.join(" × ")} mm`);
  }

  /* ---------- Electronics ---------- */
  let powerDrawMa = 0;
  if (el) {
    const comps = new Map(el.components.map((c) => [c.id, c]));
    let badNodes = 0;
    const usedPins = new Map<string, number>();
    for (const n of el.nets) {
      for (const node of n.nodes) {
        const c = comps.get(node.component);
        if (!c || !c.pins.some((pin) => pin.id === node.pin)) badNodes++;
        const key = `${node.component}.${node.pin}`;
        usedPins.set(key, (usedPins.get(key) || 0) + 1);
      }
    }
    add("net-refs", "electrical", "Net nodes reference real pins", badNodes ? "fail" : "pass",
      badNodes ? `${badNodes} node(s) reference unknown components/pins` : `${el.nets.length} nets, all nodes valid`);

    const unconnected = el.components.filter((c) => !el.nets.some((n) => n.nodes.some((x) => x.component === c.id)));
    add("unconnected", "electrical", "Every component is wired", unconnected.length ? "warn" : "pass",
      unconnected.length ? `No connections: ${unconnected.map((c) => c.id).slice(0, 8).join(", ")}` : `${el.components.length} components all connected`);

    const shorted = [...usedPins.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    add("pin-multi-net", "electrical", "No pin sits on two nets", shorted.length ? "fail" : "pass",
      shorted.length ? `Pins on more than one net (short): ${shorted.slice(0, 6).join(", ")}` : "Each pin belongs to at most one net");

    const hasGround = el.nets.some((n) => n.type === "ground");
    add("ground", "electrical", "Common ground net", hasGround || !el.components.length ? "pass" : "fail",
      hasGround ? "Ground net present" : "No ground net found");

    powerDrawMa = el.powerBudget.reduce((s, x) => s + x.currentMa, 0);
    // Battery runtime estimate
    const capCandidates: number[] = [];
    for (const b of bom) {
      if (b.category !== "power" && !/batt|lipo|li-ion|cell/i.test(b.name)) continue;
      const text = [b.name, b.partNumber || "", ...Object.values(b.specs || {})].join(" ");
      const mah = parseMah(text);
      if (mah) capCandidates.push(mah);
    }
    if (capCandidates.length && powerDrawMa > 0) {
      const cap = Math.max(...capCandidates);
      const runtimeMin = (cap * 0.8 / powerDrawMa) * 60;
      add("runtime", "electrical", "Battery runtime", runtimeMin < 3 ? "warn" : "pass",
        `${cap} mAh at ${Math.round(powerDrawMa)} mA estimated draw → ≈ ${runtimeMin >= 120 ? round(runtimeMin / 60, 1) + " h" : Math.round(runtimeMin) + " min"} (80% usable)`);
    } else if (powerDrawMa > 0) {
      add("runtime", "electrical", "Battery runtime", "warn", `Estimated draw ${Math.round(powerDrawMa)} mA, but no battery capacity found in the BOM`);
    }
  }

  /* ---------- Firmware ---------- */
  let firmwareLines = 0;
  if (fw) {
    firmwareLines = fw.files.reduce((s, f) => s + f.content.split("\n").length, 0);
    add("fw-files", "firmware", "Firmware sources present", fw.files.length ? "pass" : "fail",
      `${fw.files.length} file(s), ${firmwareLines} lines`);
    const code = fw.files.map((f) => f.content).join("\n");
    const placeholders = (code.match(/\bTODO\b|\bFIXME\b|your code here|\.\.\.\s*$/gim) || []).length;
    add("fw-placeholders", "firmware", "No placeholder code", placeholders ? "warn" : "pass",
      placeholders ? `${placeholders} TODO/placeholder marker(s) in code` : "No TODO/placeholder markers");
    if (el && fw.pinMap.length) {
      const netPinLabels = new Set<string>();
      for (const c of el.components) for (const pin of c.pins) {
        netPinLabels.add(pin.id.toUpperCase());
        netPinLabels.add(pin.label.toUpperCase());
      }
      const notInNet = fw.pinMap.filter((m) => !netPinLabels.has(m.pin.toUpperCase()) && !netPinLabels.has(m.pin.toUpperCase().replace(/^GPIO/, "D")));
      add("fw-pins-netlist", "firmware", "Firmware pins exist in the netlist", notInNet.length === 0 ? "pass" : notInNet.length > fw.pinMap.length / 3 ? "fail" : "warn",
        notInNet.length ? `Not found in netlist: ${notInNet.map((m) => m.pin).slice(0, 8).join(", ")}` : `${fw.pinMap.length} mapped pins all exist`);
      const notInCode = fw.pinMap.filter((m) => {
        const raw = m.pin.replace(/^(GPIO|IO|D|P)/i, "");
        if (!raw) return false;
        const re = new RegExp(`(\\b|GPIO|IO|D|A|P|GP)${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        return !re.test(code);
      });
      add("fw-pins-code", "firmware", "Mapped pins appear in code", notInCode.length === 0 ? "pass" : "warn",
        notInCode.length ? `Not referenced in code: ${notInCode.map((m) => m.pin).slice(0, 8).join(", ")}` : "Every mapped pin is referenced in source");
    }
  }

  /* ---------- Sourcing ---------- */
  const costUsd = round(bom.reduce((s, b) => s + b.qty * b.unitPrice, 0));
  if (bom.length) {
    const unpriced = bom.filter((b) => b.unitPrice <= 0 && b.category !== "fabricated");
    add("bom-prices", "sourcing", "BOM lines priced", unpriced.length ? "warn" : "pass",
      unpriced.length ? `${unpriced.length} line(s) without price` : `${bom.length} lines, total $${costUsd.toFixed(2)}`);
    const noPn = bom.filter((b) => !b.partNumber && b.category !== "fabricated");
    add("bom-pn", "sourcing", "Purchased parts have part numbers", noPn.length > bom.length / 3 ? "warn" : "pass",
      noPn.length ? `${noPn.length} purchased line(s) lack a part number` : "All purchased parts have part numbers");
    const linked = parts.filter((x) => x.bomId).length;
    const componentParts = parts.filter((x) => x.geometry.type === "component").length;
    add("bom-links", "consistency", "CAD parts linked to BOM", componentParts && linked < componentParts / 2 ? "warn" : "pass",
      `${linked} of ${parts.length} CAD parts linked to a BOM line`);
  } else {
    add("bom-present", "sourcing", "Bill of materials present", "fail", "No BOM generated");
  }

  // Mass
  const bomMass = bom.reduce((s, b) => s + (b.massG || 0) * b.qty, 0);
  const partMass = parts.reduce((s, x) => s + (x.massG || 0), 0);
  const massG = round(Math.max(bomMass, partMass), 1);
  if (bomMass && partMass) {
    const ratio = Math.max(bomMass, partMass) / Math.max(1, Math.min(bomMass, partMass));
    add("mass", "consistency", "Mass estimates agree", ratio > 2 ? "warn" : "pass",
      `BOM mass ${round(bomMass, 0)} g vs CAD part mass ${round(partMass, 0)} g`);
  }

  /* ---------- Assembly ---------- */
  if (steps.length) {
    const covered = new Set(steps.flatMap((s) => s.partIds));
    const coverage = parts.length ? covered.size / parts.length : 1;
    add("assembly-coverage", "assembly", "Assembly covers the parts", coverage >= 0.6 ? "pass" : coverage >= 0.3 ? "warn" : "fail",
      `${covered.size} of ${parts.length} parts appear in ${steps.length} steps (${Math.round(coverage * 100)}%)`);
  } else if (parts.length) {
    add("assembly-present", "assembly", "Assembly instructions present", "fail", "No assembly steps generated");
  }

  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, Math.min(100, 100 - fails * 12 - warns * 4));

  return {
    checks,
    score,
    metrics: {
      partCount: parts.length,
      jointCount: joints.length,
      bomLineCount: bom.length,
      costUsd,
      massG,
      netCount: el?.nets.length || 0,
      componentCount: el?.components.length || 0,
      firmwareLines,
      powerDrawMa: Math.round(powerDrawMa),
    },
  };
}
