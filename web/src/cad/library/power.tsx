/** Power, connectors and sensors. Origin = centre of bottom face, Y up. */
import { useMemo } from "react";
import type { Vec2 } from "@protoforge/shared";
import { Board, Box, Chip, Cyl, Header, Inst, InstBoxes, Label, Lathe, Mesh, Passives, Plate, Wire, clamp, num, str, type Params, type V3 } from "./kit";
import { getGeometry } from "../geometry";

const STEEL = { color: "#c7cbd0", metalness: 1, roughness: 0.28 };

/** XT60/XT30 plug body, mating face toward -Z, bottom at y=0. scale 1 = XT60. */
function XtPlug({ p, r, k = 1 }: { p: V3; r?: V3; k?: number }) {
  const prof = useMemo<Vec2[]>(() => {
    const w = 15.8 * k;
    const h = 8.2 * k;
    const c = 2.6 * k;
    return [[-w / 2, -h / 2], [w / 2 - c, -h / 2], [w / 2, -h / 2 + c], [w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2, h / 2]];
  }, [k]);
  return (
    <group position={p} rotation={r}>
      {/* profile is [x,z] extruded along Y; rotate so the extrusion runs along Z (body length) */}
      <group rotation={[Math.PI / 2, 0, 0]} position={[0, 4.1 * k, 0]}>
        <Plate profile={prof} t={16 * k} m={{ color: "#f2c230", roughness: 0.45 }} bevel={0.4 * k} />
      </group>
      {[-1, 1].map((s) => (
        <Cyl key={s} rad={1.8 * k} h={0.2} p={[s * 3.6 * k, 4.1 * k, -0.02]} r={[Math.PI / 2, 0, 0]} m={{ color: "#3a2a05" }} seg={16} />
      ))}
    </group>
  );
}

export function BatteryLipo({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 35), 5, 500);
  const l = clamp(num(p, "length", 75), 5, 800);
  const h = clamp(num(p, "height", 35), 2, 500);
  const cells = Math.round(clamp(num(p, "cells", 4), 1, 14));
  const cap = Math.round(num(p, "capacity", 1500));
  const color = str(p, "color", "#222831");
  const k = clamp(Math.min(w, h) / 35, 0.45, 2);
  const lead = Math.max(1.1, 1.6 * k);
  const back = -l / 2;
  return (
    <group>
      <Box s={[w, h, l]} p={[0, h / 2, 0]} m={{ color, roughness: 0.42, clearcoat: 0.5 }} round={Math.min(3, Math.min(w, h) * 0.12)} />
      <Label text={`${cells}S ${cap}mAh`} lines={[`${cap}mAh`, `${cells}S1P ${(cells * 3.7).toFixed(1)}V 120C`]} w={w * 0.86} l={l * 0.62} p={[0, h + 0.02, 0]} bg="#c0392b" fg="#ffffff" res={256} />
      <Box s={[w * 1.002, h * 0.25, l * 0.08]} p={[0, h * 0.5, back + l * 0.04]} m={{ color: "#101114", roughness: 0.6 }} />
      {/* main leads to XT60 */}
      <Wire pts={[[-w * 0.15, h * 0.62, back + 1], [-w * 0.15, h * 0.62, back - 10 * k], [-w * 0.1, h * 0.75, back - 22 * k], [-3.6 * k, h * 0.6, back - 30 * k]]} rad={lead} m={{ color: "#c0392b", roughness: 0.5 }} />
      <Wire pts={[[w * 0.15, h * 0.62, back + 1], [w * 0.15, h * 0.62, back - 10 * k], [w * 0.1, h * 0.75, back - 22 * k], [3.6 * k, h * 0.6, back - 30 * k]]} rad={lead} m={{ color: "#16171a", roughness: 0.5 }} />
      <XtPlug p={[0, h * 0.6 - 4.1 * k, back - 30 * k - 16 * k]} k={k} />
      {/* balance lead */}
      {Array.from({ length: cells + 1 }, (_, i) => {
        const dx = (i - cells / 2) * 0.9;
        return <Wire key={i} pts={[[w * 0.3 + dx * 0.2, h * 0.25, back + 1], [w * 0.32 + dx, h * 0.22, back - 8], [w * 0.35 + dx, h * 0.2, back - 18]]} rad={0.35} m={{ color: i === 0 ? "#16171a" : "#c0392b" }} />;
      })}
      <Box s={[(cells + 1) * 2.5 + 1, 4.6, 6]} p={[w * 0.35, h * 0.2, back - 21]} m={{ color: "#f1efe8", roughness: 0.6 }} round={0.4} />
    </group>
  );
}

