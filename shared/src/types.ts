/**
 * Protoforge product specification — the contract shared by the agent pipeline (server)
 * and every view in the web app. Units: millimetres, grams, volts, milliamps, USD.
 * Coordinate system: right-handed, Y is UP (three.js convention). Rotations are XYZ Euler in DEGREES.
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/* ------------------------------------------------------------------ */
/* CAD                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Geometry primitives. Every primitive is centred on its local origin unless noted.
 * - box: size = [x, y, z]; radius = edge fillet radius (0 = sharp)
 * - cylinder: axis along local Y, centred; radiusTop optional for tapered cylinders
 * - cone: axis along local Y, centred, apex at +Y
 * - sphere
 * - torus: ring lies in local XZ plane (axis = Y); radius = ring radius, tube = tube radius
 * - capsule: axis along local Y; length = straight section length (total = length + 2*radius)
 * - extrude: closed 2D profile given in plan view as [x, z] points, extruded along +Y by `depth`,
 *            centred vertically (y from -depth/2 to +depth/2). `holes` are inner closed profiles.
 *            `bevel` rounds the top/bottom edges (mm).
 * - lathe: profile of [radius, y] points revolved 360° around local Y axis (bottles, lenses, knobs, bells)
 * - tube: circle of `radius` swept along a smooth curve through `path` points (local coords) — wires, cables, pipes
 * - component: a detailed parametric model from the component library (see catalog.ts)
 */
export type Geometry =
  | { type: "box"; size: Vec3; radius?: number }
  | { type: "cylinder"; radius: number; height: number; radiusTop?: number; segments?: number }
  | { type: "cone"; radius: number; height: number; segments?: number }
  | { type: "sphere"; radius: number }
  | { type: "torus"; radius: number; tube: number }
  | { type: "capsule"; radius: number; length: number }
  | { type: "extrude"; profile: Vec2[]; holes?: Vec2[][]; depth: number; bevel?: number }
  | { type: "lathe"; profile: Vec2[]; segments?: number }
  | { type: "tube"; path: Vec3[]; radius: number }
  | { type: "component"; model: string; params?: Record<string, number | string> };

export type MaterialPreset =
  | "aluminum"
  | "anodized_black"
  | "steel"
  | "stainless"
  | "titanium"
  | "brass"
  | "copper"
  | "gold"
  | "carbon_fiber"
  | "abs_plastic"
  | "pla"
  | "petg"
  | "nylon"
  | "rubber"
  | "silicone"
  | "glass"
  | "lens"
  | "screen"
  | "pcb_green"
  | "pcb_black"
  | "pcb_blue"
  | "ceramic"
  | "wood"
  | "fabric"
  | "foam";

export interface MaterialSpec {
  preset?: MaterialPreset;
  /** CSS hex colour, overrides the preset colour */
  color?: string;
  metalness?: number;
  roughness?: number;
  /** 0..1, < 1 makes the part translucent */
  opacity?: number;
  /** CSS hex colour for glowing parts (LEDs, screens) */
  emissive?: string;
}

/** A boolean cut (hole, pocket, slot) subtracted from its parent part. Transform is in the PARENT part's local frame. */
export interface CadCut {
  geometry: Exclude<Geometry, { type: "component" } | { type: "tube" }>;
  position: Vec3;
  rotation?: Vec3;
}

export interface CadPart {
  id: string;
  name: string;
  /** Subsystem name from the brief, e.g. "Frame", "Propulsion", "Electronics" */
  subsystem: string;
  geometry: Geometry;
  /** World position of the part's local origin (mm) */
  position: Vec3;
  /** XYZ Euler rotation, degrees */
  rotation?: Vec3;
  material?: MaterialSpec;
  /** Holes / pockets / cut-outs (boolean subtraction) */
  cuts?: CadCut[];
  /** Link to BOM item id */
  bomId?: string;
  /** Link to electronics component id */
  electronicsId?: string;
  /** Explicit exploded-view offset (mm). If absent the viewer explodes radially from the assembly centre. */
  explode?: Vec3;
  description?: string;
  /** How it is made, e.g. "3D print PETG, 4 perimeters" or "CNC 4 mm carbon fibre plate" */
  fabrication?: string;
  /** Approximate mass in grams (optional; viewer can estimate from volume) */
  massG?: number;
}

