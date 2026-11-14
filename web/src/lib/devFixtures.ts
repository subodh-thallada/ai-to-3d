/**
 * Development-only demo project (route /p/demo when running `vite` in dev mode) so every project view
 * can be exercised without the server or an API key. Never used in production builds.
 */
import type { AgentRun, CadModel, LogEvent, Project } from "@protoforge/shared";
import { sampleBom, sampleElectronics, sampleFirmware } from "../electronics/__fixtures__/sampleElectronics";

export const DEMO_PROJECT_ID = "demo";

const t0 = Date.parse("2026-11-14T10:00:00Z");
const at = (s: number) => new Date(t0 + s * 1000).toISOString();

const cad: CadModel = {
  units: "mm",
  parts: [
    { id: "chassis", name: "Chassis plate", subsystem: "Chassis", geometry: { type: "box", size: [140, 4, 100], radius: 4 }, position: [0, 30, 0], material: { preset: "petg", color: "#2b3445" }, fabrication: "3D print PETG, 4 perimeters", massG: 48 },
    { id: "deck", name: "Upper deck", subsystem: "Chassis", geometry: { type: "box", size: [120, 3, 90], radius: 3 }, position: [0, 62, 0], material: { preset: "petg", color: "#3a4459" }, massG: 30 },
    { id: "esp32", name: "ESP32 DevKitC", subsystem: "Electronics", geometry: { type: "component", model: "esp32_devkit" }, position: [0, 64, 0], bomId: "bom-esp32", electronicsId: "U1" },
    { id: "driver", name: "TB6612 driver", subsystem: "Electronics", geometry: { type: "component", model: "motor_driver" }, position: [-30, 32, 0], bomId: "bom-driver", electronicsId: "U3" },
    { id: "battery", name: "2S battery pack", subsystem: "Power", geometry: { type: "box", size: [76, 20, 40], radius: 2 }, position: [20, 42, 0], material: { color: "#1e3a8a" }, bomId: "bom-battery", electronicsId: "BT1", massG: 96 },
    { id: "motor-l", name: "Left N20 motor", subsystem: "Drive", geometry: { type: "cylinder", radius: 6, height: 24 }, position: [-40, 22, 50], rotation: [90, 0, 0], material: { preset: "aluminum" }, bomId: "bom-motor", electronicsId: "M1", massG: 10 },
    { id: "motor-r", name: "Right N20 motor", subsystem: "Drive", geometry: { type: "cylinder", radius: 6, height: 24 }, position: [-40, 22, -50], rotation: [90, 0, 0], material: { preset: "aluminum" }, bomId: "bom-motor", electronicsId: "M2", massG: 10 },
    { id: "wheel-l", name: "Left wheel", subsystem: "Drive", geometry: { type: "cylinder", radius: 21, height: 10 }, position: [-40, 22, 64], rotation: [90, 0, 0], material: { preset: "rubber" }, massG: 12 },
    { id: "wheel-r", name: "Right wheel", subsystem: "Drive", geometry: { type: "cylinder", radius: 21, height: 10 }, position: [-40, 22, -64], rotation: [90, 0, 0], material: { preset: "rubber" }, massG: 12 },
    { id: "sonar", name: "HC-SR04", subsystem: "Sensing", geometry: { type: "box", size: [4, 20, 45] }, position: [72, 45, 0], material: { preset: "pcb_blue" }, bomId: "bom-ultrasonic", electronicsId: "U4" },
  ],
  joints: [
    { id: "j1", type: "fastened", partA: "chassis", partB: "deck", fastener: "4x M3x30 standoffs" },
    { id: "j2", type: "clamped", partA: "chassis", partB: "motor-l", fastener: "N20 bracket + 2x M2x6" },
    { id: "j3", type: "clamped", partA: "chassis", partB: "motor-r", fastener: "N20 bracket + 2x M2x6" },
    { id: "j4", type: "press_fit", partA: "motor-l", partB: "wheel-l" },
    { id: "j5", type: "press_fit", partA: "motor-r", partB: "wheel-r" },
  ],
};

