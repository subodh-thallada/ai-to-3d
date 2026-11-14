/**
 * Repair / normalize raw agent output into valid shared types.
 * Every function here is total: it never throws on malformed input, it drops what cannot be repaired
 * and reports problems through the `warn` callback.
 */
import {
  CATALOG_BY_MODEL,
  type AssemblyStep,
  type BomCategory,
  type BomItem,
  type CadCut,
  type CadPart,
  type EComponent,
  type EComponentKind,
  type ElectronicsSpec,
  type EPin,
  type FirmwareSpec,
  type Geometry,
  type Joint,
  type JointType,
  type MaterialPreset,
  type MaterialSpec,
  type Net,
  type NetNode,
  type NetType,
  type PinType,
  type ProductBrief,
  type ReviewCheck,
  type SubsystemPlan,
  type Vec2,
  type Vec3,
} from "@protoforge/shared";
import {
  BOM_CATEGORIES,
  COMPONENT_KINDS,
  FIRMWARE_LANGS,
  GEOMETRY_TYPES,
  JOINT_TYPES,
  MATERIAL_PRESETS,
  NET_TYPES,
  PIN_TYPES,
  REVIEW_CATEGORIES,
} from "./schemas";

export type Warn = (msg: string) => void;
const noop: Warn = () => undefined;

/* ------------------------------------------------------------------ */
/* Primitive coercion                                                  */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Decode the top-level tool input: an object, possibly with stringified nested fields. */
export function asObj(v: unknown): Obj {
  let d = v;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return {};
    }
  }
  if (!isObj(d)) return {};
  const out: Obj = {};
  for (const [k, val] of Object.entries(d)) {
    if (typeof val === "string" && /^\s*[[{]/.test(val)) {
      try {
        out[k] = JSON.parse(val);
        continue;
      } catch {
        /* keep as string */
      }
    }
    out[k] = val;
  }
  return out;
}

export function num(v: unknown, fallback: number): number;
export function num(v: unknown, fallback?: undefined): number | undefined;
export function num(v: unknown, fallback?: number): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.trim().match(/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i);
    if (m) {
      const n = Number(m[0]);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

export function pos(v: unknown, fallback: number): number {
  const n = num(v);
  return n !== undefined && n > 0 ? n : fallback;
}

export function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v.trim() || fallback;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function optStr(v: unknown): string | undefined {
  const s = str(v);
  return s ? s : undefined;
}

export function strArr(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (!Array.isArray(v)) return [];
  return v.map((x) => (isObj(x) ? str(x.text ?? x.name ?? x.description ?? JSON.stringify(x)) : str(x))).filter(Boolean);
}

/** Models occasionally emit nested arrays/objects as JSON-encoded strings; decode those. */
function decodeJsonString(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!(t.startsWith("[") || t.startsWith("{"))) return v;
  try {
    return JSON.parse(t);
  } catch {
    return v;
  }
}

export function arr(v: unknown): unknown[] {
  const d = decodeJsonString(v);
  if (!Array.isArray(d)) return [];
  return d.map(decodeJsonString);
}

export function vec3(v: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (Array.isArray(v)) {
    return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])];
  }
  if (isObj(v)) return [num(v.x, fallback[0]), num(v.y, fallback[1]), num(v.z, fallback[2])];
  if (typeof v === "string") {
    const parts = v.split(/[\s,;]+/).map((x) => num(x));
    if (parts.length >= 3) return [parts[0] ?? fallback[0], parts[1] ?? fallback[1], parts[2] ?? fallback[2]];
  }
  return [...fallback] as Vec3;
}

function optVec3(v: unknown): Vec3 | undefined {
  if (v === undefined || v === null) return undefined;
  const r = vec3(v);
  return r;
}

function vec2(v: unknown): Vec2 | null {
  if (Array.isArray(v)) {
    const a = num(v[0]);
    const b = num(v[1]);
    if (a !== undefined && b !== undefined) return [a, b];
  } else if (isObj(v)) {
    const a = num(v.x ?? v.r);
    const b = num(v.y ?? v.z);
    if (a !== undefined && b !== undefined) return [a, b];
  }
  return null;
}

function vec2List(v: unknown): Vec2[] {
  return arr(v)
    .map(vec2)
    .filter((p): p is Vec2 => p !== null);
}

function enumOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = str(v).toLowerCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

export function slug(s: string, max = 40): string {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return out || "x";
}

/** Make `base` unique within `used` (and register it). */
export function uniqueId(base: string, used: Set<string>): string {
  let id = base || "id";
  let i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  used.add(id);
  return id;
}