export type JointType =
  | "fastened"
  | "threaded"
  | "revolute"
  | "prismatic"
  | "press_fit"
  | "snap_fit"
  | "adhesive"
  | "soldered"
  | "wired"
  | "magnetic"
  | "clamped";

/** A physical connection (mate) between two parts. */
export interface Joint {
  id: string;
  type: JointType;
  partA: string;
  partB: string;
  /** e.g. "4x M3x8 socket head cap screws" */
  fastener?: string;
  description?: string;
  /** World position of the connection point (mm), optional — used to draw a marker */
  anchor?: Vec3;
}

export interface CadModel {
  units: "mm";
  parts: CadPart[];
  joints: Joint[];
}

/* ------------------------------------------------------------------ */
/* Brief (architect output)                                            */
/* ------------------------------------------------------------------ */

export interface SubsystemPlan {
  id: string;
  name: string;
  description: string;
  /** Region of space this subsystem occupies (world mm) */
  envelope: { center: Vec3; size: Vec3 };
  /** Parts this subsystem must contain */
  keyParts: string[];
  /** How it connects to other subsystems (mounting points, positions, fasteners) */
  interfaces: string[];
}

export interface ProductBrief {
  name: string;
  tagline: string;
  category: string;
  description: string;
  requirements: {
    functional: string[];
    performance: Record<string, string>;
    constraints: string[];
  };
  /** Overall bounding size [x, y, z] mm */
  envelope: Vec3;
  /** How the product is oriented in world space (what is +Y/up, which way is front) */
  coordinateNotes: string;
  subsystems: SubsystemPlan[];
  keyComponents: { name: string; partNumber?: string; role: string; qty: number }[];
  hasElectronics: boolean;
  hasFirmware: boolean;
  /** e.g. "Arduino (ATmega328P)", "ESP32 Arduino core", "Betaflight on STM32F405" */
  firmwarePlatform?: string;
  risks: string[];
}

/* ------------------------------------------------------------------ */
/* Sourcing / BOM                                                      */
/* ------------------------------------------------------------------ */

export type BomCategory =
  | "electronics"
  | "mechanical"
  | "fastener"
  | "fabricated"
  | "power"
  | "propulsion"
  | "sensor"
  | "display"
  | "enclosure"
  | "cable"
  | "other";

export interface BomItem {
  id: string;
  name: string;
  category: BomCategory;
  manufacturer?: string;
  partNumber?: string;
  supplier?: string;
  /** Product or search URL */
  url?: string;
  qty: number;
  unitPrice: number;
  specs?: Record<string, string>;
  massG?: number;
  notes?: string;
  /** For custom parts: how to fabricate */
  fabrication?: string;
  alternatives?: string[];
}

/* ------------------------------------------------------------------ */
/* Electronics                                                         */
/* ------------------------------------------------------------------ */

export type PinType =
  | "power_in"
  | "power_out"
  | "ground"
  | "digital"
  | "analog"
  | "pwm"
  | "i2c_sda"
  | "i2c_scl"
  | "spi_mosi"
  | "spi_miso"
  | "spi_sck"
  | "spi_cs"
  | "uart_tx"
  | "uart_rx"
  | "usb"
  | "motor"
  | "signal"
  | "nc";

export interface EPin {
  /** Unique within the component, e.g. "D9", "VCC", "GND1", "SDA" */
  id: string;
  /** Human label printed on the board */
  label: string;
  type: PinType;
}

export type EComponentKind =
  | "mcu"
  | "sensor"
  | "actuator"
  | "driver"
  | "power"
  | "passive"
  | "connector"
  | "module"
  | "display"
  | "communication"
  | "other";

export interface EComponent {
  id: string;
  name: string;
  partNumber?: string;
  kind: EComponentKind;
  pins: EPin[];
  /** Where it sits when prototyping: on the breadboard, off-board module wired in, or on a custom PCB */
  mount: "breadboard" | "offboard" | "pcb";
  /** For passives: "10kΩ", "100nF" */
  value?: string;
  bomId?: string;
  cadPartIds?: string[];
  description?: string;
}

export interface NetNode {
  component: string;
  pin: string;
}

export type NetType = "power" | "ground" | "signal" | "bus" | "motor" | "data";

export interface Net {
  id: string;
  name: string;
  type: NetType;
  voltage?: number;
  nodes: NetNode[];
  /** Suggested wire colour (CSS colour name or hex) */
  color?: string;
  /** e.g. "22 AWG", "14 AWG silicone" */
  wireGauge?: string;
  notes?: string;
}

