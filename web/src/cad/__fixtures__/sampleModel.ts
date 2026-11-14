/**
 * Hand-made CadModel of a 5" FPV quadcopter (~50 parts) used to exercise the CAD viewer.
 * Frame: +Z is the front (camera), +Y up, origin at the centre of the bottom plate underside.
 */
import type { CadCut, CadModel, CadPart, Joint, Vec2, Vec3 } from "@protoforge/shared";

const r2 = (n: number) => Math.round(n * 100) / 100;

function rrect(w: number, l: number, r: number, seg = 5): Vec2[] {
  const hw = w / 2;
  const hl = l / 2;
  const pts: Vec2[] = [];
  const cs: [number, number, number][] = [[hw - r, hl - r, 0], [-hw + r, hl - r, 90], [-hw + r, -hl + r, 180], [hw - r, -hl + r, 270]];
  for (const [cx, cz, a0] of cs) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180;
      pts.push([r2(cx + Math.cos(a) * r), r2(cz + Math.sin(a) * r)]);
    }
  }
  return pts;
}

const hole = (x: number, z: number, r = 1.6): CadCut => ({ geometry: { type: "cylinder", radius: r, height: 12, segments: 20 }, position: [x, 0, z] });

const STACK = 15.25; // 30.5 mm stack pattern
const ARM_IN = 28;
const ARM_OUT = 120;
const MOTOR_R = 110;
const ARM_LEN = ARM_OUT - ARM_IN;
const ARM_MID = (ARM_IN + ARM_OUT) / 2;
const MOTOR_LOCAL = MOTOR_R - ARM_MID;

const corners: { key: string; sx: number; sz: number; yaw: number; prop: string; spin: string }[] = [
  { key: "fr", sx: 1, sz: 1, yaw: -45, prop: "#ff7a1a", spin: "CW" },
  { key: "fl", sx: -1, sz: 1, yaw: -135, prop: "#ff7a1a", spin: "CCW" },
  { key: "rl", sx: -1, sz: -1, yaw: 135, prop: "#38bdf8", spin: "CW" },
  { key: "rr", sx: 1, sz: -1, yaw: 45, prop: "#38bdf8", spin: "CCW" },
];

const parts: CadPart[] = [];
const joints: Joint[] = [];
let jn = 0;
const join = (type: Joint["type"], a: string, b: string, fastener?: string, anchor?: Vec3, description?: string) =>
  joints.push({ id: `j${++jn}`, type, partA: a, partB: b, fastener, anchor, description });

/* ------------------------------ frame ------------------------------ */
parts.push({
  id: "bottom_plate",
  name: "Bottom plate",
  subsystem: "Frame",
  geometry: { type: "extrude", profile: rrect(46, 104, 8), depth: 3, bevel: 0.3 },
  position: [0, 1.5, 0],
  material: { preset: "carbon_fiber" },
  cuts: [
    hole(STACK, STACK), hole(-STACK, STACK), hole(STACK, -STACK), hole(-STACK, -STACK),
    hole(18, 42), hole(-18, 42), hole(18, -42), hole(-18, -42),
    { geometry: { type: "box", size: [16, 12, 6], radius: 0 }, position: [0, 0, 36] },
    { geometry: { type: "box", size: [16, 12, 6], radius: 0 }, position: [0, 0, -36] },
  ],
  bomId: "bom_frame",
  fabrication: "CNC 3 mm 3K twill carbon fibre plate",
  massG: 18,
  description: "Main structural plate carrying the arms and the flight stack.",
});

parts.push({
  id: "top_plate",
  name: "Top plate",
  subsystem: "Frame",
  geometry: { type: "extrude", profile: rrect(42, 100, 7), depth: 2, bevel: 0.25 },
  position: [0, 34, 0],
  material: { preset: "carbon_fiber" },
  cuts: [
    hole(18, 42), hole(-18, 42), hole(18, -42), hole(-18, -42),
    { geometry: { type: "box", size: [22, 6, 3.5] }, position: [0, 0, 22] },
    { geometry: { type: "box", size: [22, 6, 3.5] }, position: [0, 0, -22] },
    { geometry: { type: "cylinder", radius: 6, height: 6 }, position: [0, 0, 0] },
  ],
  bomId: "bom_frame",
  explode: [0, 45, 0],
  fabrication: "CNC 2 mm carbon fibre plate",
  massG: 9,
});

