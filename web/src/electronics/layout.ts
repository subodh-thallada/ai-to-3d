/**
 * Deterministic breadboard layout for an ElectronicsSpec (pure, no React).
 *
 * Full-size breadboard: 63 rows x (a-e / f-j) terminal strips + 4 power rails of 50 holes = 830 tie points.
 * Drawn horizontally: row numbers run along X, letters along Y (j at the top ... a at the bottom).
 *  - Rails: top + = main supply, top − / bottom − = ground (bridged), bottom + = logic voltage.
 *  - Every other net gets its own terminal strip(s) (5 holes each; bigger nets span bridged strips).
 *  - Small "breadboard" parts (2-4 pins) are inserted directly into their nets' strips / rails.
 *  - Everything else is drawn as a board above/below the breadboard and jumpered with one wire per pin.
 */
import type { EComponent, EComponentKind, ElectronicsSpec } from "@protoforge/shared";
import { buildNetlist, kindOrder, nodeLabel, pinKey, type Netlist } from "./model";

export const PITCH = 10;
export const BB_ROWS = 63;
export const BB_W = 668;
export const BB_H = 216;
export const rowX = (r: number) => 24 + (r - 1) * PITCH;
/** Letters ordered from the centre channel outwards */
export const LETTERS: Record<Half, string[]> = { top: ["f", "g", "h", "i", "j"], bottom: ["e", "d", "c", "b", "a"] };
export const LETTER_Y: Record<string, number> = { j: 52, i: 62, h: 72, g: 82, f: 92, e: 120, d: 130, c: 140, b: 150, a: 160 };
export type RailId = "T+" | "T-" | "B-" | "B+";
export const RAIL_IDS: RailId[] = ["T+", "T-", "B-", "B+"];
export const RAIL_Y: Record<RailId, number> = { "T+": 16, "T-": 26, "B-": 188, "B+": 198 };
export const RAIL_HOLES = 50;
/** Rail holes come in groups of 5 with a one-row gap */
export const railRow = (k: number) => 2 + Math.floor(k / 5) * 6 + (k % 5);
export const railHoleX = (k: number) => rowX(railRow(k));
const MODULE_PITCH = 12;
const GAP = 72;
const ROW_GAP = 48;

export type Half = "top" | "bottom";

export interface BBStrip {
  netId: string;
  row: number;
  half: Half;
}
export interface BBModulePin {
  pinId: string;
  label: string;
  x: number;
  y: number;
  netId?: string;
}
export interface BBModule {
  compId: string;
  name: string;
  partNumber?: string;
  kind: EComponentKind;
  x: number;
  y: number;
  w: number;
  h: number;
  side: "above" | "below";
  color: string;
  pins: BBModulePin[];
}
export type InlineShape = "resistor" | "led" | "capacitor" | "electrolytic" | "button" | "diode" | "generic";
export interface BBInlinePin {
  pinId: string;
  label: string;
  hole: string;
  x: number;
  y: number;
  netId?: string;
}
export interface BBInline {
  compId: string;
  name: string;
  value?: string;
  shape: InlineShape;
  color: string;
  pins: BBInlinePin[];
}
export interface BBWire {
  id: string;
  netId: string;
  kind: "module" | "bridge" | "rail-bridge";
  from: { x: number; y: number; compId?: string; pinId?: string; hole?: string };
  to: { x: number; y: number; hole: string };
  color: string;
  path: string;
  label: string;
}
export interface BreadboardLayout {
  rails: Record<RailId, string | null>;
  strips: BBStrip[];
  modules: BBModule[];
  inlines: BBInline[];
  wires: BBWire[];
  /** hole id -> what occupies it */
  occupied: Map<string, string>;
  /** pinKey -> hole id */
  pinHole: Map<string, string>;
  /** pinKey -> human breadboard location */
  pinLocation: Map<string, string>;
  /** net id -> human breadboard location */
  netLocation: Map<string, string>;
  warnings: string[];
  bounds: { x: number; y: number; w: number; h: number };
  pcbOnly: boolean;
}