/** Wrap an angle into (-180, 180]. */
function wrapDegrees(v: number): number {
  const w = ((v % 360) + 360) % 360;
  return w > 180 ? w - 360 : w;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function color(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(s)) return s;
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}`;
  if (/^[a-z]+$/i.test(s)) return s.toLowerCase(); // CSS colour names
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Brief                                                               */
/* ------------------------------------------------------------------ */

export function normalizeBrief(raw: unknown, prompt: string, warn: Warn = noop): ProductBrief {
  const r = asObj(raw);
  const envelope = vec3(r.envelope, [200, 100, 200]).map((n) => clamp(Math.abs(n) || 100, 1, 20000)) as Vec3;
  const used = new Set<string>();
  const subsystems: SubsystemPlan[] = [];
  for (const s of arr(r.subsystems)) {
    if (!isObj(s)) continue;
    const name = str(s.name, str(s.id, "Subsystem"));
    const id = uniqueId(slug(str(s.id, name), 24), used);
    const env = isObj(s.envelope) ? s.envelope : {};
    subsystems.push({
      id,
      name,
      description: str(s.description, name),
      envelope: {
        center: vec3(env.center, [0, envelope[1] / 2, 0]),
        size: vec3(env.size, envelope).map((n) => Math.abs(n) || 10) as Vec3,
      },
      keyParts: strArr(s.keyParts),
      interfaces: strArr(s.interfaces),
    });
  }
  if (!subsystems.length) {
    warn("architect returned no subsystems; using a single 'Main' subsystem");
    subsystems.push({
      id: "main",
      name: "Main",
      description: "Entire product",
      envelope: { center: [0, envelope[1] / 2, 0], size: envelope },
      keyParts: [],
      interfaces: [],
    });
  }
  const req = isObj(r.requirements) ? r.requirements : {};
  const perf: Record<string, string> = {};
  if (isObj(req.performance)) for (const [k, v] of Object.entries(req.performance)) perf[k] = str(v);
  else for (const x of arr(req.performance)) if (isObj(x)) perf[str(x.name ?? x.key, "metric")] = str(x.value ?? x.target);

  const hasElectronics = r.hasElectronics === undefined ? true : Boolean(r.hasElectronics) && r.hasElectronics !== "false";
  const hasFirmware = hasElectronics && (r.hasFirmware === undefined ? true : Boolean(r.hasFirmware) && r.hasFirmware !== "false");

  return {
    name: str(r.name, prompt.replace(/^build\s+(an?\s+)?/i, "").slice(0, 60) || "Untitled product"),
    tagline: str(r.tagline),
    category: str(r.category, "Hardware"),
    description: str(r.description),
    requirements: {
      functional: strArr(req.functional),
      performance: perf,
      constraints: strArr(req.constraints),
    },
    envelope,
    coordinateNotes: str(r.coordinateNotes, "Y is up, front faces +Z, origin at the centre of the base footprint (y = 0 is the lowest point)."),
    subsystems: subsystems.slice(0, 8),
    keyComponents: arr(r.keyComponents)
      .filter(isObj)
      .map((k) => ({
        name: str(k.name, "Component"),
        partNumber: optStr(k.partNumber),
        role: str(k.role),
        qty: Math.max(1, Math.round(num(k.qty, 1))),
      })),
    hasElectronics,
    hasFirmware,
    firmwarePlatform: hasFirmware ? optStr(r.firmwarePlatform) || "Arduino (ESP32 Arduino core)" : optStr(r.firmwarePlatform),
    risks: strArr(r.risks),
  };
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const MODEL_ALIASES: Record<string, string> = {
  motor: "bldc_motor",
  brushless_motor: "bldc_motor",
  bldc: "bldc_motor",
  gearmotor: "dc_motor",
  gear_motor: "dc_motor",
  n20: "dc_motor",
  tt_motor: "dc_motor",
  prop: "propeller",
  sg90: "servo",
  nema17: "stepper_nema17",
  stepper: "stepper_nema17",
  arduino: "arduino_uno",
  uno: "arduino_uno",
  nano: "arduino_nano",
  esp32: "esp32_devkit",
  pi: "raspberry_pi",
  rpi: "raspberry_pi",
  pico: "pi_pico",
  fc: "flight_controller",
  ic: "chip",
  battery: "battery_lipo",
  lipo: "battery_lipo",
  cell: "battery_cell",
  "18650": "battery_cell",
  regulator: "power_module",
  buck: "power_module",
  camera: "camera_module",
  imu: "sensor_module",
  sensor: "sensor_module",
  hc_sr04: "ultrasonic_sensor",
  ultrasonic: "ultrasonic_sensor",
  gps: "gps_module",
  mic: "microphone",
  screen: "display",
  lcd: "display",
  oled: "oled_module",
  switch: "switch_toggle",
  radio: "rf_module",
  receiver: "rf_module",
  vtx: "rf_module",
  driver: "motor_driver",
  l298n: "motor_driver",
  tb6612: "motor_driver",
  bolt: "screw",
  spacer: "standoff",
  usb_c: "connector",
  xt60: "connector",
  jst: "connector",
  haptic: "vibration_motor",
  taptic: "vibration_motor",
};

function resolveModel(raw: string): string | undefined {
  const m = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (CATALOG_BY_MODEL[m]) return m;
  if (MODEL_ALIASES[m]) return MODEL_ALIASES[m];
  for (const key of Object.keys(CATALOG_BY_MODEL)) if (m.includes(key)) return key;
  for (const [alias, key] of Object.entries(MODEL_ALIASES)) if (m.includes(alias)) return key;
  return undefined;
}

function boxFrom(g: Obj, fallbackSize = 10): Geometry {
  const s = g.size !== undefined ? vec3(g.size, [fallbackSize, fallbackSize, fallbackSize]) : [fallbackSize, fallbackSize, fallbackSize];
  return { type: "box", size: s.map((n) => Math.abs(n) || fallbackSize) as Vec3 };
}

export function normalizeGeometry(raw: unknown, warn: Warn = noop, allowComponentAndTube = true): Geometry {
  const g = isObj(raw) ? raw : {};
  let type = str(g.type).toLowerCase();
  if (!(GEOMETRY_TYPES as readonly string[]).includes(type)) {
    if (type === "cube" || type === "rounded_box") type = "box";
    else if (type === "cylinder_tapered" || type === "frustum") type = "cylinder";
    else if (type === "revolve") type = "lathe";
    else if (type === "wire" || type === "cable" || type === "pipe") type = "tube";
    else if (type === "extrusion" || type === "plate") type = "extrude";
    else if (str(g.model)) type = "component";
    else type = "box";
  }
  if (!allowComponentAndTube && (type === "component" || type === "tube")) type = "box";

  switch (type) {
    case "box": {
      const geo = boxFrom(g) as { type: "box"; size: Vec3; radius?: number };
      const r = num(g.radius);
      if (r !== undefined && r > 0) geo.radius = Math.min(r, Math.min(...geo.size) / 2);
      return geo;
    }
    case "cylinder": {
      const geo: Geometry = { type: "cylinder", radius: pos(g.radius, 5), height: pos(g.height ?? g.length ?? g.depth, 10) };
      const rt = num(g.radiusTop);
      if (rt !== undefined && rt >= 0) geo.radiusTop = rt;
      const seg = num(g.segments);
      if (seg !== undefined && seg >= 3) geo.segments = Math.round(clamp(seg, 3, 128));
      return geo;
    }
    case "cone": {
      const geo: Geometry = { type: "cone", radius: pos(g.radius, 5), height: pos(g.height ?? g.length, 10) };
      const seg = num(g.segments);
      if (seg !== undefined && seg >= 3) geo.segments = Math.round(clamp(seg, 3, 128));
      return geo;
    }
    case "sphere":
      return { type: "sphere", radius: pos(g.radius, 5) };
    case "torus":
      return { type: "torus", radius: pos(g.radius, 10), tube: pos(g.tube, 2) };
    case "capsule":
      return { type: "capsule", radius: pos(g.radius, 3), length: Math.max(0, num(g.length ?? g.height, 10)) };
    case "extrude": {
      const profile = vec2List(g.profile);
      if (profile.length < 3) {
        warn("extrude with < 3 profile points replaced by a box");
        return boxFrom(g);
      }
      const geo: Geometry = { type: "extrude", profile, depth: pos(g.depth ?? g.height ?? g.thickness, 3) };
      const holes = arr(g.holes)
        .map(vec2List)
        .filter((h) => h.length >= 3);
      if (holes.length) geo.holes = holes;
      const bevel = num(g.bevel);
      if (bevel !== undefined && bevel > 0) geo.bevel = Math.min(bevel, geo.depth / 2);
      return geo;
    }
    case "lathe": {
      const profile = vec2List(g.profile).map(([r, y]) => [Math.abs(r), y] as Vec2);
      if (profile.length < 2) {
        warn("lathe with < 2 profile points replaced by a cylinder");
        return { type: "cylinder", radius: pos(g.radius, 5), height: pos(g.height, 10) };
      }
      const geo: Geometry = { type: "lathe", profile };
      const seg = num(g.segments);
      if (seg !== undefined && seg >= 3) geo.segments = Math.round(clamp(seg, 3, 128));
      return geo;
    }
    case "tube": {
      const path = arr(g.path).map((p) => vec3(p));
      if (path.length < 2) {
        warn("tube with < 2 path points replaced by a cylinder");
        return { type: "cylinder", radius: pos(g.radius, 1), height: pos(g.length, 10) };
      }
      return { type: "tube", path, radius: pos(g.radius, 1) };
    }
    case "component": {
      const rawModel = str(g.model);
      const model = resolveModel(rawModel);
      if (!model) {
        warn(`unknown catalog model "${rawModel}" replaced by a box`);
        return boxFrom(g);
      }
      const entry = CATALOG_BY_MODEL[model];
      const params: Record<string, number | string> = {};
      if (isObj(g.params)) {
        for (const [k, v] of Object.entries(g.params)) {
          const def = entry.params[k];
          if (!def) continue; // drop params the renderer does not know
          if (typeof def.default === "number") {
            const n = num(v);
            if (n !== undefined) params[k] = n;
          } else {
            const s = str(v);
            if (s) params[k] = s;
          }
        }
      }
      return Object.keys(params).length ? { type: "component", model, params } : { type: "component", model };
    }
  }
  return boxFrom(g);
}

/* ------------------------------------------------------------------ */
/* CAD                                                                 */
/* ------------------------------------------------------------------ */

function normalizeMaterial(raw: unknown): MaterialSpec | undefined {
  if (typeof raw === "string") {
    const preset = enumOf<MaterialPreset>(raw, MATERIAL_PRESETS, "abs_plastic");
    return { preset };
  }
  if (!isObj(raw)) return undefined;
  const m: MaterialSpec = {};
  if (raw.preset !== undefined) m.preset = enumOf<MaterialPreset>(raw.preset, MATERIAL_PRESETS, "abs_plastic");
  const c = color(raw.color);
  if (c) m.color = c;
  const e = color(raw.emissive);
  if (e) m.emissive = e;
  const metal = num(raw.metalness);
  if (metal !== undefined) m.metalness = clamp(metal, 0, 1);
  const rough = num(raw.roughness);
  if (rough !== undefined) m.roughness = clamp(rough, 0, 1);
  const op = num(raw.opacity);
  if (op !== undefined) m.opacity = clamp(op, 0.05, 1);
  return Object.keys(m).length ? m : undefined;
}

export interface CadPartsResult {
  parts: CadPart[];
  joints: Joint[];
  /** raw id -> final id, for this sub-agent's output */
  idMap: Map<string, string>;
  /** final part id -> part number the CAD agent associated with it (helps BOM linking) */
  partNumbers: Map<string, string>;
}

/**
 * Normalize one CAD sub-agent's output. Part ids are prefixed with the subsystem id so independent
 * sub-agents can never collide; `usedPartIds` / `usedJointIds` are global across the project.
 */
export function normalizeCadOutput(
  raw: unknown,
  subsystem: { id: string; name: string },
  usedPartIds: Set<string>,
  usedJointIds: Set<string>,
  warn: Warn = noop,
): CadPartsResult {
  const r = asObj(raw);
  const idMap = new Map<string, string>();
  const partNumbers = new Map<string, string>();
  const parts: CadPart[] = [];
  let geoWarnings = 0;
  const gw: Warn = () => {
    geoWarnings++;
  };

  for (const p of arr(r.parts)) {
    if (!isObj(p)) continue;
    const name = str(p.name, str(p.id, "Part"));
    const rawId = str(p.id, name);
    const id = uniqueId(`${subsystem.id}-${slug(rawId)}`, usedPartIds);
    if (!idMap.has(rawId)) idMap.set(rawId, id);
    idMap.set(rawId.toLowerCase(), idMap.get(rawId.toLowerCase()) ?? id);
    const part: CadPart = {
      id,
      name,
      subsystem: subsystem.name,
      geometry: normalizeGeometry(p.geometry ?? p, gw),
      position: vec3(p.position),
    };
    const rot = optVec3(p.rotation);
    if (rot && rot.some((v) => v !== 0)) part.rotation = rot.map(wrapDegrees) as Vec3;
    const mat = normalizeMaterial(p.material);
    if (mat) part.material = mat;
    const cuts: CadCut[] = [];
    for (const c of arr(p.cuts).slice(0, 64)) {
      if (!isObj(c)) continue;
      const geometry = normalizeGeometry(c.geometry ?? c, gw, false) as CadCut["geometry"];
      const cut: CadCut = { geometry, position: vec3(c.position) };
      const cr = optVec3(c.rotation);
      if (cr && cr.some((v) => v !== 0)) cut.rotation = cr;
      cuts.push(cut);
    }
    if (cuts.length) {
      if (part.geometry.type === "component" || part.geometry.type === "tube") {
        geoWarnings++;
      } else part.cuts = cuts;
    }
    const explode = optVec3(p.explode);
    if (explode && explode.some((v) => v !== 0)) part.explode = explode;
    const desc = optStr(p.description);
    if (desc) part.description = desc;
    const fab = optStr(p.fabrication);
    if (fab) part.fabrication = fab;
    const mass = num(p.massG);
    if (mass !== undefined && mass >= 0) part.massG = Math.round(mass * 100) / 100;
    const pn = optStr(p.partNumber);
    if (pn) partNumbers.set(id, pn);
    parts.push(part);
  }
  if (geoWarnings) warn(`${geoWarnings} geometry issue(s) repaired`);

  const resolve = (ref: unknown): string | undefined => {
    const s = str(ref);
    if (!s) return undefined;
    return idMap.get(s) ?? idMap.get(s.toLowerCase()) ?? idMap.get(slug(s)) ?? (usedPartIds.has(s) ? s : undefined);
  };
  const joints = normalizeJoints(r.joints, resolve, `${subsystem.id}-j`, usedJointIds, warn);
  return { parts, joints, idMap, partNumbers };
}

export function normalizeJoints(
  raw: unknown,
  resolve: (ref: unknown) => string | undefined,
  idPrefix: string,
  usedJointIds: Set<string>,
  warn: Warn = noop,
): Joint[] {
  const joints: Joint[] = [];
  const seenPairs = new Set<string>();
  let dropped = 0;
  for (const j of arr(raw)) {
    if (!isObj(j)) continue;
    const a = resolve(j.partA ?? j.a ?? j.from);
    const b = resolve(j.partB ?? j.b ?? j.to);
    if (!a || !b || a === b) {
      dropped++;
      continue;
    }
    const pairKey = [a, b].sort().join("|");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const joint: Joint = {
      id: uniqueId(`${idPrefix}${joints.length + 1}`, usedJointIds),
      type: enumOf<JointType>(j.type, JOINT_TYPES, "fastened"),
      partA: a,
      partB: b,
    };
    const f = optStr(j.fastener);
    if (f) joint.fastener = f;
    const d = optStr(j.description);
    if (d) joint.description = d;
    if (j.anchor !== undefined && j.anchor !== null) joint.anchor = vec3(j.anchor);
    joints.push(joint);
  }
  if (dropped) warn(`dropped ${dropped} joint(s) referencing missing parts`);
  return joints;
}

/** Axis-aligned approximate size of a part (local frame, ignoring rotation) for prompts and checks. */
export function approxSize(g: Geometry): Vec3 {
  switch (g.type) {
    case "box":
      return g.size;
    case "cylinder": {
      const r = Math.max(g.radius, g.radiusTop ?? 0);
      return [2 * r, g.height, 2 * r];
    }
    case "cone":
      return [2 * g.radius, g.height, 2 * g.radius];
    case "sphere":
      return [2 * g.radius, 2 * g.radius, 2 * g.radius];
    case "torus":
      return [2 * (g.radius + g.tube), 2 * g.tube, 2 * (g.radius + g.tube)];
    case "capsule":
      return [2 * g.radius, g.length + 2 * g.radius, 2 * g.radius];
    case "extrude": {
      const xs = g.profile.map((p) => p[0]);
      const zs = g.profile.map((p) => p[1]);
      return [Math.max(...xs) - Math.min(...xs), g.depth, Math.max(...zs) - Math.min(...zs)];
    }
    case "lathe": {
      const rs = g.profile.map((p) => p[0]);
      const ys = g.profile.map((p) => p[1]);
      const r = Math.max(...rs);
      return [2 * r, Math.max(...ys) - Math.min(...ys), 2 * r];
    }
    case "tube": {
      const ext = (i: 0 | 1 | 2) => Math.max(...g.path.map((p) => p[i])) - Math.min(...g.path.map((p) => p[i]));
      return [ext(0) + 2 * g.radius, ext(1) + 2 * g.radius, ext(2) + 2 * g.radius];
    }
    case "component": {
      const entry = CATALOG_BY_MODEL[g.model];
      if (!entry) return [10, 10, 10];
      const p = g.params || {};
      const def = (k: string): number => {
        const d = entry.params[k]?.default;
        return typeof d === "number" ? d : 0;
      };
      const n = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : def(k));
      const s = (k: string) => String(p[k] ?? entry.params[k]?.default ?? "");
      switch (g.model) {
        case "wheel":
          return [n("width"), n("diameter"), n("diameter")];
        case "battery_cell":
          return [n("diameter"), n("length"), n("diameter")];
        case "dc_motor":
          return [n("diameter"), n("length") + n("shaftLength") + (n("gearbox") ? 9 : 0), n("diameter")];
        case "bldc_motor":
          return [n("diameter"), n("height") + n("shaftLength"), n("diameter")];
        case "stepper_nema17":
          return [42.3, n("length") + n("shaftLength"), 42.3];
        case "propeller":
          return [n("diameter"), n("hubHeight"), n("diameter")];
        case "antenna":
          return s("variant") === "fpc" ? [35, 1, 8] : [8, n("length"), 8];
        case "screw":
          return [n("diameter") * 1.8, n("length") + n("diameter"), n("diameter") * 1.8];
        case "standoff":
          return [n("diameter"), n("length"), n("diameter")];
        case "motor_driver":
          return s("variant") === "tb6612" ? [20, 4, 20] : [43, 27, 43];
        case "esc":
          return s("variant") === "single" ? [45, 8, 20] : [36, 6, 36];
        case "servo":
          return s("size") === "standard" ? [40, 43, 20] : [32, 29, 12];
        case "breadboard":
          return s("size") === "half" ? [82, 9, 55] : [165, 9, 55];
        case "speaker":
          return s("variant") === "box" ? [n("diameter"), n("height"), n("diameter") / 2] : [n("diameter"), n("height"), n("diameter")];
      }
      const f = [...entry.footprint] as Vec3;
      if (typeof p.width === "number") f[0] = p.width;
      if (typeof p.length === "number") f[2] = p.length;
      if (typeof p.size === "number") {
        f[0] = p.size;
        f[2] = p.size;
      }
      if (typeof p.diameter === "number") {
        f[0] = p.diameter;
        f[2] = p.diameter;
      }
      if (typeof p.height === "number") f[1] = p.height;
      if (typeof p.thickness === "number") f[1] = p.thickness;
      return f;
    }
  }
}

/** World-space AABB of a part, approximately (centre-origin primitives; components sit on y=0). */
export function approxBounds(p: CadPart): { min: Vec3; max: Vec3 } {
  const s = approxSize(p.geometry);
  const rot = p.rotation || [0, 0, 0];
  // rotations by ~90° swap axes; good enough for coarse checks
  const ext: Vec3 = [s[0] / 2, s[1] / 2, s[2] / 2];
  const quarter = (d: number) => Math.round(Math.abs(d) / 90) % 2 === 1;
  if (quarter(rot[0])) [ext[1], ext[2]] = [ext[2], ext[1]];
  if (quarter(rot[1])) [ext[0], ext[2]] = [ext[2], ext[0]];
  if (quarter(rot[2])) [ext[0], ext[1]] = [ext[1], ext[0]];
  let center: Vec3 = [...p.position] as Vec3;
  if (p.geometry.type === "component" && !quarter(rot[0]) && !quarter(rot[2])) {
    // Catalog convention: origin at the centre of the bottom face, except the wheel (centre) and screw
    // (under-head face at y=0, thread down to -length, head ~0.6*d up).
    if (p.geometry.model === "screw") {
      const d = typeof p.geometry.params?.diameter === "number" ? p.geometry.params.diameter : 3;
      const len = typeof p.geometry.params?.length === "number" ? p.geometry.params.length : 8;
      center = [center[0], center[1] + (d - len) / 2, center[2]];
    } else if (p.geometry.model !== "wheel") {
      center = [center[0], center[1] + s[1] / 2, center[2]];
    }
  }
  if (p.geometry.type === "tube" || p.geometry.type === "extrude" || p.geometry.type === "lathe") {
    if (p.geometry.type === "tube") {
      const xs = p.geometry.path.map((q) => q[0]);
      const ys = p.geometry.path.map((q) => q[1]);
      const zs = p.geometry.path.map((q) => q[2]);
      const mid: Vec3 = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
      center = [center[0] + mid[0], center[1] + mid[1], center[2] + mid[2]];
    } else if (p.geometry.type === "extrude") {
      const xs = p.geometry.profile.map((q) => q[0]);
      const zs = p.geometry.profile.map((q) => q[1]);
      center = [center[0] + (Math.max(...xs) + Math.min(...xs)) / 2, center[1], center[2] + (Math.max(...zs) + Math.min(...zs)) / 2];
    } else {
      const ys = p.geometry.profile.map((q) => q[1]);
      center = [center[0], center[1] + (Math.max(...ys) + Math.min(...ys)) / 2, center[2]];
    }
  }
  return {
    min: [center[0] - ext[0], center[1] - ext[1], center[2] - ext[2]],
    max: [center[0] + ext[0], center[1] + ext[1], center[2] + ext[2]],
  };
}

/* ------------------------------------------------------------------ */
/* BOM                                                                 */
/* ------------------------------------------------------------------ */

function searchUrl(supplier: string | undefined, query: string, category: BomCategory): string {
  const q = encodeURIComponent(query.trim());
  const s = (supplier || "").toLowerCase();
  if (s.includes("digikey") || s.includes("digi-key")) return `https://www.digikey.com/en/products/result?keywords=${q}`;
  if (s.includes("mouser")) return `https://www.mouser.com/c/?q=${q}`;
  if (s.includes("getfpv")) return `https://www.getfpv.com/catalogsearch/result/?q=${q}`;
  if (s.includes("pololu")) return `https://www.pololu.com/search?query=${q}`;
  if (s.includes("adafruit")) return `https://www.adafruit.com/search?q=${q}`;
  if (s.includes("sparkfun")) return `https://www.sparkfun.com/search/results?term=${q}`;
  if (s.includes("mcmaster")) return `https://www.mcmaster.com/products/${q}/`;
  if (s.includes("lcsc")) return `https://www.lcsc.com/search?q=${q}`;
  if (s.includes("aliexpress")) return `https://www.aliexpress.com/wholesale?SearchText=${q}`;
  if (s.includes("racedayquads") || s.includes("rdq")) return `https://www.racedayquads.com/search?q=${q}`;
  if (s.includes("amazon")) return `https://www.amazon.com/s?k=${q}`;
  if (s.includes("arrow")) return `https://www.arrow.com/en/products/search?q=${q}`;
  if (s.includes("newark") || s.includes("farnell")) return `https://www.newark.com/search?st=${q}`;
  if (category === "electronics" || category === "sensor" || category === "power" || category === "display")
    return `https://www.digikey.com/en/products/result?keywords=${q}`;
  if (category === "fastener") return `https://www.mcmaster.com/products/${q}/`;
  return `https://www.amazon.com/s?k=${q}`;
}