const agents: AgentRun[] = [
  { id: "a-arch", stage: "architect", name: "Architect", role: "Writes the product brief", status: "done", model: "claude-opus-4-1", startedAt: at(0), endedAt: at(41), summary: "Two-wheel line-following robot car, 5 subsystems", tokensIn: 5200, tokensOut: 4100 },
  { id: "a-cad", stage: "cad", name: "CAD lead", role: "Coordinates subsystem CAD agents", status: "done", model: "claude-opus-4-1", startedAt: at(41), endedAt: at(132), summary: "10 parts, 5 joints", tokensIn: 1800, tokensOut: 900 },
  { id: "a-cad-1", stage: "cad", parentId: "a-cad", name: "CAD · Chassis", role: "Models the chassis", status: "done", model: "claude-sonnet-4-5", startedAt: at(42), endedAt: at(98), summary: "2 plates", tokensIn: 6100, tokensOut: 3800 },
  { id: "a-cad-2", stage: "cad", parentId: "a-cad", name: "CAD · Drive", role: "Models the drivetrain", status: "done", model: "claude-sonnet-4-5", startedAt: at(42), endedAt: at(120), summary: "2 motors, 2 wheels", tokensIn: 5900, tokensOut: 4200 },
  { id: "a-src", stage: "sourcing", name: "Sourcing", role: "Finds real parts", status: "done", model: "claude-sonnet-4-5", startedAt: at(41), endedAt: at(88), summary: `${sampleBom.length} BOM lines`, tokensIn: 4300, tokensOut: 3500 },
  { id: "a-el", stage: "electronics", name: "Electronics", role: "Designs the circuit", status: "done", model: "claude-opus-4-1", startedAt: at(41), endedAt: at(140), summary: `${sampleElectronics.nets.length} nets`, tokensIn: 7000, tokensOut: 9100 },
  { id: "a-fw", stage: "firmware", name: "Firmware", role: "Writes firmware", status: "done", model: "claude-sonnet-4-5", startedAt: at(140), endedAt: at(201), summary: "1 file", tokensIn: 8000, tokensOut: 6000 },
  { id: "a-asm", stage: "assembly", name: "Assembly", role: "Plans assembly", status: "done", model: "claude-sonnet-4-5", startedAt: at(201), endedAt: at(230), summary: "3 steps", tokensIn: 3000, tokensOut: 1600 },
  { id: "a-rev", stage: "review", name: "Reviewer", role: "Engineering review", status: "done", model: "claude-opus-4-1", startedAt: at(230), endedAt: at(262), summary: "Score 82", tokensIn: 9000, tokensOut: 2200 },
];

export const DEMO_LOGS: LogEvent[] = agents
  .flatMap((a): LogEvent[] => [
    { ts: a.startedAt!, agentId: a.id, level: "info", message: `${a.name} started` },
    { ts: a.endedAt!, agentId: a.id, level: "info", message: `${a.name} finished — ${a.summary}` },
  ])
  .concat([{ ts: at(250), agentId: "a-rev", level: "warn", message: "Battery has no fuse between pack and buck converter" }])
  .sort((a, b) => (a.ts < b.ts ? -1 : 1));