export function holeXY(id: string): { x: number; y: number } | null {
  const m = /^(T\+|T-|B\+|B-)(\d+)$/.exec(id);
  if (m) return { x: railHoleX(Number(m[2])), y: RAIL_Y[m[1] as RailId] };
  const s = /^([a-j])(\d+)$/.exec(id);
  if (s) return { x: rowX(Number(s[2])), y: LETTER_Y[s[1]] };
  return null;
}

export function railName(r: RailId): string {
  return `${r[0] === "T" ? "top" : "bottom"} ${r[1] === "+" ? "+" : "−"} rail`;
}

export function describeHole(id: string): string {
  const m = /^(T\+|T-|B\+|B-)(\d+)$/.exec(id);
  if (m) return railName(m[1] as RailId);
  const s = /^([a-j])(\d+)$/.exec(id);
  if (s) return `row ${s[2]} ${s[1]}`;
  return id;
}

export function wirePath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  const s = dy >= 0 ? 1 : -1;
  const k = Math.max(28, Math.min(160, Math.abs(dy) * 0.55));
  const f = (n: number) => n.toFixed(1);
  return `M${f(x1)},${f(y1)} C${f(x1)},${f(y1 + s * k)} ${f(x2)},${f(y2 - s * k * 0.7)} ${f(x2)},${f(y2)}`;
}

const KIND_BOARD: Record<string, string> = {
  mcu: "#1d3a5c",
  driver: "#7a2222",
  power: "#4a2f6b",
  actuator: "#4b5563",
  sensor: "#1e4f8f",
  display: "#14532d",
  communication: "#115e59",
  module: "#166534",
  connector: "#374151",
  passive: "#52525b",
  other: "#3f3f46",
};

export function isInline(c: EComponent): boolean {
  return c.mount === "breadboard" && c.pins.length >= 1 && c.pins.length <= 4 && c.kind !== "mcu";
}

export function inlineShape(c: EComponent): InlineShape {
  const t = `${c.id} ${c.name} ${c.partNumber ?? ""} ${c.value ?? ""} ${c.description ?? ""}`;
  const v = c.value ?? "";
  if (/^R\d+$/i.test(c.id) || /^\s*[\d.]+\s*[kKmM]?[\d]*\s*(Ω|ohms?|R)\s*$/i.test(v) || /^\s*\d+[kKR]\d+\s*$/.test(v)) return "resistor";
  if (/\bled\b|light.?emitting/i.test(t)) return "led";
  if (/resist|ohm|Ω/i.test(t)) return "resistor";
  if (/electrolytic|tantalum/i.test(t)) return "electrolytic";
  if (/capacit|^C\d|[µu]F|nF|pF/i.test(t)) {
    const m = /([\d.]+)\s*[µu]F/i.exec(c.value ?? "");
    return m && Number(m[1]) >= 1 ? "electrolytic" : "capacitor";
  }
  if (/button|switch|tact|push|^SW/i.test(t)) return "button";
  if (/diode|1N4|schottky|^D\d/i.test(t)) return "diode";
  return "generic";
}

function ledColor(c: EComponent): string {
  const t = `${c.name} ${c.value ?? ""} ${c.partNumber ?? ""} ${c.description ?? ""}`.toLowerCase();
  if (t.includes("green")) return "#22c55e";
  if (t.includes("blue")) return "#3b82f6";
  if (t.includes("yellow")) return "#facc15";
  if (t.includes("white")) return "#f8fafc";
  if (t.includes("orange")) return "#fb923c";
  return "#ef4444";
}