export interface ElectronicsSpec {
  summary: string;
  supplyVoltage: number;
  logicVoltage: number;
  components: EComponent[];
  nets: Net[];
  powerBudget: { component: string; voltage: number; currentMa: number; notes?: string }[];
  /** Ordered human instructions for wiring the circuit */
  wiringSteps: string[];
  safetyNotes: string[];
}

/* ------------------------------------------------------------------ */
/* Firmware                                                            */
/* ------------------------------------------------------------------ */

export interface FirmwareFile {
  path: string;
  content: string;
  description?: string;
}

export interface FirmwareSpec {
  /** e.g. "Arduino", "ESP-IDF", "PlatformIO", "MicroPython", "Betaflight" */
  platform: string;
  language: "cpp" | "c" | "python" | "rust" | "javascript" | "typescript" | "swift" | "kotlin";
  /** Target board, e.g. "ESP32-DevKitC-V4" */
  target: string;
  files: FirmwareFile[];
  libraries: { name: string; version?: string; purpose?: string }[];
  /** Ordered build/flash steps */
  build: string[];
  pinMap: { pin: string; component: string; function: string }[];
  notes?: string[];
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

export interface AssemblyStep {
  step: number;
  title: string;
  description: string;
  /** CadPart ids involved in this step (highlighted in the 3D view) */
  partIds: string[];
  tools?: string[];
  durationMin?: number;
  caution?: string;
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

export interface ReviewCheck {
  id: string;
  category: "mechanical" | "electrical" | "firmware" | "sourcing" | "assembly" | "safety" | "consistency";
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  /** "deterministic" = computed by code, "agent" = judged by the reviewer agent */
  source: "deterministic" | "agent";
}

export interface ReviewReport {
  /** 0..100 */
  score: number;
  summary: string;
  checks: ReviewCheck[];
  metrics: {
    partCount: number;
    jointCount: number;
    bomLineCount: number;
    costUsd: number;
    massG: number;
    netCount: number;
    componentCount: number;
    firmwareLines: number;
    powerDrawMa: number;
  };
  suggestions: string[];
}

/* ------------------------------------------------------------------ */
/* Agents & project                                                    */
/* ------------------------------------------------------------------ */

export type StageId = "architect" | "cad" | "sourcing" | "electronics" | "firmware" | "assembly" | "review";

export type AgentStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface AgentRun {
  id: string;
  stage: StageId;
  /** Display name, e.g. "CAD · Frame" */
  name: string;
  /** Short description of the agent's job */
  role: string;
  /** Parent agent id for sub-agents (e.g. CAD subsystem agents under the CAD lead) */
  parentId?: string;
  status: AgentStatus;
  model?: string;
  startedAt?: string;
  endedAt?: string;
  /** One-line result summary */
  summary?: string;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export type ProjectStatus = "queued" | "running" | "done" | "error";

export interface Project {
  id: string;
  prompt: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  brief?: ProductBrief;
  cad?: CadModel;
  bom?: BomItem[];
  electronics?: ElectronicsSpec | null;
  firmware?: FirmwareSpec | null;
  assembly?: AssemblyStep[];
  review?: ReviewReport;
  agents: AgentRun[];
  /** Refinement instructions applied after the original prompt */
  revisions?: { instruction: string; at: string }[];
  error?: string;
  /** Serverless execution lease: the invocation that owns the running pipeline and when its budget ends */
  lease?: { owner: string; until: string };
}

/** Lightweight listing entry */
export interface ProjectSummary {
  id: string;
  prompt: string;
  name?: string;
  tagline?: string;
  category?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  partCount?: number;
  costUsd?: number;
  score?: number;
}

export interface LogEvent {
  ts: string;
  agentId?: string;
  level: "info" | "warn" | "error";
  message: string;
}

/**
 * Server-Sent Events on GET /api/projects/:id/stream
 *  event: snapshot  data: Project      (full project, sent on connect and after every change)
 *  event: log       data: LogEvent
 *  event: done      data: { status: ProjectStatus }
 */
export type StreamEventName = "snapshot" | "log" | "done";

/** GET /api/health */
export interface HealthInfo {
  ok: boolean;
  storage: "mongodb" | "memory";
  mongoError?: string;
  anthropic: boolean;
  models: { heavy: string; fast: string };
}