export function BatteryCell({ p }: { p: Params }) {
  const d = clamp(num(p, "diameter", 18.5), 2, 200);
  const L = clamp(num(p, "length", 65), 2, 400);
  const color = str(p, "color", "#2e86de");
  const r = d / 2;
  return (
    <group>
      <Lathe profile={[[0, 0], [r * 0.92, 0], [r, 0.6], [r, L - 0.9], [r * 0.9, L - 0.4], [0, L - 0.4]]} m={{ color, roughness: 0.35, clearcoat: 0.6 }} seg={48} />
      <Cyl rad={r * 0.85} h={0.3} p={[0, 0.1, 0]} m={STEEL} seg={40} />
      <Cyl rad={r * 0.88} h={0.2} p={[0, L - 0.35, 0]} m={{ color: "#f1efe8", roughness: 0.6 }} seg={40} />
      <Lathe profile={[[0, L - 0.3], [r * 0.4, L - 0.3], [r * 0.38, L], [0, L]]} m={STEEL} seg={32} />
      <Lathe profile={[[r * 1.003, L * 0.3], [r * 1.003, L * 0.7]]} m={{ color: "#e6e9ef", roughness: 0.5 }} seg={48} />
    </group>
  );
}

export function BatteryPouch({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 40), 4, 500);
  const l = clamp(num(p, "length", 90), 4, 800);
  const t = clamp(num(p, "thickness", 4.5), 0.5, 50);
  return (
    <group>
      <Box s={[w, t, l * 0.94]} p={[0, t / 2, l * 0.03]} m={{ color: "#c7c9cc", metalness: 0.6, roughness: 0.45 }} round={Math.min(1.2, t * 0.3)} />
      <Box s={[w, 0.3, l * 0.06]} p={[0, t * 0.5, -l / 2 + l * 0.03]} m={{ color: "#b4b7bb", metalness: 0.6, roughness: 0.5 }} />
      <Box s={[w * 0.92, 0.04, l * 0.7]} p={[0, t + 0.02, l * 0.05]} m={{ color: "#d4a032", roughness: 0.4, opacity: 0.55 }} />
      <Label text="Li-ion" lines={["Li-ion Polymer", `3.85V ${Math.round(w * l * t * 0.0002) * 100 || 1200}mAh`]} w={w * 0.6} l={Math.min(l * 0.25, w * 0.4)} p={[0, t + 0.05, l * 0.05]} bg="#e6e9ef" fg="#22252b" res={256} />
      <Box s={[w * 0.7, 1, Math.min(6, l * 0.07)]} p={[0, t * 0.5, -l / 2 - Math.min(3, l * 0.035)]} m="pcb_green" />
      <Box s={[w * 0.2, 0.15, 12]} p={[w * 0.2, t * 0.5, -l / 2 - 10]} m={{ color: "#d48a1f", roughness: 0.4 }} />
      <Box s={[w * 0.22, 0.8, 3]} p={[w * 0.2, t * 0.5 + 0.4, -l / 2 - 16]} m={{ color: "#1a1a1a" }} />
    </group>
  );
}

export function PowerModule({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 22), 5, 300);
  const l = clamp(num(p, "length", 43), 5, 300);
  return (
    <group>
      <Board w={w} l={l} t={1.6} preset="pcb_blue" holeR={Math.min(1.5, w * 0.06)} holeInset={Math.min(3, w * 0.13)} radius={0.6} />
      <Box s={[w * 0.5, Math.min(6, w * 0.28), w * 0.5]} p={[0, 1.6 + Math.min(6, w * 0.28) / 2, -l * 0.05]} m={{ color: "#2a2b2f", roughness: 0.55 }} round={0.6} />
      <Label text="330" w={w * 0.3} l={w * 0.2} p={[0, 1.6 + Math.min(6, w * 0.28) + 0.01, -l * 0.05]} bg="#2a2b2f" fg="#a3abbd" res={64} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl rad={Math.min(4, w * 0.16)} h={Math.min(8, w * 0.36)} p={[s * w * 0.22, 1.6 + Math.min(8, w * 0.36) / 2, s * l * 0.3]} m={{ color: "#1d3a6b", roughness: 0.4 }} seg={24} />
          <Cyl rad={Math.min(4, w * 0.16) * 0.9} h={0.2} p={[s * w * 0.22, 1.6 + Math.min(8, w * 0.36) + 0.1, s * l * 0.3]} m="aluminum" seg={24} />
        </group>
      ))}
      <Chip w={Math.min(10, w * 0.4)} l={Math.min(8, w * 0.3)} h={2} p={[-w * 0.15, 1.6, l * 0.15]} label="LM2596" />
      <Box s={[w * 0.3, 4.5, w * 0.3]} p={[w * 0.25, 1.6 + 2.25, l * 0.1]} m={{ color: "#2257b8", roughness: 0.5 }} />
      <Cyl rad={w * 0.08} h={0.6} p={[w * 0.25 + w * 0.06, 1.6 + 4.8, l * 0.1 + w * 0.06]} m="brass" seg={12} />
      <InstBoxes size={[3, 0.06, 3]} m="gold" at={[[-w * 0.3, 1.63, -l / 2 + 3], [w * 0.3, 1.63, -l / 2 + 3], [-w * 0.3, 1.63, l / 2 - 3], [w * 0.3, 1.63, l / 2 - 3]]} />
    </group>
  );
}