export function layoutBreadboard(spec: ElectronicsSpec, netlist?: Netlist): BreadboardLayout {
  const nl = netlist ?? buildNetlist(spec);
  const warnings: string[] = [];
  const comps = nl.components;
  const pcbOnly = comps.length > 0 && comps.every((c) => c.mount === "pcb");

  /* ---------------- rails ---------------- */
  const powerNets = nl.nets.filter((n) => n.type === "power" && n.nodes.length > 0);
  const groundNets = nl.nets.filter((n) => n.type === "ground" && n.nodes.length > 0).sort((a, b) => b.nodes.length - a.nodes.length);
  const pick = (cands: typeof powerNets, target: number) => {
    if (!cands.length) return null;
    return [...cands].sort((a, b) => {
      const da = a.voltage === undefined ? 1e9 : Math.abs(a.voltage - target);
      const db = b.voltage === undefined ? 1e9 : Math.abs(b.voltage - target);
      return da !== db ? da - db : b.nodes.length - a.nodes.length || a.index - b.index;
    })[0];
  };
  const topP = pick(powerNets, Number(spec.supplyVoltage) || 0);
  const botP = pick(powerNets.filter((n) => n !== topP), Number(spec.logicVoltage) || 0) ?? topP;
  const gnd = groundNets[0] ?? null;
  const rails: Record<RailId, string | null> = { "T+": topP?.id ?? null, "T-": gnd?.id ?? null, "B-": gnd?.id ?? null, "B+": botP?.id ?? null };
  const railsOf = (netId: string) => RAIL_IDS.filter((r) => rails[r] === netId);

  const occupied = new Map<string, string>();
  const railFree: Record<RailId, boolean[]> = { "T+": [], "T-": [], "B-": [], "B+": [] };
  for (const r of RAIL_IDS) railFree[r] = new Array(RAIL_HOLES).fill(true);
  const takeRail = (r: RailId, prefX: number, owner: string): string | null => {
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < RAIL_HOLES; k++) {
      if (!railFree[r][k]) continue;
      const d = Math.abs(railHoleX(k) - prefX);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0) return null;
    railFree[r][best] = false;
    const id = `${r}${best}`;
    occupied.set(id, owner);
    return id;
  };

  /* ---------------- modules ---------------- */
  const inlineComps = comps.filter(isInline);
  const moduleComps = comps.filter((c) => !isInline(c));
  const sorted = moduleComps.map((c, i) => ({ c, i })).sort((a, b) => kindOrder(a.c.kind) - kindOrder(b.c.kind) || a.i - b.i).map((x) => x.c);
  const sizeOf = (c: EComponent) => {
    const maxLabel = c.pins.reduce((m, p) => Math.max(m, Math.min(8, p.label.length)), 0);
    return {
      w: Math.max(c.pins.length * MODULE_PITCH + 16, Math.min(30, c.name.length) * 5.6 + 20, 64),
      h: Math.max(48, Math.min(84, 32 + maxLabel * 4.4)),
    };
  };
  let above = sorted.filter((c) => kindOrder(c.kind) <= 3);
  let below = sorted.filter((c) => kindOrder(c.kind) > 3);
  const totW = (arr: EComponent[]) => arr.reduce((s, c) => s + sizeOf(c).w + 16, 0);
  for (let guard = 0; guard < sorted.length; guard++) {
    const a = totW(above);
    const b = totW(below);
    if (a > b * 1.8 + 200 && above.length > 1) {
      const m = above[above.length - 1];
      const na = a - sizeOf(m).w - 16;
      const nb = b + sizeOf(m).w + 16;
      if (Math.abs(na - nb) >= Math.abs(a - b)) break;
      above = above.slice(0, -1);
      below = [m, ...below];
    } else if (b > a * 1.8 + 200 && below.length > 1) {
      const m = below[0];
      const na = a + sizeOf(m).w + 16;
      const nb = b - sizeOf(m).w - 16;
      if (Math.abs(na - nb) >= Math.abs(a - b)) break;
      below = below.slice(1);
      above = [...above, m];
    } else break;
  }
  const modules: BBModule[] = [];
  const maxRowW = Math.max(BB_W + 220, ...moduleComps.map((c) => sizeOf(c).w));
  const placeSide = (list: EComponent[], side: "above" | "below") => {
    const rows: EComponent[][] = [];
    let cur: EComponent[] = [];
    let w = 0;
    for (const c of list) {
      const cw = sizeOf(c).w;
      if (cur.length && w + 16 + cw > maxRowW) {
        rows.push(cur);
        cur = [];
        w = 0;
      }
      w += (cur.length ? 16 : 0) + cw;
      cur.push(c);
    }
    if (cur.length) rows.push(cur);
    let yCursor = side === "above" ? -GAP : BB_H + GAP;
    for (const row of rows) {
      const rowH = Math.max(...row.map((c) => sizeOf(c).h));
      const rowW = row.reduce((s, c) => s + sizeOf(c).w, 0) + 16 * (row.length - 1);
      let x = BB_W / 2 - rowW / 2;
      for (const c of row) {
        const { w: mw, h: mh } = sizeOf(c);
        const y = side === "above" ? yCursor - mh : yCursor;
        const n = c.pins.length;
        const start = x + (mw - n * MODULE_PITCH) / 2 + MODULE_PITCH / 2;
        modules.push({
          compId: c.id,
          name: c.name,
          partNumber: c.partNumber,
          kind: c.kind,
          x,
          y,
          w: mw,
          h: mh,
          side,
          color: KIND_BOARD[c.kind] ?? KIND_BOARD.other,
          pins: c.pins.map((p, i) => ({
            pinId: p.id,
            label: p.label,
            x: start + i * MODULE_PITCH,
            y: side === "above" ? y + mh - 6 : y + 6,
            netId: nl.pinNet.get(pinKey(c.id, p.id)),
          })),
        });
        x += mw + 16;
      }
      yCursor = side === "above" ? yCursor - rowH - ROW_GAP : yCursor + rowH + ROW_GAP;
    }
  };
  placeSide(above, "above");
  placeSide(below, "below");
  const moduleById = new Map(modules.map((m) => [m.compId, m]));

  /* ---------------- strip nets & clusters ---------------- */
  const inlineIds = new Set(inlineComps.map((c) => c.id));
  const netOfPin = (compId: string, pinId: string) => nl.pinNet.get(pinKey(compId, pinId)) ?? `nc:${compId}:${pinId}`;
  const need = new Map<string, number>();
  for (const n of nl.nets) {
    if (railsOf(n.id).length) continue;
    const hasInline = n.nodes.some((x) => inlineIds.has(x.component));
    if (n.nodes.length >= 2 || hasInline) need.set(n.id, n.nodes.length);
  }
  for (const c of inlineComps)
    for (const p of c.pins) if (!nl.pinNet.has(pinKey(c.id, p.id))) need.set(`nc:${c.id}:${p.id}`, 1);
  const stripsFor = (h: number) => (h <= 5 ? 1 : Math.ceil((h - 2) / 3));

  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  for (const id of need.keys()) parent.set(id, id);
  const adj = new Map<string, Set<string>>();
  for (const c of inlineComps) {
    const ns = c.pins.map((p) => netOfPin(c.id, p.id)).filter((n) => need.has(n));
    for (let i = 1; i < ns.length; i++) {
      parent.set(find(ns[i]), find(ns[0]));
    }
    for (const a of ns)
      for (const b of ns)
        if (a !== b) {
          if (!adj.has(a)) adj.set(a, new Set());
          adj.get(a)!.add(b);
        }
  }
  const clusterMap = new Map<string, string[]>();
  for (const id of need.keys()) {
    const r = find(id);
    if (!clusterMap.has(r)) clusterMap.set(r, []);
    clusterMap.get(r)!.push(id);
  }
  interface Unit {
    nets: string[];
    desiredX: number;
    pref: Half;
  }
  const units: Unit[] = [];
  for (const members of clusterMap.values()) {
    // BFS order so nets joined by a part sit next to each other
    const order: string[] = [];
    const seen = new Set<string>();
    for (const start of members) {
      if (seen.has(start)) continue;
      const q = [start];
      seen.add(start);
      while (q.length) {
        const n = q.shift()!;
        order.push(n);
        for (const m of [...(adj.get(n) ?? [])].sort()) if (!seen.has(m)) (seen.add(m), q.push(m));
      }
    }
    let top = 0;
    let bottom = 0;
    const xs: number[] = [];
    for (const id of order) {
      const net = nl.netById.get(id);
      for (const node of net?.nodes ?? []) {
        const m = moduleById.get(node.component);
        if (m) {
          const p = m.pins.find((pp) => pp.pinId === node.pin);
          if (p) xs.push(p.x);
          if (m.side === "above") top++;
          else bottom++;
        } else if (inlineIds.has(node.component)) {
          const c = nl.compById.get(node.component)!;
          for (const p of c.pins) {
            const rs = railsOf(netOfPin(c.id, p.id));
            if (rs.length && rs.every((r) => r[0] === "T")) top += 2;
            if (rs.length && rs.every((r) => r[0] === "B")) bottom += 2;
          }
        }
      }
    }
    units.push({ nets: order, desiredX: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : BB_W / 2, pref: bottom > top ? "bottom" : "top" });
  }
  units.sort((a, b) => a.desiredX - b.desiredX || a.nets[0].localeCompare(b.nets[0]));

  const totalStrips = [...need.entries()].reduce((s, [, h]) => s + stripsFor(h), 0);
  const g = totalStrips + need.size <= 2 * BB_ROWS - 4 ? 1 : 0;
  const demand = (u: Unit) => u.nets.reduce((s, n) => s + stripsFor(need.get(n)!), 0) + g * (u.nets.length - 1);
  const halfUnits: Record<Half, Unit[]> = { top: [], bottom: [] };
  const used: Record<Half, number> = { top: 0, bottom: 0 };
  const overflow: string[] = [];
  const fits = (h: Half, d: number) => used[h] + (halfUnits[h].length ? g : 0) + d <= BB_ROWS;
  const addUnit = (h: Half, u: Unit) => {
    used[h] += (halfUnits[h].length ? g : 0) + demand(u);
    halfUnits[h].push(u);
  };
  for (const u of units) {
    const d = demand(u);
    const other: Half = u.pref === "top" ? "bottom" : "top";
    if (fits(u.pref, d)) addUnit(u.pref, u);
    else if (fits(other, d)) addUnit(other, u);
    else {
      for (const n of u.nets) {
        const single: Unit = { nets: [n], desiredX: u.desiredX, pref: u.pref };
        const ds = demand(single);
        if (fits(u.pref, ds)) addUnit(u.pref, single);
        else if (fits(other, ds)) addUnit(other, single);
        else overflow.push(n);
      }
    }
  }
  for (const n of overflow) {
    if (!n.startsWith("nc:")) warnings.push(`Breadboard full: net ${nl.netById.get(n)?.name ?? n} not placed`);
  }

  const strips: BBStrip[] = [];
  const netStrips = new Map<string, BBStrip[]>();
  for (const half of ["top", "bottom"] as Half[]) {
    const list = halfUnits[half];
    let cursor = 1;
    list.forEach((u, i) => {
      const d = demand(u);
      const rest = list.slice(i + 1).reduce((s, v) => s + demand(v) + g, 0);
      const desiredStart = Math.round((u.desiredX - 24) / PITCH + 1 - d / 2);
      const maxStart = BB_ROWS - d + 1 - rest;
      const start = Math.max(cursor, Math.min(desiredStart, maxStart));
      let r = start;
      u.nets.forEach((n, j) => {
        const k = stripsFor(need.get(n)!);
        if (r + k - 1 > BB_ROWS) {
          overflow.push(n);
          warnings.push(`Breadboard full: net ${nl.netById.get(n)?.name ?? n} not placed`);
          return;
        }
        const arr: BBStrip[] = [];
        for (let s = 0; s < k; s++) arr.push({ netId: n, row: r + s, half });
        strips.push(...arr);
        netStrips.set(n, arr);
        r += k + (j < u.nets.length - 1 ? g : 0);
      });
      cursor = start + d + g;
    });
  }
  const freeIdx = new Map<string, number[]>();
  const sk = (s: BBStrip) => `${s.half}${s.row}`;
  for (const s of strips) freeIdx.set(sk(s), [0, 1, 2, 3, 4]);
  const holeId = (s: BBStrip, idx: number) => `${LETTERS[s.half][idx]}${s.row}`;
  const takeStrip = (s: BBStrip, owner: string, mode: "front" | "back" | number): string | null => {
    const free = freeIdx.get(sk(s));
    if (!free || !free.length) return null;
    let idx: number;
    if (mode === "front") idx = free.shift()!;
    else if (mode === "back") idx = free.pop()!;
    else {
      const at = free.indexOf(mode);
      if (at < 0) return null;
      idx = free.splice(at, 1)[0];
    }
    const id = holeId(s, idx);
    occupied.set(id, owner);
    return id;
  };

  /* ---------------- wires & parts ---------------- */
  const wires: BBWire[] = [];
  const pinHole = new Map<string, string>();
  const pinLocation = new Map<string, string>();
  const netColor = (id: string) => nl.netById.get(id)?.color ?? "#9ca3af";
  const netName = (id: string) => nl.netById.get(id)?.name ?? id;

  // rail bridges (same net on top and bottom rail)
  for (const [a, b] of [["T-", "B-"], ["T+", "B+"]] as [RailId, RailId][]) {
    const n = rails[a];
    if (!n || rails[b] !== n) continue;
    const h1 = takeRail(a, 0, `bridge:${n}`);
    const h2 = takeRail(b, 0, `bridge:${n}`);
    if (!h1 || !h2) continue;
    const p1 = holeXY(h1)!;
    const p2 = holeXY(h2)!;
    wires.push({
      id: `rb-${a}`,
      netId: n,
      kind: "rail-bridge",
      from: { x: p1.x, y: p1.y, hole: h1 },
      to: { x: p2.x, y: p2.y, hole: h2 },
      color: netColor(n),
      path: `M${p1.x},${p1.y} C${p1.x - 46},${p1.y} ${p2.x - 46},${p2.y} ${p2.x},${p2.y}`,
      label: `Rail bridge: ${railName(a)} ↔ ${railName(b)} (net ${netName(n)})`,
    });
  }
  // strip bridges for nets spanning several rows
  for (const [n, arr] of netStrips) {
    for (let i = 0; i + 1 < arr.length; i++) {
      const h1 = takeStrip(arr[i], `bridge:${n}`, "front");
      const h2 = takeStrip(arr[i + 1], `bridge:${n}`, "front");
      if (!h1 || !h2) continue;
      const p1 = holeXY(h1)!;
      const p2 = holeXY(h2)!;
      const dir = arr[i].half === "top" ? 1 : -1;
      wires.push({
        id: `sb-${n}-${i}`,
        netId: n,
        kind: "bridge",
        from: { x: p1.x, y: p1.y, hole: h1 },
        to: { x: p2.x, y: p2.y, hole: h2 },
        color: netColor(n),
        path: `M${p1.x},${p1.y} Q${(p1.x + p2.x) / 2},${p1.y + dir * 9} ${p2.x},${p2.y}`,
        label: `Jumper: row ${arr[i].row} ↔ row ${arr[i + 1].row} (net ${netName(n)})`,
      });
    }
  }

  // inline parts
  const inlines: BBInline[] = [];
  let railOnlyCount = 0;
  for (const c of inlineComps) {
    const owner = `part:${c.id}`;
    const pins: BBInlinePin[] = [];
    const chosen: { pinIdx: number; strip: BBStrip }[] = [];
    c.pins.forEach((p, i) => {
      const n = netOfPin(c.id, p.id);
      const arr = netStrips.get(n);
      if (arr && arr.length) {
        const best = [...arr].sort((a, b) => (freeIdx.get(sk(b))?.length ?? 0) - (freeIdx.get(sk(a))?.length ?? 0))[0];
        chosen.push({ pinIdx: i, strip: best });
      }
    });
    const distinct = new Set(chosen.map((x) => sk(x.strip))).size === chosen.length;
    let common = -1;
    if (distinct && chosen.length > 1) {
      for (let idx = 0; idx < 5 && common < 0; idx++) if (chosen.every((x) => freeIdx.get(sk(x.strip))?.includes(idx))) common = idx;
    }
    const placed = new Map<number, string>();
    for (const ch of chosen) {
      const h = takeStrip(ch.strip, owner, common >= 0 ? common : "front") ?? takeStrip(ch.strip, owner, "front");
      if (h) placed.set(ch.pinIdx, h);
    }
    const xs = [...placed.values()].map((h) => holeXY(h)!.x);
    let prefX = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : rowX(Math.min(BB_ROWS - 2, 6 + 7 * railOnlyCount));
    if (!xs.length) railOnlyCount++;
    let side: "T" | "B" | null = chosen.length ? (chosen[0].strip.half === "top" ? "T" : "B") : null;
    c.pins.forEach((p, i) => {
      if (placed.has(i)) return;
      const n = netOfPin(c.id, p.id);
      const rs = railsOf(n);
      if (!rs.length) {
        if (!n.startsWith("nc:") && !overflow.includes(n)) warnings.push(`${c.name} pin ${p.label}: net has no breadboard location`);
        return;
      }
      const r = (side && rs.find((x) => x[0] === side)) || rs[0];
      const h = takeRail(r, prefX, owner);
      if (!h) {
        warnings.push(`${railName(r)} full: ${c.name} pin ${p.label} not placed`);
        return;
      }
      side = side ?? (r[0] as "T" | "B");
      prefX = holeXY(h)!.x;
      placed.set(i, h);
    });
    c.pins.forEach((p, i) => {
      const h = placed.get(i);
      if (!h) return;
      const xy = holeXY(h)!;
      pins.push({ pinId: p.id, label: p.label, hole: h, x: xy.x, y: xy.y, netId: nl.pinNet.get(pinKey(c.id, p.id)) });
      pinHole.set(pinKey(c.id, p.id), h);
      pinLocation.set(pinKey(c.id, p.id), describeHole(h));
    });
    const shape = inlineShape(c);
    inlines.push({ compId: c.id, name: c.name, value: c.value, shape, color: shape === "led" ? ledColor(c) : "#c9b48a", pins });
  }

  // module wires
  for (const m of modules) {
    for (const p of m.pins) {
      const n = p.netId;
      if (!n) continue;
      const owner = `wire:${m.compId}.${p.pinId}`;
      let hole: string | null = null;
      const rs = railsOf(n);
      if (rs.length) {
        const pref = rs.filter((r) => (m.side === "above" ? r[0] === "T" : r[0] === "B"));
        const r = pref[0] ?? rs[0];
        hole = takeRail(r, p.x, owner);
        if (!hole && rs.length > 1) hole = takeRail(rs.find((x) => x !== r)!, p.x, owner);
        if (!hole) warnings.push(`${railName(r)} full: ${m.name} ${p.label} not wired`);
      } else {
        const arr = netStrips.get(n);
        if (arr && arr.length) {
          const cands = [...arr].sort((a, b) => Math.abs(rowX(a.row) - p.x) - Math.abs(rowX(b.row) - p.x));
          for (const s of cands) {
            hole = takeStrip(s, owner, "back");
            if (hole) break;
          }
          if (!hole) warnings.push(`Strip for net ${netName(n)} full: ${m.name} ${p.label} not wired`);
        }
      }
      if (!hole) continue;
      const xy = holeXY(hole)!;
      const net = nl.netById.get(n);
      const others = (net?.nodes ?? []).filter((x) => !(x.component === m.compId && x.pin === p.pinId));
      const otherTxt = others.slice(0, 4).map(nodeLabel).join(", ") + (others.length > 4 ? ` +${others.length - 4} more` : "");
      wires.push({
        id: `w-${m.compId}-${p.pinId}`,
        netId: n,
        kind: "module",
        from: { x: p.x, y: p.y, compId: m.compId, pinId: p.pinId },
        to: { x: xy.x, y: xy.y, hole },
        color: netColor(n),
        path: wirePath(p.x, p.y, xy.x, xy.y),
        label: `${m.name} ${p.label} → ${describeHole(hole)} (net ${netName(n)})${otherTxt ? ` → ${otherTxt}` : ""}`,
      });
      pinHole.set(pinKey(m.compId, p.pinId), hole);
      pinLocation.set(pinKey(m.compId, p.pinId), describeHole(hole));
    }
  }

  /* ---------------- locations ---------------- */
  const netLocation = new Map<string, string>();
  for (const n of nl.nets) {
    const rs = railsOf(n.id);
    if (rs.length) {
      netLocation.set(n.id, rs.map(railName).join(" + "));
      continue;
    }
    const arr = netStrips.get(n.id);
    if (arr && arr.length) {
      const rows = arr.map((s) => s.row);
      const lo = Math.min(...rows);
      const hi = Math.max(...rows);
      const letters = arr[0].half === "top" ? "f-j" : "a-e";
      netLocation.set(n.id, lo === hi ? `row ${lo} ${letters}` : `rows ${lo}-${hi} ${letters}`);
    } else if (overflow.includes(n.id)) netLocation.set(n.id, "not placed (board full)");
    else netLocation.set(n.id, n.nodes.length < 2 ? "single pin — no wiring" : "direct wire");
  }

  let x0 = -60;
  let y0 = -20;
  let x1 = BB_W + 20;
  let y1 = BB_H + 20;
  for (const m of modules) {
    x0 = Math.min(x0, m.x - 20);
    y0 = Math.min(y0, m.y - 20);
    x1 = Math.max(x1, m.x + m.w + 20);
    y1 = Math.max(y1, m.y + m.h + 20);
  }
  return {
    rails,
    strips,
    modules,
    inlines,
    wires,
    occupied,
    pinHole,
    pinLocation,
    netLocation,
    warnings,
    bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    pcbOnly,
  };
}

