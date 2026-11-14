/**
 * Deterministic schematic auto-layout (pure). Components become blocks arranged in columns
 * (power | actuators | drivers | MCU | sensors & IO | passives); power pins on top, ground pins at the bottom,
 * signal pins on the side facing the parts they connect to. Two-pin nets between adjacent columns become
 * orthogonal wires routed on per-gap tracks; everything else uses coloured net-label flags.
 */
import type { EComponent, EPin } from "@protoforge/shared";
import { kindOrder, pinKey, type Netlist } from "./model";

export type Side = "left" | "right" | "top" | "bottom";
export const CHAR_W = 6.1;
const PIN_PITCH = 20;
const STUB = 20;
const COL_V_GAP = 34;
const MAX_COL_H = 1150;

export interface SchPin {
  key: string;
  comp: string;
  pin: EPin;
  side: Side;
  /** attachment point on the block edge */
  ax: number;
  ay: number;
  /** stub end */
  x: number;
  y: number;
  netId?: string;
  /** "wire" | "flag" | "symbol" | "nc" */
  conn: "wire" | "flag" | "symbol" | "nc";
}
export interface SchBlock {
  comp: EComponent;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** y of the title baseline */
  titleY: number;
  pins: SchPin[];
}
export interface SchWire {
  netId: string;
  points: [number, number][];
}
export interface SchFlag {
  netId: string;
  pinKey: string;
  x: number;
  y: number;
  side: "left" | "right";
  w: number;
  label: string;
}
export interface SchSymbol {
  netId: string;
  pinKey: string;
  x: number;
  y: number;
  kind: "power" | "ground";
  label: string;
}
export interface SchematicLayout {
  blocks: SchBlock[];
  wires: SchWire[];
  flags: SchFlag[];
  symbols: SchSymbol[];
  bounds: { x: number; y: number; w: number; h: number };
}

const flagW = (label: string) => Math.min(label.length, 22) * CHAR_W + 16;

interface Proto {
  comp: EComponent;
  col: number;
  left: EPin[];
  right: EPin[];
  top: EPin[];
  bottom: EPin[];
  w: number;
  h: number;
  headerH: number;
  topPitch: number;
  botPitch: number;
  extTop: number;
  extBottom: number;
  order: number;
}