export function Connector({ p }: { p: Params }) {
  const v = str(p, "variant", "xt60").toLowerCase();
  switch (v) {
    case "xt30":
      return <XtPlug p={[0, 0, 0]} k={0.62} />;
    case "jst":
      return (
        <group>
          <Box s={[6, 4.5, 6]} p={[0, 2.25, 0]} m={{ color: "#f1efe8", roughness: 0.6 }} round={0.3} />
          <Box s={[4.4, 3.2, 0.2]} p={[0, 2.3, -3.02]} m={{ color: "#141416" }} />
          <InstBoxes size={[0.5, 0.5, 3]} m="brass" at={[[-1, 1.6, 4], [1, 1.6, 4]]} />
          {["#c0392b", "#16171a"].map((c, i) => (
            <Wire key={c} pts={[[i ? 1 : -1, 2.2, 3], [i ? 1.2 : -1.2, 2.2, 10], [i ? 2 : -2, 1.5, 18]]} rad={0.45} m={{ color: c }} />
          ))}
        </group>
      );
    case "usb_c":
    case "lightning":
      return (
        <group>
          <Box s={v === "usb_c" ? [8.9, 3.2, 7.4] : [7.8, 2.4, 7]} p={[0, v === "usb_c" ? 1.6 : 1.2, 0]} m={STEEL} round={v === "usb_c" ? 1.4 : 1.1} />
          <Box s={[v === "usb_c" ? 7 : 6, v === "usb_c" ? 1.6 : 1, 0.2]} p={[0, v === "usb_c" ? 1.6 : 1.2, -3.72]} m={{ color: "#050506" }} />
          <Box s={[5.6, 0.6, 3]} p={[0, v === "usb_c" ? 1.6 : 1.2, -2.6]} m={{ color: "#141416" }} />
        </group>
      );
    case "barrel":
      return (
        <group>
          <Box s={[9, 11, 14]} p={[0, 5.5, 0]} m={{ color: "#141416", roughness: 0.55 }} round={0.4} />
          <Cyl rad={3.1} h={0.2} p={[0, 6.3, -7.02]} r={[Math.PI / 2, 0, 0]} m={{ color: "#030304" }} seg={24} />
          <Cyl rad={1} h={6} p={[0, 6.3, -4]} r={[Math.PI / 2, 0, 0]} m={STEEL} seg={14} />
          <InstBoxes size={[0.4, 3.5, 2.6]} m="steel" at={[[-3, -1.6, 4], [3, -1.6, 0], [0, -1.6, 6]]} />
        </group>
      );
    default:
      return <XtPlug p={[0, 0, 0]} />;
  }
}