export const DEMO_PROJECT: Project = {
  id: DEMO_PROJECT_ID,
  prompt: "Build a line-following robot car",
  status: "done",
  createdAt: at(0),
  updatedAt: at(262),
  brief: {
    name: "Tracer Mini",
    tagline: "ESP32 line-following robot car with obstacle avoidance",
    category: "Robotics",
    description: "A compact two-wheel differential-drive robot that follows a black line using two IR reflectance sensors and stops for obstacles detected by an ultrasonic rangefinder.",
    requirements: {
      functional: ["Follow a 19 mm black line on a white floor", "Stop within 10 cm of obstacles", "Status LED and mode button"],
      performance: { "Top speed": "0.6 m/s", Runtime: "≥ 90 min", "Line tracking error": "< 8 mm" },
      constraints: ["Total cost under $60", "Printable on a 220 mm bed"],
    },
    envelope: [150, 75, 140],
    coordinateNotes: "+X is forward, +Y is up, wheels on the ±Z sides.",
    subsystems: [
      { id: "s1", name: "Chassis", description: "Two printed plates on standoffs.", envelope: { center: [0, 46, 0], size: [140, 36, 100] }, keyParts: ["Chassis plate", "Upper deck"], interfaces: ["Motor brackets at x=-40, z=±50", "4x M3 standoffs at (±55, ±40)"] },
      { id: "s2", name: "Drive", description: "Two N20 gear motors with 42 mm wheels.", envelope: { center: [-40, 22, 0], size: [42, 42, 140] }, keyParts: ["N20 motor ×2", "Wheel ×2"], interfaces: ["Motor leads to TB6612 AO/BO"] },
      { id: "s3", name: "Electronics", description: "ESP32 + TB6612 motor driver.", envelope: { center: [0, 64, 0], size: [60, 12, 30] }, keyParts: ["ESP32-DevKitC", "TB6612FNG"], interfaces: ["Mounted on upper deck"] },
    ],
    keyComponents: [
      { name: "ESP32-DevKitC", partNumber: "ESP32-DevKitC-32E", role: "Main controller", qty: 1 },
      { name: "TB6612FNG", partNumber: "ROB-14451", role: "Dual motor driver", qty: 1 },
      { name: "N20 gear motor", role: "Drive", qty: 2 },
    ],
    hasElectronics: true,
    hasFirmware: true,
    firmwarePlatform: "ESP32 Arduino core",
    risks: ["N20 stall current may brown out the buck converter", "IR sensors are sensitive to ambient light"],
  },
  cad,
  bom: sampleBom,
  electronics: sampleElectronics,
  firmware: sampleFirmware,
  assembly: [
    { step: 1, title: "Mount the drive motors", description: "Clamp both N20 motors to the chassis plate with their brackets.", partIds: ["chassis", "motor-l", "motor-r"], tools: ["1.5 mm hex key"], durationMin: 10 },
    { step: 2, title: "Fit the wheels", description: "Press the wheels onto the D-shafts until flush.", partIds: ["wheel-l", "wheel-r"], durationMin: 3, caution: "Support the motor gearbox while pressing." },
    { step: 3, title: "Install electronics", description: "Mount the battery, driver, deck and ESP32, then wire per the breadboard view.", partIds: ["battery", "driver", "deck", "esp32", "sonar"], tools: ["Soldering iron", "Wire strippers"], durationMin: 35 },
  ],
  review: {
    score: 82,
    summary: "Mechanically sound and inexpensive. Add a fuse on the battery lead and level-shift the HC-SR04 echo line (already done via divider).",
    checks: [
      { id: "c1", category: "mechanical", name: "No part interpenetration", status: "pass", detail: "Bounding boxes clear by ≥ 0.5 mm.", source: "deterministic" },
      { id: "c2", category: "electrical", name: "Logic level compatibility", status: "pass", detail: "Echo line divided to 3.3 V.", source: "agent" },
      { id: "c3", category: "safety", name: "Battery protection", status: "warn", detail: "No inline fuse between pack and loads.", source: "agent" },
      { id: "c4", category: "consistency", name: "BOM ↔ CAD links", status: "fail", detail: "bom-res, bom-led have no CAD parts.", source: "deterministic" },
    ],
    metrics: { partCount: cad.parts.length, jointCount: cad.joints.length, bomLineCount: sampleBom.length, costUsd: 47.3, massG: 260, netCount: sampleElectronics.nets.length, componentCount: sampleElectronics.components.length, firmwareLines: 1, powerDrawMa: 820 },
    suggestions: ["Add a 3 A blade fuse on the battery lead", "Use a caster ball at the front for stability"],
  },
  agents,
  revisions: [],
};