export function layoutSchematic(nl: Netlist): SchematicLayout {
  const comps = nl.components;
  // logical columns, compacted
  const rawCols = [...new Set(comps.map((c) => kindOrder(c.kind)))].sort((a, b) => a - b);
  const colIndex = new Map(rawCols.map((c, i) => [c, i]));
  const compCol = new Map(comps.map((c) => [c.id, colIndex.get(kindOrder(c.kind))!]));

  const netOf = (c: string, p: string) => nl.pinNet.get(pinKey(c, p));

  // side assignment
  const protos: Proto[] = comps.map((comp, order) => {
    const col = compCol.get(comp.id)!;
    const left: EPin[] = [];
    const right: EPin[] = [];
    const top: EPin[] = [];
    const bottom: EPin[] = [];
    const undecided: EPin[] = [];
    for (const pin of comp.pins) {
      const nid = netOf(comp.id, pin.id);
      const net = nid ? nl.netById.get(nid) : undefined;
      if (net?.type === "ground" || (!net && pin.type === "ground")) bottom.push(pin);
      else if (net?.type === "power" || (!net && (pin.type === "power_in" || pin.type === "power_out"))) top.push(pin);
      else if (net) {
        const others = net.nodes.filter((n) => n.component !== comp.id).map((n) => compCol.get(n.component)!);
        if (!others.length) undecided.push(pin);
        else {
          const avg = others.reduce((a, b) => a + b, 0) / others.length;
          if (avg < col - 0.01) left.push(pin);
          else if (avg > col + 0.01) right.push(pin);
          else undecided.push(pin);
        }
      } else undecided.push(pin);
    }
    for (const pin of undecided) (left.length <= right.length ? left : right).push(pin);
    // tiny parts with everything on top/bottom still get a usable body
    const maxSideLabel = (arr: EPin[]) => arr.reduce((m, p) => Math.max(m, Math.min(14, p.label.length)), 0);
    const maxLabel = (arr: EPin[]) => arr.reduce((m, p) => Math.max(m, Math.min(10, p.label.length)), 0);
    const topPitch = Math.max(28, maxLabel(top) * CHAR_W * 0.92 + 12);
    const botPitch = Math.max(28, maxLabel(bottom) * CHAR_W * 0.92 + 12);
    const title = comp.name.slice(0, 30);
    const sub = (comp.partNumber ?? "").slice(0, 32);
    const w = Math.ceil(
      Math.max(
        110,
        (maxSideLabel(left) + maxSideLabel(right)) * CHAR_W + 36,
        title.length * 7 + 24,
        sub.length * CHAR_W + 20,
        (comp.value ?? "").length * CHAR_W + 20,
        top.length * topPitch + 12,
        bottom.length * botPitch + 12,
      ),
    );
    const headerH = 8 + (top.length ? 16 : 0) + 15 + (sub ? 13 : 0) + (comp.value ? 13 : 0) + 8;
    const rows = Math.max(left.length, right.length);
    const h = Math.max(48, headerH + rows * PIN_PITCH + (bottom.length ? 18 : 4) + 4);
    return {
      comp,
      col,
      left,
      right,
      top,
      bottom,
      w,
      h,
      headerH,
      topPitch,
      botPitch,
      extTop: top.length ? STUB + 26 : 0,
      extBottom: bottom.length ? STUB + 22 : 0,
      order,
    };
  });

  // split overly tall logical columns into sub-columns
  const byCol = new Map<number, Proto[]>();
  for (const p of protos) {
    if (!byCol.has(p.col)) byCol.set(p.col, []);
    byCol.get(p.col)!.push(p);
  }
  const columns: Proto[][] = [];
  for (const c of [...byCol.keys()].sort((a, b) => a - b)) {
    let cur: Proto[] = [];
    let hh = 0;
    for (const p of byCol.get(c)!) {
      const ph = p.extTop + p.h + p.extBottom + COL_V_GAP;
      if (cur.length && hh + ph > MAX_COL_H) {
        columns.push(cur);
        cur = [];
        hh = 0;
      }
      cur.push(p);
      hh += ph;
    }
    if (cur.length) columns.push(cur);
  }
  columns.forEach((col, i) => col.forEach((p) => (p.col = i)));
  const protoById = new Map(protos.map((p) => [p.comp.id, p]));

  // wire decisions: 2-node nets between adjacent columns with facing sides
  const sideOf = (p: Proto, pinId: string): Side =>
    p.left.some((x) => x.id === pinId) ? "left" : p.right.some((x) => x.id === pinId) ? "right" : p.top.some((x) => x.id === pinId) ? "top" : "bottom";
  const wireNets = new Set<string>();
  for (const net of nl.nets) {
    if (net.nodes.length !== 2 || net.type === "power" || net.type === "ground") continue;
    const [a, b] = net.nodes;
    const pa = protoById.get(a.component)!;
    const pb = protoById.get(b.component)!;
    if (pa === pb) continue;
    const [l, r, ln, rn] = pa.col < pb.col ? [pa, pb, a, b] : [pb, pa, b, a];
    if (r.col - l.col !== 1) continue;
    if (sideOf(l, ln.pin) === "right" && sideOf(r, rn.pin) === "left") wireNets.add(net.id);
  }

  // vertical placement with barycentric ordering (2 sweeps)
  const placeY = () => {
    const heights = columns.map((col) => col.reduce((s, p) => s + p.extTop + p.h + p.extBottom + COL_V_GAP, -COL_V_GAP));
    const maxH = Math.max(0, ...heights);
    const ys = new Map<string, number>();
    columns.forEach((col, i) => {
      let y = (maxH - heights[i]) / 2;
      for (const p of col) {
        ys.set(p.comp.id, y + p.extTop);
        y += p.extTop + p.h + p.extBottom + COL_V_GAP;
      }
    });
    return ys;
  };
  let ys = placeY();
  const signalNeighbours = (id: string) => {
    const out: string[] = [];
    for (const pin of protoById.get(id)!.comp.pins) {
      const nid = netOf(id, pin.id);
      const net = nid ? nl.netById.get(nid) : undefined;
      if (!net || net.type === "power" || net.type === "ground") continue;
      for (const n of net.nodes) if (n.component !== id) out.push(n.component);
    }
    return out;
  };
  for (let sweep = 0; sweep < 2; sweep++) {
    for (const col of columns) {
      const score = new Map<string, number>();
      for (const p of col) {
        const nb = signalNeighbours(p.comp.id).filter((n) => protoById.get(n)!.col !== p.col);
        const cy = ys.get(p.comp.id)! + p.h / 2;
        score.set(p.comp.id, nb.length ? nb.reduce((s, n) => s + ys.get(n)! + protoById.get(n)!.h / 2, 0) / nb.length : cy);
      }
      col.sort((a, b) => score.get(a.comp.id)! - score.get(b.comp.id)! || a.order - b.order);
    }
    ys = placeY();
  }

  // order side pins by the y of what they connect to (reduces crossings); keep stable when unknown
  // Bigger blocks (MCU) keep datasheet pin order; smaller blocks reorder their wired pins to follow the
  // actual pin y of the bigger block they connect to, which removes most wire crossings.
  const rank = (p: Proto) => p.comp.pins.length * 1000 - p.order;
  const pinYNow = (p: Proto, pinId: string) => {
    const li = p.left.findIndex((x) => x.id === pinId);
    const ri = p.right.findIndex((x) => x.id === pinId);
    const i = li >= 0 ? li : ri;
    return ys.get(p.comp.id)! + p.headerH + Math.max(0, i) * PIN_PITCH + PIN_PITCH / 2;
  };
  for (const p of [...protos].sort((a, b) => rank(b) - rank(a))) {
    for (const arr of [p.left, p.right]) {
      const keyed = arr.map((pin, i) => {
        const nid = netOf(p.comp.id, pin.id);
        if (!nid || !wireNets.has(nid)) return { pin, i, t: null as number | null };
        const other = nl.netById.get(nid)!.nodes.find((n) => n.component !== p.comp.id);
        const op = other ? protoById.get(other.component) : undefined;
        if (!other || !op || rank(op) < rank(p)) return { pin, i, t: null };
        return { pin, i, t: pinYNow(op, other.pin) };
      });
      const movable = keyed.filter((k) => k.t !== null);
      if (movable.length < 2) continue;
      const slots = movable.map((k) => k.i);
      const sortedW = [...movable].sort((a, b) => a.t! - b.t! || a.i - b.i);
      slots.forEach((slot, j) => (arr[slot] = sortedW[j].pin));
    }
  }

  // horizontal placement: gaps sized by flag widths and wire tracks
  const colW = columns.map((col) => Math.max(...col.map((p) => p.w)));
  const flagSpace = (col: Proto[], side: "left" | "right") =>
    Math.max(
      0,
      ...col.flatMap((p) =>
        (side === "left" ? p.left : p.right).map((pin) => {
          const nid = netOf(p.comp.id, pin.id);
          if (!nid || wireNets.has(nid)) return 0;
          return flagW(nl.netById.get(nid)!.name) + 4;
        }),
      ),
    );

  // pre-compute pin positions relative to block origin (x=0,y=0) to know wire y-extents
  const blocks: SchBlock[] = [];
  const colX: number[] = [];
  // wires per gap
  const gapWires: { netId: string; a: { comp: string; pin: string }; b: { comp: string; pin: string } }[][] = columns.map(() => []);
  for (const nid of wireNets) {
    const net = nl.netById.get(nid)!;
    const [a, b] = net.nodes;
    const pa = protoById.get(a.component)!;
    const pb = protoById.get(b.component)!;
    const [l, , ln, rn] = pa.col < pb.col ? [pa, pb, a, b] : [pb, pa, b, a];
    gapWires[l.col].push({ netId: nid, a: { comp: ln.component, pin: ln.pin }, b: { comp: rn.component, pin: rn.pin } });
  }
  const sidePinY = (p: Proto, pinId: string) => {
    const li = p.left.findIndex((x) => x.id === pinId);
    const ri = p.right.findIndex((x) => x.id === pinId);
    const i = li >= 0 ? li : ri;
    return ys.get(p.comp.id)! + p.headerH + i * PIN_PITCH + PIN_PITCH / 2;
  };
  // track assignment per gap (interval colouring)
  const trackOf = new Map<string, number>();
  const trackCount: number[] = columns.map(() => 0);
  gapWires.forEach((list, gi) => {
    const items = list
      .map((w) => {
        const y1 = sidePinY(protoById.get(w.a.comp)!, w.a.pin);
        const y2 = sidePinY(protoById.get(w.b.comp)!, w.b.pin);
        return { id: w.netId, lo: Math.min(y1, y2), hi: Math.max(y1, y2), y1, y2 };
      })
      .filter((it) => Math.abs(it.y1 - it.y2) > 0.5);
    // Upward wires: top-most source takes the left-most track; downward wires: bottom-most source first.
    // This ordering keeps parallel wire bundles from crossing each other.
    const up = items.filter((it) => it.y2 < it.y1).sort((a, b) => a.y1 - b.y1);
    const down = items.filter((it) => it.y2 > it.y1).sort((a, b) => b.y1 - a.y1);
    let t = 0;
    for (const it of up) trackOf.set(it.id, t++);
    for (const it of down) trackOf.set(it.id, t++);
    trackCount[gi] = t;
  });

  let x = 0;
  const gapStart: number[] = [];
  columns.forEach((col, i) => {
    if (i > 0) x += STUB + flagSpace(col, "left");
    colX[i] = x;
    x += colW[i];
    if (i < columns.length - 1) {
      x += STUB + flagSpace(col, "right") + 16;
      gapStart[i] = x;
      x += Math.max(0, trackCount[i] - 1) * 9 + 30;
    }
  });

  const flags: SchFlag[] = [];
  const symbols: SchSymbol[] = [];
  const pinPos = new Map<string, SchPin>();
  for (const col of columns) {
    for (const p of col) {
      const bx = colX[p.col] + (colW[p.col] - p.w) / 2;
      const by = ys.get(p.comp.id)!;
      const pins: SchPin[] = [];
      const mk = (pin: EPin, side: Side, ax: number, ay: number, sx: number, sy: number) => {
        const key = pinKey(p.comp.id, pin.id);
        const netId = netOf(p.comp.id, pin.id);
        const net = netId ? nl.netById.get(netId) : undefined;
        let conn: SchPin["conn"] = "nc";
        if (net) {
          if (side === "top" || side === "bottom") conn = "symbol";
          else conn = wireNets.has(net.id) ? "wire" : "flag";
          // single-node nets still get a flag so the name is visible
        }
        const sp: SchPin = { key, comp: p.comp.id, pin, side, ax, ay, x: sx, y: sy, netId, conn };
        pins.push(sp);
        pinPos.set(key, sp);
        if (net && conn === "flag") flags.push({ netId: net.id, pinKey: key, x: sx, y: sy, side: side as "left" | "right", w: flagW(net.name), label: net.name });
        if (net && conn === "symbol") {
          const kind = side === "bottom" ? "ground" : "power";
          symbols.push({ netId: net.id, pinKey: key, x: sx, y: sy, kind, label: net.name });
        }
      };
      p.left.forEach((pin, i) => {
        const y = by + p.headerH + i * PIN_PITCH + PIN_PITCH / 2;
        mk(pin, "left", bx, y, bx - STUB, y);
      });
      p.right.forEach((pin, i) => {
        const y = by + p.headerH + i * PIN_PITCH + PIN_PITCH / 2;
        mk(pin, "right", bx + p.w, y, bx + p.w + STUB, y);
      });
      const tStart = bx + (p.w - p.top.length * p.topPitch) / 2 + p.topPitch / 2;
      p.top.forEach((pin, i) => mk(pin, "top", tStart + i * p.topPitch, by, tStart + i * p.topPitch, by - STUB));
      const bStart = bx + (p.w - p.bottom.length * p.botPitch) / 2 + p.botPitch / 2;
      p.bottom.forEach((pin, i) => mk(pin, "bottom", bStart + i * p.botPitch, by + p.h, bStart + i * p.botPitch, by + p.h + STUB));
      blocks.push({ comp: p.comp, col: p.col, x: bx, y: by, w: p.w, h: p.h, titleY: by + 8 + (p.top.length ? 16 : 0) + 11, pins });
    }
  }

  const wires: SchWire[] = [];
  gapWires.forEach((list, gi) => {
    for (const w of list) {
      const a = pinPos.get(pinKey(w.a.comp, w.a.pin))!;
      const b = pinPos.get(pinKey(w.b.comp, w.b.pin))!;
      const t = trackOf.get(w.netId) ?? 0;
      const tx = gapStart[gi] + t * 9;
      if (Math.abs(a.y - b.y) < 0.5) wires.push({ netId: w.netId, points: [[a.x, a.y], [b.x, b.y]] });
      else wires.push({ netId: w.netId, points: [[a.x, a.y], [tx, a.y], [tx, b.y], [b.x, b.y]] });
    }
  });

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (ax: number, ay: number, bx2: number, by2: number) => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx2);
    y1 = Math.max(y1, by2);
  };
  for (const b of blocks) grow(b.x - STUB, b.y - (b.pins.some((p) => p.side === "top") ? STUB + 28 : 0), b.x + b.w + STUB, b.y + b.h + (b.pins.some((p) => p.side === "bottom") ? STUB + 22 : 0));
  for (const f of flags) grow(f.side === "left" ? f.x - f.w - 4 : f.x, f.y - 8, f.side === "left" ? f.x : f.x + f.w + 4, f.y + 8);
  for (const s of symbols) grow(s.x - s.label.length * 3.2 - 6, s.y - 26, s.x + s.label.length * 3.2 + 6, s.y + 20);
  if (!Number.isFinite(x0)) {
    x0 = 0;
    y0 = 0;
    x1 = 200;
    y1 = 100;
  }
  const pad = 30;
  return { blocks, wires, flags, symbols, bounds: { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 } };
}