export function CameraModule({ p }: { p: Params }) {
  const S = clamp(num(p, "size", 19), 3, 200);
  const ld = clamp(num(p, "lensDiameter", 12), 1, S * 2);
  const lh = clamp(num(p, "lensHeight", 8), 0.5, 200);
  const H = clamp(num(p, "height", 19), 1, 200);
  const lr = ld / 2;
  const knurl = useMemo(() => {
    const out: { p: V3; r: V3 }[] = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ p: [Math.cos(a) * lr, H + lh * 0.45, Math.sin(a) * lr], r: [0, -a, 0] });
    }
    return out;
  }, [lr, H, lh]);
  return (
    <group>
      <Box s={[S, H, S]} p={[0, H / 2, 0]} m={{ color: "#1b1c20", metalness: 0.6, roughness: 0.42 }} round={Math.min(2, S * 0.1)} />
      {[-1, 1].map((s) => (
        <Cyl key={s} rad={Math.max(0.5, S * 0.06)} h={0.2} p={[s * (S / 2 + 0.05), H * 0.5, 0]} r={[0, 0, Math.PI / 2]} m={{ color: "#050506" }} seg={16} />
      ))}
      <Cyl rad={lr * 1.08} h={1} p={[0, H + 0.5, 0]} m={{ color: "#141518", metalness: 0.7, roughness: 0.4 }} seg={40} />
      <Lathe profile={[[0, H], [lr, H], [lr, H + lh - 0.6], [lr * 0.92, H + lh], [lr * 0.7, H + lh], [lr * 0.66, H + lh - 0.5], [0, H + lh - 0.5]]} m={{ color: "#202226", metalness: 0.5, roughness: 0.4 }} seg={48} />
      {lr > 1.5 ? <Inst28 items={knurl} lr={lr} lh={lh} /> : null}
      <Lathe profile={[[0, H + lh - 0.2], [lr * 0.64, H + lh - 0.5], [lr * 0.5, H + lh - 0.15], [lr * 0.25, H + lh + 0.08], [0, H + lh + 0.12]]} m={{ preset: "lens", color: "#0e1a33" }} seg={40} />
      <Lathe profile={[[lr * 0.3, H + lh - 0.3], [lr * 0.36, H + lh - 0.3], [lr * 0.36, H + lh - 0.28], [lr * 0.3, H + lh - 0.28]]} m={{ color: "#4a2f8f", metalness: 0.9, roughness: 0.1 }} seg={32} />
      <Box s={[S * 0.5, 0.15, S * 0.9]} p={[0, 0.3, -S / 2 - S * 0.4]} m={{ color: "#d48a1f", roughness: 0.4 }} />
      <Label text="FPV" w={S * 0.4} l={S * 0.2} p={[0, 0.001, 0]} rotY={Math.PI} bg="#1b1c20" fg="#6b7489" res={64} />
    </group>
  );
}

function Inst28({ items, lr, lh }: { items: { p: V3; r: V3 }[]; lr: number; lh: number }) {
  const g = getGeometry({ type: "box", size: [Math.max(0.3, lr * 0.08), lh * 0.5, Math.max(0.3, lr * 0.14)] });
  return <InstanceList g={g} items={items} />;
}

function InstanceList({ g, items }: { g: ReturnType<typeof getGeometry>; items: { p: V3; r: V3 }[] }) {
  return <Inst g={g} m={{ color: "#16171a", metalness: 0.5, roughness: 0.5 }} items={items} />;
}

export function LensModel({ p }: { p: Params }) {
  const d = clamp(num(p, "diameter", 12), 1, 300);
  const h = clamp(num(p, "height", 2), 0.1, 100);
  const r = d / 2;
  return (
    <group>
      <Lathe profile={[[r * 0.72, 0], [r, 0], [r, h * 0.7], [r * 0.94, h], [r * 0.8, h], [r * 0.76, h * 0.8], [r * 0.72, h * 0.8], [r * 0.72, 0]]} m="stainless" seg={56} />
      <Lathe profile={[[0, h * 0.5], [r * 0.73, h * 0.5], [r * 0.73, h * 0.78], [r * 0.4, h * 0.84], [0, h * 0.86]]} m="lens" seg={48} />
      <Mesh g={getGeometry({ type: "torus", radius: r * 0.45, tube: Math.max(0.05, r * 0.03) })} p={[0, h * 0.8, 0]} m={{ color: "#2b2f3a", metalness: 0.8, roughness: 0.3 }} />
      <Mesh g={getGeometry({ type: "torus", radius: r * 0.25, tube: Math.max(0.04, r * 0.025) })} p={[0, h * 0.82, 0]} m={{ color: "#3a2f6b", metalness: 0.9, roughness: 0.2 }} />
    </group>
  );
}