for (const c of corners) {
  const ax = (c.sx * ARM_MID) / Math.SQRT2;
  const az = (c.sz * ARM_MID) / Math.SQRT2;
  const mx = (c.sx * MOTOR_R) / Math.SQRT2;
  const mz = (c.sz * MOTOR_R) / Math.SQRT2;
  parts.push({
    id: `arm_${c.key}`,
    name: `Arm ${c.key.toUpperCase()}`,
    subsystem: "Frame",
    geometry: { type: "extrude", profile: rrect(ARM_LEN, 20, 8), depth: 5, bevel: 0.4 },
    position: [r2(ax), 5.5, r2(az)],
    rotation: [0, c.yaw, 0],
    material: { preset: "carbon_fiber" },
    cuts: [
      hole(MOTOR_LOCAL + 8, 0), hole(MOTOR_LOCAL - 8, 0), hole(MOTOR_LOCAL, 8), hole(MOTOR_LOCAL, -8),
      hole(MOTOR_LOCAL, 0, 3.2),
      { geometry: { type: "box", size: [34, 12, 7], radius: 0 }, position: [-4, 0, 0] },
      hole(-ARM_LEN / 2 + 8, 4), hole(-ARM_LEN / 2 + 8, -4),
    ],
    bomId: "bom_frame",
    fabrication: "CNC 5 mm carbon fibre, chamfered edges",
    massG: 9,
  });
  parts.push({
    id: `motor_${c.key}`,
    name: `Motor ${c.key.toUpperCase()} (${c.spin})`,
    subsystem: "Propulsion",
    geometry: { type: "component", model: "bldc_motor", params: { diameter: 28, height: 20, shaftLength: 12, shaftDiameter: 5, color: "#d35400" } },
    position: [r2(mx), 8, r2(mz)],
    rotation: [0, c.yaw + 180, 0],
    bomId: "bom_motor",
    electronicsId: `m_${c.key}`,
    massG: 32,
    description: "2207 1950KV brushless outrunner",
  });
  parts.push({
    id: `prop_${c.key}`,
    name: `Propeller ${c.key.toUpperCase()}`,
    subsystem: "Propulsion",
    geometry: { type: "component", model: "propeller", params: { diameter: 127, blades: 3, hubHeight: 6, color: c.prop } },
    position: [r2(mx), 28.2, r2(mz)],
    rotation: [0, c.key === "fr" ? 10 : c.key === "fl" ? 50 : c.key === "rl" ? 80 : 25, 0],
    bomId: "bom_prop",
    explode: [0, 55, 0],
    massG: 4.3,
  });
  parts.push({
    id: `wire_${c.key}`,
    name: `Motor leads ${c.key.toUpperCase()}`,
    subsystem: "Wiring",
    geometry: {
      type: "tube",
      radius: 1.2,
      path: [
        [r2(mx * 0.86), 9.5, r2(mz * 0.86)],
        [r2(mx * 0.6), 9.2, r2(mz * 0.6)],
        [r2(mx * 0.35), 9.5, r2(mz * 0.35)],
        [r2(c.sx * 15), 11.5, r2(c.sz * 15)],
      ],
    },
    position: [0, 0, 0],
    material: { color: "#1b1b1b", roughness: 0.6 },
    explode: [0, 0, 0],
  });
  join("fastened", `motor_${c.key}`, `arm_${c.key}`, "4x M3x6 button head", [r2(mx), 8, r2(mz)], "Motor base screwed to arm pad");
  join("threaded", `prop_${c.key}`, `motor_${c.key}`, "M5 nyloc prop nut", [r2(mx), 34, r2(mz)]);
  join("clamped", `arm_${c.key}`, "bottom_plate", "2x M3x12 + sandwich", [r2((c.sx * ARM_IN) / Math.SQRT2), 5.5, r2((c.sz * ARM_IN) / Math.SQRT2)]);
  join("soldered", `wire_${c.key}`, "esc", "3x motor pads", [r2(c.sx * 15), 13, r2(c.sz * 15)]);
}