/** True when the URL is plainly a supplier search page (safe to keep; we never trust guessed product pages). */
function isSearchUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const full = url.pathname + url.search;
    return /search|keywords=|[?&]k=|[?&]q=|[?&]query=|[?&]term=|wholesale|\/result/i.test(full);
  } catch {
    return false;
  }
}

function guessCategory(name: string): BomCategory {
  const n = name.toLowerCase();
  if (/screw|bolt|nut|washer|standoff|insert|rivet|spacer/.test(n)) return "fastener";
  if (/batter|lipo|cell|charger|regulator|buck|bms|power/.test(n)) return "power";
  if (/motor|prop|wheel|servo|esc|gear/.test(n)) return "propulsion";
  if (/sensor|imu|camera|gps|ultrasonic|ir |infrared|tof/.test(n)) return "sensor";
  if (/display|oled|lcd|screen/.test(n)) return "display";
  if (/wire|cable|lead|harness|connector/.test(n)) return "cable";
  if (/printed|machined|cnc|laser|custom|frame|plate|chassis|bracket|housing|enclosure/.test(n)) return "fabricated";
  return "electronics";
}

/**
 * Normalize BOM lines. When `elLinks` is given it receives bomId -> netlist component ids
 * (from the optional `electronicsIds` field) so the caller can set EComponent.bomId.
 */