export function SensorModule({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 20), 4, 200);
  const l = clamp(num(p, "length", 16), 4, 200);
  const label = str(p, "label", "IMU");
  const color = str(p, "color", "#6a1b9a");
  const pins = Math.round(clamp(num(p, "pins", 6), 0, 40));
  const chip = Math.min(w, l) * 0.3;
  return (
    <group>
      <Board w={w} l={l} t={1.6} color={color} holeR={Math.min(1.5, Math.min(w, l) * 0.08)} holeInset={Math.min(2.5, Math.min(w, l) * 0.15)} holes={[[-w / 2 + Math.min(2.5, w * 0.15), l / 2 - Math.min(2.5, l * 0.15)], [w / 2 - Math.min(2.5, w * 0.15), l / 2 - Math.min(2.5, l * 0.15)]]} radius={0.8} />
      <Chip w={chip} l={chip} h={0.9} p={[0, 1.6, l * 0.08]} label={label} />
      {pins > 0 ? <Header n={pins} p={[0, 1.6, -l / 2 + 1.5]} /> : null}
      <Passives w={w * 0.8} l={l * 0.4} y={1.6} count={6} seed={label.length} avoid={[[0, l * 0.08, chip + 1, chip + 1], [0, -l / 2 + 1.5, w, 3]]} />
      <Label text={label} w={Math.min(w * 0.4, 8)} l={2} p={[0, 1.61, l / 2 - 1.6]} bg={color} fg="#e6e9ef" res={128} />
    </group>
  );
}

export function UltrasonicSensor() {
  const meshTop = { color: "#2a2b2e", roughness: 1 };
  return (
    <group>
      <Board w={45} l={20} t={1.6} preset="pcb_blue" holes={[[-21, -8.5], [21, -8.5], [21, 8.5], [-21, 8.5]]} holeR={0.9} radius={0.5} />
      {[-13, 13].map((x) => (
        <group key={x} position={[x, 1.6, 0.5]}>
          <Lathe profile={[[0, 0], [8, 0], [8, 12], [7.4, 12.3], [0, 12.3]]} m={{ color: "#c9ccd1", metalness: 0.9, roughness: 0.32 }} seg={40} />
          <Cyl rad={7.2} h={0.1} p={[0, 12.35, 0]} m={meshTop} seg={36} />
        </group>
      ))}
      <Box s={[11, 2.5, 4.6]} p={[0, 1.6 + 1.25, 5]} m={{ color: "#c0c4c8", metalness: 1, roughness: 0.25 }} round={1.2} />
      <Label text="HC-SR04" w={10} l={3} p={[0, 1.61, -4]} bg="#1b5aa8" fg="#e6e9ef" res={128} />
      <group position={[0, 0.8, -10]}>
        <Box s={[10.2, 2.5, 2.5]} p={[0, 0, -1.25]} m={{ color: "#141416" }} />
        <InstBoxes size={[0.64, 0.64, 8]} m="gold" at={[-3.81, -1.27, 1.27, 3.81].map((x) => [x, 0, -4] as V3)} />
      </group>
    </group>
  );
}

export function GpsModule({ p }: { p: Params }) {
  const S = clamp(num(p, "size", 25), 6, 200);
  const pa = S * 0.72;
  return (
    <group>
      <Board w={S} l={S} t={1.2} preset="pcb_black" holeR={0} radius={1} />
      <Box s={[pa, 4, pa]} p={[0, 1.2 + 2, 0]} m={{ color: "#c8b48a", roughness: 0.65 }} round={0.3} />
      <Box s={[pa * 0.8, 0.12, pa * 0.8]} p={[0, 5.26, 0]} m={{ color: "#d9dbe0", metalness: 1, roughness: 0.25 }} />
      <Cyl rad={0.7} h={0.5} p={[pa * 0.08, 5.4, pa * 0.08]} m="steel" seg={12} />
      <Box s={[S * 0.4, 1.6, S * 0.4]} p={[0, -0.8, 0]} m={{ color: "#bfc3c8", metalness: 1, roughness: 0.35 }} />
      <InstBoxes size={[1, 0.4, 0.6]} m={{ color: "#f0f0e8", emissive: "#2fa8ff", emissiveIntensity: 0.8 }} at={[[S * 0.42, 1.4, S * 0.42]]} />
    </group>
  );
}

export function Microphone({ p }: { p: Params }) {
  const d = clamp(num(p, "diameter", 6), 1, 100);
  const r = d / 2;
  const h = Math.max(1, d * 0.5);
  return (
    <group>
      <Lathe profile={[[0, 0], [r, 0], [r, h - 0.2], [r * 0.9, h], [0, h]]} m="aluminum" seg={36} />
      <Cyl rad={r * 0.82} h={0.06} p={[0, h + 0.02, 0]} m={{ color: "#18191b", roughness: 1 }} seg={32} />
      <InstBoxes size={[0.4, 0.04, 0.4]} m="gold" at={[[-r * 0.4, -0.02, 0], [r * 0.4, -0.02, 0]]} />
    </group>
  );
}

