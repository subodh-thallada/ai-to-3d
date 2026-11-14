/**
 * Netlist model: resolves an ElectronicsSpec into validated components / nets with colours,
 * pin->net lookup and warnings. Pure (no React) so layouts and tests can share it.
 */
import type { EComponent, EComponentKind, EPin, ElectronicsSpec, FirmwareSpec, Net, NetNode, NetType } from "@protoforge/shared";

export const pinKey = (component: string, pin: string) => `${component}::${pin}`;

export interface RNode {
  component: string;
  pin: string;
  comp: EComponent;
  pinDef: EPin;
}

export interface RNet {
  id: string;
  name: string;
  type: NetType;
  voltage?: number;
  net: Net;
  nodes: RNode[];
  /** Nodes that referenced unknown components / pins (or pins already used by another net) */
  dropped: NetNode[];
  /** Physical wire colour (hex), e.g. black for ground */
  color: string;
  /** Colour readable on the dark UI background */
  display: string;
  index: number;
}

export interface Netlist {
  spec: ElectronicsSpec;
  components: EComponent[];
  compById: Map<string, EComponent>;
  nets: RNet[];
  netById: Map<string, RNet>;
  /** pinKey(component, pin) -> net id */
  pinNet: Map<string, string>;
  warnings: string[];
}

const NAMED: Record<string, string> = {
  red: "#e5484d",
  black: "#202329",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#facc15",
  orange: "#fb923c",
  white: "#eef2f7",
  gray: "#9ca3af",
  grey: "#9ca3af",
  purple: "#a855f7",
  violet: "#a855f7",
  brown: "#a16207",
  pink: "#f472b6",
  cyan: "#22d3ee",
  teal: "#2dd4bf",
  magenta: "#e879f9",
  lime: "#a3e635",
  gold: "#eab308",
  silver: "#cbd5e1",
  navy: "#1e40af",
  maroon: "#9f1239",
  olive: "#84cc16",
};

const SIGNAL_PALETTE = [
  "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#2dd4bf", "#fb923c",
  "#c084fc", "#60a5fa", "#4ade80", "#e879f9", "#fbbf24", "#22d3ee", "#f9a8d4", "#86efac", "#93c5fd",
];
const POWER_PALETTE = ["#ef4444", "#f97316", "#ec4899", "#f43f5e", "#d946ef"];

function normalizeColor(c?: string): string | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) {
    if (s.length === 4) return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return s;
  }
  const word = s.replace(/[^a-z]/g, " ").split(" ").find((w) => NAMED[w]);
  return word ? NAMED[word] : null;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function buildNetlist(spec: ElectronicsSpec): Netlist {
  const warnings: string[] = [];
  const components: EComponent[] = [];
  const compById = new Map<string, EComponent>();
  const compByName = new Map<string, EComponent>();

  (spec.components ?? []).forEach((raw, i) => {
    if (!raw) return;
    let id = (raw.id ?? "").trim() || `U${i + 1}`;
    if (compById.has(id)) {
      let n = 2;
      while (compById.has(`${id}_${n}`)) n++;
      warnings.push(`Duplicate component id "${id}" renamed to "${id}_${n}"`);
      id = `${id}_${n}`;
    }
    const seen = new Set<string>();
    const pins: EPin[] = [];
    for (const p of raw.pins ?? []) {
      if (!p || !p.id) continue;
      if (seen.has(p.id)) {
        warnings.push(`${id}: duplicate pin "${p.id}" ignored`);
        continue;
      }
      seen.add(p.id);
      pins.push({ id: p.id, label: p.label || p.id, type: p.type || "signal" });
    }
    const comp: EComponent = { ...raw, id, name: raw.name || id, pins, kind: raw.kind || "other", mount: raw.mount || "offboard" };
    components.push(comp);
    compById.set(id, comp);
    const nk = comp.name.trim().toLowerCase();
    if (!compByName.has(nk)) compByName.set(nk, comp);
  });

  const findComp = (ref: string): EComponent | undefined => {
    if (!ref) return undefined;
    return compById.get(ref) ?? compByName.get(ref.trim().toLowerCase()) ?? components.find((c) => c.id.toLowerCase() === ref.trim().toLowerCase());
  };
  const findPin = (comp: EComponent, ref: string): EPin | undefined => {
    if (!ref) return undefined;
    const r = String(ref).trim().toLowerCase();
    return comp.pins.find((p) => p.id === ref) ?? comp.pins.find((p) => p.id.toLowerCase() === r) ?? comp.pins.find((p) => p.label.toLowerCase() === r);
  };

  const pinNet = new Map<string, string>();
  const nets: RNet[] = [];
  const netById = new Map<string, RNet>();
  let powerIdx = 0;
  let sigIdx = 0;

  (spec.nets ?? []).forEach((raw, i) => {
    if (!raw) return;
    let id = (raw.id ?? "").trim() || `N${i + 1}`;
    if (netById.has(id)) {
      let n = 2;
      while (netById.has(`${id}_${n}`)) n++;
      warnings.push(`Duplicate net id "${id}" renamed to "${id}_${n}"`);
      id = `${id}_${n}`;
    }
    const type: NetType = raw.type || "signal";
    const nodes: RNode[] = [];
    const dropped: NetNode[] = [];
    for (const node of raw.nodes ?? []) {
      if (!node) continue;
      const comp = findComp(node.component);
      const pinDef = comp ? findPin(comp, node.pin) : undefined;
      if (!comp || !pinDef) {
        dropped.push(node);
        warnings.push(`Net ${raw.name || id}: unknown ${comp ? "pin" : "component"} ${node.component}.${node.pin}`);
        continue;
      }
      const key = pinKey(comp.id, pinDef.id);
      const prev = pinNet.get(key);
      if (prev === id) continue; // duplicate node in the same net
      if (prev) {
        dropped.push(node);
        warnings.push(`${comp.id}.${pinDef.id} is in nets ${prev} and ${raw.name || id}; kept in ${prev}`);
        continue;
      }
      pinNet.set(key, id);
      nodes.push({ component: comp.id, pin: pinDef.id, comp, pinDef });
    }
    let color = normalizeColor(raw.color);
    if (!color) {
      if (type === "ground") color = NAMED.black;
      else if (type === "power") color = POWER_PALETTE[powerIdx++ % POWER_PALETTE.length];
      else color = SIGNAL_PALETTE[sigIdx++ % SIGNAL_PALETTE.length];
    }
    const display = luminance(color) < 0.22 ? "#94a3b8" : color;
    const rn: RNet = { id, name: raw.name || id, type, voltage: typeof raw.voltage === "number" ? raw.voltage : undefined, net: raw, nodes, dropped, color, display, index: nets.length };
    nets.push(rn);
    netById.set(id, rn);
  });

  return { spec, components, compById, nets, netById, pinNet, warnings };
}