export function normalizeBom(raw: unknown, warn: Warn = noop, elLinks?: Map<string, string[]>): BomItem[] {
  const r = asObj(raw);
  const list = Array.isArray(raw) ? raw : arr(r.items);
  const used = new Set<string>();
  const items: BomItem[] = [];
  let fixedUrls = 0;
  for (const it of list) {
    if (!isObj(it)) continue;
    const name = str(it.name);
    if (!name) continue;
    const category = enumOf<BomCategory>(it.category, BOM_CATEGORIES, guessCategory(name));
    const id = uniqueId(slug(str(it.id, `bom-${name}`), 40), used);
    const item: BomItem = {
      id,
      name,
      category,
      qty: Math.max(1, Math.round(num(it.qty, 1))),
      unitPrice: Math.max(0, Math.round(num(it.unitPrice, 0) * 100) / 100),
    };
    const manufacturer = optStr(it.manufacturer);
    if (manufacturer) item.manufacturer = manufacturer;
    const pn = optStr(it.partNumber);
    if (pn) item.partNumber = pn;
    const supplier = optStr(it.supplier);
    if (supplier) item.supplier = supplier;
    const url = str(it.url);
    if (url && isSearchUrl(url)) item.url = url;
    else if (category !== "fabricated") {
      if (url) fixedUrls++;
      item.url = searchUrl(supplier, [manufacturer, pn || name].filter(Boolean).join(" "), category);
    }
    if (isObj(it.specs)) {
      const specs: Record<string, string> = {};
      for (const [k, v] of Object.entries(it.specs)) {
        const s = str(v);
        if (s) specs[k] = s;
      }
      if (Object.keys(specs).length) item.specs = specs;
    }
    const mass = num(it.massG);
    if (mass !== undefined && mass >= 0) item.massG = Math.round(mass * 100) / 100;
    const notes = optStr(it.notes);
    if (notes) item.notes = notes;
    const fab = optStr(it.fabrication);
    if (fab) item.fabrication = fab;
    const alts = strArr(it.alternatives);
    if (alts.length) item.alternatives = alts;
    const elIds = strArr(it.electronicsIds);
    if (elLinks && elIds.length) elLinks.set(id, elIds);
    items.push(item);
  }
  if (fixedUrls) warn(`replaced ${fixedUrls} unverifiable product URL(s) with supplier search links`);
  return items;
}