/* ------------------------------ frame standoffs + screws ------------------------------ */
[[18, 42], [-18, 42], [18, -42], [-18, -42]].forEach(([x, z], i) => {
  parts.push({
    id: `frame_standoff_${i + 1}`,
    name: `Frame standoff ${i + 1}`,
    subsystem: "Frame",
    geometry: { type: "component", model: "standoff", params: { diameter: 5, length: 30, color: "#c0392b" } },
    position: [x, 3, z],
    bomId: "bom_standoff",
    massG: 1.2,
  });
  parts.push({
    id: `top_screw_${i + 1}`,
    name: `Top plate screw ${i + 1}`,
    subsystem: "Frame",
    geometry: { type: "component", model: "screw", params: { diameter: 3, length: 6 } },
    position: [x, 35, z],
    bomId: "bom_screws",
    explode: [0, 60, 0],
    massG: 0.6,
  });
  join("threaded", `frame_standoff_${i + 1}`, "top_plate", "M3x6 SHCS", [x, 35, z]);
  join("threaded", `frame_standoff_${i + 1}`, "bottom_plate", "M3x8 SHCS", [x, 3, z]);
});

/* ------------------------------ flight stack ------------------------------ */
const stackXZ: [number, number][] = [[STACK, STACK], [-STACK, STACK], [STACK, -STACK], [-STACK, -STACK]];
stackXZ.forEach(([x, z], i) => {
  parts.push({
    id: `stack_low_${i + 1}`,
    name: `Stack spacer (low) ${i + 1}`,
    subsystem: "Flight stack",
    geometry: { type: "component", model: "standoff", params: { diameter: 5, length: 7, color: "#1f1f22" } },
    position: [x, 3, z],
    bomId: "bom_standoff",
  });
  parts.push({
    id: `stack_high_${i + 1}`,
    name: `Stack spacer (high) ${i + 1}`,
    subsystem: "Flight stack",
    geometry: { type: "component", model: "standoff", params: { diameter: 5, length: 7, color: "#1f1f22" } },
    position: [x, 14.6, z],
    bomId: "bom_standoff",
  });
  parts.push({
    id: `stack_screw_${i + 1}`,
    name: `Stack screw ${i + 1}`,
    subsystem: "Flight stack",
    geometry: { type: "component", model: "screw", params: { diameter: 3, length: 25 } },
    position: [x, 26.6, z],
    bomId: "bom_screws",
    explode: [0, 70, 0],
  });
});

parts.push({
  id: "esc",
  name: "4-in-1 ESC 50A",
  subsystem: "Flight stack",
  geometry: { type: "component", model: "esc", params: { variant: "4in1", mount: 30.5 } },
  position: [0, 10, 0],
  bomId: "bom_esc",
  electronicsId: "esc",
  massG: 14,
  description: "BLHeli_32 4-in-1 ESC, 3-6S",
});
parts.push({
  id: "fc",
  name: "Flight controller F405",
  subsystem: "Flight stack",
  geometry: { type: "component", model: "flight_controller", params: { mount: 30.5 } },
  position: [0, 21.6, 0],
  bomId: "bom_fc",
  electronicsId: "fc",
  massG: 9,
  explode: [0, 30, 0],
});
join("wired", "fc", "esc", "8-pin JST-SH harness", [0, 19, 0]);
join("fastened", "esc", "bottom_plate", "4x M3x25 through stack, silicone grommets", [STACK, 10, STACK]);
join("fastened", "fc", "esc", "M3 nylon spacers", [-STACK, 21, -STACK]);