/** Nicely formatted voltage */
export function fmtV(v?: number): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "";
  return `${Number(v.toFixed(2))}V`;
}

export function nodeLabel(n: RNode): string {
  return `${n.comp.name} ${n.pinDef.label}`;
}

/** Column bucket used by both schematic and breadboard for left-to-right ordering. */
export function kindOrder(kind: EComponentKind): number {
  switch (kind) {
    case "power":
    case "connector":
      return 0;
    case "actuator":
      return 1;
    case "driver":
      return 2;
    case "mcu":
      return 3;
    case "sensor":
    case "display":
    case "communication":
    case "module":
    case "other":
      return 4;
    case "passive":
      return 5;
    default:
      return 4;
  }
}

/** Firmware pin functions keyed by pinKey (best-effort fuzzy matching of pinMap entries). */
export function firmwareFunctions(nl: Netlist, fw?: FirmwareSpec | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!fw || !Array.isArray(fw.pinMap)) return out;
  const norm = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = (s: string) => (String(s ?? "").match(/\d+/) ?? [""])[0];
  const mcus = nl.components.filter((c) => c.kind === "mcu");
  for (const e of fw.pinMap) {
    if (!e || !e.pin) continue;
    const cref = norm(e.component);
    let cands = nl.components.filter((c) => cref && (norm(c.id) === cref || norm(c.name) === cref || (c.partNumber && norm(c.partNumber) === cref)));
    if (!cands.length) cands = nl.components.filter((c) => cref && (norm(c.name).includes(cref) || cref.includes(norm(c.id))));
    if (!cands.length) cands = mcus;
    const pr = norm(e.pin);
    for (const c of cands) {
      let pin = c.pins.find((p) => norm(p.id) === pr || norm(p.label) === pr);
      if (!pin && digits(e.pin)) {
        const d = digits(e.pin);
        pin = c.pins.find((p) => /^(GPIO|IO|D|P|GP)?\d+$/.test(norm(p.label)) && digits(p.label) === d && /^(GPIO|IO|D|P|GP)?\d+$/.test(pr));
      }
      if (pin) {
        const k = pinKey(c.id, pin.id);
        const arr = out.get(k) ?? [];
        if (e.function && !arr.includes(e.function)) arr.push(e.function);
        out.set(k, arr);
        break;
      }
    }
  }
  return out;
}