/* ------------------------------------------------------------------ */
/* Electronics                                                         */
/* ------------------------------------------------------------------ */

function guessPinType(label: string): PinType {
  const l = label.toUpperCase();
  if (/^(GND|VSS|AGND|DGND|GROUND|-|V-|BAT-|0V)\d*$/.test(l) || l.startsWith("GND")) return "ground";
  if (/^(VCC|VDD|VIN|5V|3V3|3\.3V|VBAT|BAT\+|V\+|\+|VBUS|VMOT|VM|12V|VS|PWR|IN\+)/.test(l)) return "power_in";
  if (/^(VOUT|OUT\+|3V3_OUT)/.test(l)) return "power_out";
  if (/SDA/.test(l)) return "i2c_sda";
  if (/SCL/.test(l)) return "i2c_scl";
  if (/MOSI|COPI|SDI/.test(l)) return "spi_mosi";
  if (/MISO|CIPO|SDO/.test(l)) return "spi_miso";
  if (/SCK|SCLK|CLK/.test(l)) return "spi_sck";
  if (/^(CS|SS|NSS|CE)\d*$/.test(l)) return "spi_cs";
  if (/TX/.test(l)) return "uart_tx";
  if (/RX/.test(l)) return "uart_rx";
  if (/^A\d+$/.test(l) || /ADC/.test(l)) return "analog";
  if (/PWM|EN[AB]?$/.test(l)) return "pwm";
  if (/^(OUT|M)\d|MOTOR|^[AB][12]$|^(AO|BO)\d/.test(l)) return "motor";
  if (/^(D|GPIO|IO|P[A-Z]?)\d+/.test(l)) return "digital";
  if (/USB|D\+|D-/.test(l)) return "usb";
  if (/^NC$/.test(l)) return "nc";
  return "signal";
}