/* ------------------------------ power ------------------------------ */
parts.push({
  id: "battery",
  name: "LiPo 6S 1300mAh",
  subsystem: "Power",
  geometry: { type: "component", model: "battery_lipo", params: { width: 35, length: 75, height: 35, cells: 6, capacity: 1300, color: "#1d2733" } },
  position: [0, 36, 2],
  bomId: "bom_battery",
  electronicsId: "batt",
  massG: 205,
  explode: [0, 80, 0],
});
parts.push({
  id: "battery_strap",
  name: "Battery strap",
  subsystem: "Power",
  geometry: {
    type: "tube",
    radius: 0.9,
    path: [[-22, 34, 0], [-19, 72, 0], [0, 72.5, 0], [19, 72, 0], [22, 34, 0]],
  },
  position: [0, 0, 0],
  material: { preset: "rubber", color: "#c0392b" },
  explode: [0, 80, 0],
});
parts.push({
  id: "battery_pad",
  name: "Battery grip pad",
  subsystem: "Power",
  geometry: { type: "box", size: [30, 1, 70], radius: 0.4 },
  position: [0, 35.5, 2],
  material: { preset: "silicone", color: "#2c2f36" },
  explode: [0, 50, 0],
});
parts.push({
  id: "power_lead",
  name: "XT60 pigtail",
  subsystem: "Wiring",
  geometry: { type: "tube", radius: 1.8, path: [[0, 12, -18], [0, 14, -40], [0, 26, -54], [0, 36, -62]] },
  position: [0, 0, 0],
  material: { color: "#c0392b", roughness: 0.5 },
});
parts.push({
  id: "xt60",
  name: "XT60 connector",
  subsystem: "Wiring",
  geometry: { type: "component", model: "connector", params: { variant: "xt60" } },
  position: [0, 34, -78],
  bomId: "bom_xt60",
});
join("adhesive", "battery_pad", "top_plate", "3M VHB", [0, 35, 2]);
join("clamped", "battery", "top_plate", "20 mm Kevlar strap", [0, 36, 2]);
join("soldered", "power_lead", "esc", "12 AWG to battery pads", [0, 12, -18]);
join("press_fit", "power_lead", "xt60", "solder cups", [0, 36, -62]);

/* ------------------------------ FPV ------------------------------ */
parts.push({
  id: "camera",
  name: "FPV camera",
  subsystem: "FPV",
  geometry: { type: "component", model: "camera_module", params: { size: 19, lensDiameter: 12, lensHeight: 8, height: 19 } },
  position: [0, 18, 30],
  rotation: [65, 0, 0],
  bomId: "bom_cam",
  electronicsId: "cam",
  massG: 6,
  explode: [0, 10, 40],
});
[-1, 1].forEach((s) => {
  parts.push({
    id: `cam_plate_${s > 0 ? "r" : "l"}`,
    name: `Camera side plate ${s > 0 ? "R" : "L"}`,
    subsystem: "FPV",
    geometry: { type: "extrude", profile: [[0, -10], [12, -12], [14, 6], [0, 12], [-8, 4]], depth: 2, bevel: 0.2 },
    position: [s * 11.5, 18, 38],
    rotation: [0, 0, 90],
    material: { preset: "carbon_fiber" },
    cuts: [{ geometry: { type: "cylinder", radius: 1.1, height: 6 }, position: [6, 0, 0] }],
    bomId: "bom_frame",
    explode: [s * 20, 0, 30],
  });
  join("fastened", "camera", `cam_plate_${s > 0 ? "r" : "l"}`, "M2x5 screw", [s * 10.5, 18 + 9, 38]);
  join("clamped", `cam_plate_${s > 0 ? "r" : "l"}`, "bottom_plate", "slot", [s * 11.5, 4, 40]);
});
parts.push({
  id: "vtx",
  name: "Video transmitter",
  subsystem: "FPV",
  geometry: { type: "component", model: "rf_module", params: { width: 20, length: 27, label: "VTX 5.8G" } },
  position: [0, 3, -32],
  bomId: "bom_vtx",
  electronicsId: "vtx",
  massG: 6,
});
parts.push({
  id: "rx",
  name: "ELRS receiver",
  subsystem: "FPV",
  geometry: { type: "component", model: "rf_module", params: { width: 11, length: 16, label: "ELRS" } },
  position: [0, 27, -26],
  bomId: "bom_rx",
  electronicsId: "rx",
  massG: 1,
});
parts.push({
  id: "antenna",
  name: "5.8 GHz antenna",
  subsystem: "FPV",
  geometry: { type: "component", model: "antenna", params: { length: 40, variant: "lollipop" } },
  position: [0, 5, -50],
  rotation: [-60, 0, 0],
  bomId: "bom_ant",
  massG: 4,
  explode: [0, 0, -30],
});
join("wired", "vtx", "fc", "4-wire harness", [0, 8, -26]);
join("wired", "rx", "fc", "UART 4-pin", [0, 26, -20]);
join("threaded", "antenna", "vtx", "MMCX/SMA", [0, 5, -46]);
join("adhesive", "rx", "top_plate", "double-sided tape", [0, 31, -26]);
join("wired", "camera", "fc", "3-pin camera cable", [0, 20, 24]);

export const sampleModel: CadModel = { units: "mm", parts, joints };
export default sampleModel;