/* ---------------- resistor colour code ---------------- */
const BAND = ["#000000", "#8b4513", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#9e9e9e", "#fafafa"];

export function parseOhms(value?: string): number | null {
  if (!value) return null;
  const s = value.replace(/\s+/g, "").replace(/ohms?|Ω/gi, "");
  let m = /^(\d+)([RKkMm])(\d+)$/.exec(s); // 4k7, 10R0
  if (m) {
    const mult = m[2].toUpperCase() === "K" ? 1e3 : m[2].toUpperCase() === "M" ? 1e6 : 1;
    return Number(`${m[1]}.${m[3]}`) * mult;
  }
  m = /^(\d+(?:\.\d+)?)([kKmMR]?)/.exec(s);
  if (!m) return null;
  const mult = m[2] === "k" || m[2] === "K" ? 1e3 : m[2] === "M" || m[2] === "m" ? 1e6 : 1;
  const v = Number(m[1]) * mult;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 4-band colours (digit, digit, multiplier, tolerance gold) */
export function resistorBands(value?: string): string[] {
  const ohms = parseOhms(value);
  if (!ohms) return ["#8b4513", "#000000", "#e53935", "#c9a227"];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / Math.pow(10, exp));
  if (sig >= 100) {
    sig = Math.round(sig / 10);
    exp += 1;
  }
  const d1 = Math.floor(sig / 10) % 10;
  const d2 = sig % 10;
  const mult = exp < 0 ? "#c9a227" : BAND[Math.min(9, exp)];
  return [BAND[d1], BAND[d2], mult, "#c9a227"];
}