const SIGNAL_COLORS = ["#f1c40f", "#3498db", "#2ecc71", "#e67e22", "#9b59b6", "#1abc9c", "#ffffff", "#e84393", "#00cec9", "#a29bfe", "#fd79a8", "#55efc4"];

export function normalizeElectronics(raw: unknown, warn: Warn = noop): ElectronicsSpec {
  const r = asObj(raw);
  const usedComp = new Set<string>();
  const components: EComponent[] = [];
  const compLookup = new Map<string, EComponent>();

  for (const c of arr(r.components)) {
    if (!isObj(c)) continue;
    const rawId = str(c.id, str(c.name, "U"));
    const id = uniqueId(rawId.replace(/[^A-Za-z0-9_.+-]/g, "_"), usedComp);
    const pins: EPin[] = [];
    const usedPins = new Set<string>();
    for (const p of arr(c.pins)) {
      const po = isObj(p) ? p : { id: p };
      const pid = str(po.id, str(po.label));
      if (!pid) continue;
      if (usedPins.has(pid)) continue;
      usedPins.add(pid);
      const label = str(po.label, pid);
      pins.push({ id: pid, label, type: enumOf<PinType>(po.type, PIN_TYPES, guessPinType(label)) });
    }
    const comp: EComponent = {
      id,
      name: str(c.name, id),
      kind: enumOf<EComponentKind>(c.kind, COMPONENT_KINDS, "module"),
      pins,
      mount: enumOf(c.mount, ["breadboard", "offboard", "pcb"] as const, "offboard"),
    };
    const pn = optStr(c.partNumber);
    if (pn) comp.partNumber = pn;
    const value = optStr(c.value);
    if (value) comp.value = value;
    const desc = optStr(c.description);
    if (desc) comp.description = desc;
    components.push(comp);
    for (const key of [rawId, id, comp.name]) {
      if (!compLookup.has(key)) compLookup.set(key, comp);
      if (!compLookup.has(key.toLowerCase())) compLookup.set(key.toLowerCase(), comp);
    }
  }

  const findPin = (comp: EComponent, ref: string): EPin | undefined => {
    const lc = ref.toLowerCase();
    return (
      comp.pins.find((p) => p.id === ref) ||
      comp.pins.find((p) => p.id.toLowerCase() === lc) ||
      comp.pins.find((p) => p.label.toLowerCase() === lc) ||
      comp.pins.find((p) => p.id.toLowerCase().replace(/[^a-z0-9]/g, "") === lc.replace(/[^a-z0-9]/g, ""))
    );
  };

  const usedNet = new Set<string>();
  const nets: Net[] = [];
  let droppedNodes = 0;
  let addedPins = 0;
  let sigIdx = 0;
  for (const n of arr(r.nets)) {
    if (!isObj(n)) continue;
    const name = str(n.name, str(n.id, "NET"));
    const type = enumOf<NetType>(n.type, NET_TYPES, /gnd|ground/i.test(name) ? "ground" : "signal");
    const nodes: NetNode[] = [];
    const seen = new Set<string>();
    for (const node of arr(n.nodes)) {
      let compRef = "";
      let pinRef = "";
      if (isObj(node)) {
        compRef = str(node.component ?? node.comp ?? node.ref);
        pinRef = str(node.pin);
      } else if (typeof node === "string" && /[.:]/.test(node)) {
        const [a, ...rest] = node.split(/[.:]/);
        compRef = a;
        pinRef = rest.join(".");
      }
      const comp = compLookup.get(compRef) || compLookup.get(compRef.toLowerCase());
      if (!comp || !pinRef) {
        droppedNodes++;
        continue;
      }
      let pin = findPin(comp, pinRef);
      if (!pin) {
        // The component exists but the agent forgot to list this pin: add it so the wire is not lost.
        pin = { id: pinRef, label: pinRef, type: type === "ground" ? "ground" : type === "power" ? "power_in" : guessPinType(pinRef) };
        comp.pins.push(pin);
        addedPins++;
      }
      const key = `${comp.id}.${pin.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ component: comp.id, pin: pin.id });
    }
    if (nodes.length < 2) {
      if (nodes.length) warn(`net "${name}" has a single node after cleanup; dropped`);
      continue;
    }
    const net: Net = { id: uniqueId(slug(str(n.id, name), 32), usedNet), name, type, nodes };
    const v = num(n.voltage);
    if (v !== undefined) net.voltage = v;
    net.color =
      color(n.color) ||
      (type === "ground" ? "#111111" : type === "power" ? "#e53935" : SIGNAL_COLORS[sigIdx++ % SIGNAL_COLORS.length]);
    const gauge = optStr(n.wireGauge);
    if (gauge) net.wireGauge = gauge;
    const notes = optStr(n.notes);
    if (notes) net.notes = notes;
    nets.push(net);
  }
  if (droppedNodes) warn(`dropped ${droppedNodes} net node(s) referencing unknown components`);
  if (addedPins) warn(`added ${addedPins} pin(s) that nets referenced but components did not list`);

  const powerBudget = arr(r.powerBudget)
    .filter(isObj)
    // Summary rows ("TOTAL from battery") would double count in every consumer.
    .filter((p) => !/^\s*(total|sum|overall|grand total)\b|\btotal\s+(from|draw|current)/i.test(str(p.component)))
    .map((p) => {
      const e: ElectronicsSpec["powerBudget"][number] = {
        component: str(p.component, "load"),
        voltage: num(p.voltage, 0),
        currentMa: Math.max(0, num(p.currentMa, 0)),
      };
      const notes = optStr(p.notes);
      if (notes) e.notes = notes;
      return e;
    });

  return {
    summary: str(r.summary, `${components.length} components, ${nets.length} nets`),
    supplyVoltage: num(r.supplyVoltage, 5),
    logicVoltage: num(r.logicVoltage, 3.3),
    components,
    nets,
    powerBudget,
    wiringSteps: strArr(r.wiringSteps),
    safetyNotes: strArr(r.safetyNotes),
  };
}

/* ------------------------------------------------------------------ */
/* Firmware                                                            */
/* ------------------------------------------------------------------ */

export function normalizeFirmware(raw: unknown, platformHint: string | undefined, warn: Warn = noop): FirmwareSpec {
  const r = asObj(raw);
  const platform = str(r.platform, platformHint || "Arduino");
  const defaultLang = /python/i.test(platform) ? "python" : /rust/i.test(platform) ? "rust" : "cpp";
  const usedPaths = new Set<string>();
  const files = arr(r.files)
    .filter(isObj)
    .map((f) => ({ path: str(f.path, "main.cpp").replace(/\\/g, "/").replace(/^\/+/, ""), content: typeof f.content === "string" ? f.content : "", description: optStr(f.description) }))
    .filter((f) => f.content.trim().length > 0)
    .map((f) => ({ ...f, path: uniqueId(f.path, usedPaths) }))
    .map((f) => (f.description ? f : { path: f.path, content: f.content }));
  if (!files.length) warn("firmware agent returned no source files");
  const notes = strArr(r.notes);
  const spec: FirmwareSpec = {
    platform,
    language: enumOf(r.language, FIRMWARE_LANGS, defaultLang),
    target: str(r.target, "Unknown target"),
    files,
    libraries: arr(r.libraries)
      .map((l) => (isObj(l) ? l : { name: l }))
      .filter((l) => str(l.name))
      .map((l) => {
        const lib: FirmwareSpec["libraries"][number] = { name: str(l.name) };
        const v = optStr(l.version);
        if (v) lib.version = v;
        const p = optStr(l.purpose);
        if (p) lib.purpose = p;
        return lib;
      }),
    build: strArr(r.build),
    pinMap: arr(r.pinMap)
      .filter(isObj)
      .map((p) => ({ pin: str(p.pin), component: str(p.component), function: str(p.function) }))
      .filter((p) => p.pin),
  };
  if (notes.length) spec.notes = notes;
  return spec;
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

/** Resolve a part reference that may be unprefixed, a name, or slightly off. */
export function makePartResolver(parts: CadPart[]): (ref: unknown) => string | undefined {
  const byId = new Map(parts.map((p) => [p.id, p.id]));
  const byLower = new Map(parts.map((p) => [p.id.toLowerCase(), p.id]));
  const byName = new Map(parts.map((p) => [p.name.toLowerCase(), p.id]));
  const bySlug = new Map(parts.map((p) => [slug(p.name), p.id]));
  return (ref: unknown) => {
    const s = str(ref);
    if (!s) return undefined;
    const hit = byId.get(s) || byLower.get(s.toLowerCase()) || byName.get(s.toLowerCase()) || bySlug.get(slug(s));
    if (hit) return hit;
    const sl = slug(s);
    const suffix = parts.filter((p) => p.id.endsWith(`-${sl}`));
    return suffix.length === 1 ? suffix[0].id : undefined;
  };
}

export function normalizeAssembly(raw: unknown, parts: CadPart[], warn: Warn = noop): AssemblyStep[] {
  const r = asObj(raw);
  const list = Array.isArray(raw) ? raw : arr(r.steps);
  const resolve = makePartResolver(parts);
  let unresolved = 0;
  const steps = list
    .filter(isObj)
    .map((s, i) => {
      const ids: string[] = [];
      for (const ref of strArr(s.partIds)) {
        const id = resolve(ref);
        if (id) {
          if (!ids.includes(id)) ids.push(id);
        } else unresolved++;
      }
      const step: AssemblyStep = {
        step: num(s.step, i + 1),
        title: str(s.title, `Step ${i + 1}`),
        description: str(s.description),
        partIds: ids,
      };
      const tools = strArr(s.tools);
      if (tools.length) step.tools = tools;
      const d = num(s.durationMin);
      if (d !== undefined && d > 0) step.durationMin = Math.round(d);
      const c = optStr(s.caution);
      if (c) step.caution = c;
      return step;
    })
    .sort((a, b) => a.step - b.step)
    .map((s, i) => ({ ...s, step: i + 1 }));
  if (unresolved) warn(`assembly referenced ${unresolved} unknown part id(s); removed`);
  return steps;
}

/* ------------------------------------------------------------------ */
/* Review (agent part)                                                 */
/* ------------------------------------------------------------------ */

export function normalizeAgentReview(raw: unknown): { score?: number; summary: string; checks: ReviewCheck[]; suggestions: string[] } {
  const r = asObj(raw);
  const used = new Set<string>();
  const checks: ReviewCheck[] = arr(r.checks)
    .filter(isObj)
    .map((c) => ({
      id: uniqueId(`agent-${slug(str(c.id, str(c.name, "check")), 32)}`, used),
      category: enumOf<ReviewCheck["category"]>(c.category, REVIEW_CATEGORIES, "consistency"),
      name: str(c.name, "Check"),
      status: enumOf<ReviewCheck["status"]>(c.status, ["pass", "warn", "fail"] as const, "warn"),
      detail: str(c.detail),
      source: "agent" as const,
    }));
  const score = num(r.score);
  return {
    score: score === undefined ? undefined : clamp(score, 0, 100),
    summary: str(r.summary),
    checks,
    suggestions: strArr(r.suggestions),
  };
}
