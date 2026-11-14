/** Displays, IO, RF, audio and structural hardware. Origin = centre of bottom face, Y up (unless noted). */
import { useMemo } from "react";
import type { Vec2 } from "@protoforge/shared";
import { Board, Box, Cyl, Header, InstBoxes, InstCyl, Label, Lathe, Mesh, Plate, Wire, clamp, num, roundedProfile, str, useMat, type Params, type V3 } from "./kit";
import { hexPrism, threadGeometry } from "./shapes";
import { applyCuts } from "../csg";
import { canvasTexture } from "../materials";
import { memoGeometry } from "../geometry";
import * as THREE from "three";

function screenTexture(kind: "phone" | "oled") {
  return canvasTexture(`screen:${kind}`, 256, kind === "phone" ? 512 : 128, (ctx, w, h) => {
    if (kind === "oled") {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#7fd8ff";
      ctx.font = "bold 22px monospace";
      ctx.fillText("PROTOFORGE", 18, 40);
      ctx.font = "16px monospace";
      ctx.fillText("T 23.4C  H 41%", 18, 72);
      ctx.fillRect(18, 92, Math.round(w * 0.55), 10);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1b2a6b");
    g.addColorStop(0.5, "#5a2a8a");
    g.addColorStop(1, "#ff7a1a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 54px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("9:41", w / 2, h * 0.2);
    for (let i = 0; i < 16; i++) {
      const x = 28 + (i % 4) * 56;
      const y = h * 0.36 + Math.floor(i / 4) * 64;
      ctx.fillStyle = `hsla(${(i * 47) % 360},70%,60%,0.85)`;
      ctx.beginPath();
      ctx.roundRect?.(x, y, 40, 40, 10);
      ctx.fill();
    }
  });
}

/** Flat textured plane facing +Y with emissive map (glowing active area). */
function GlowPlane({ w, l, y, tex, intensity = 1.1, rotY = 0 }: { w: number; l: number; y: number; tex: THREE.Texture | undefined; intensity?: number; rotY?: number }) {
  const mat = useMat()({ color: "#000000", map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: intensity, roughness: 0.15, metalness: 0 });
  const g = memoGeometry("unit-plane", () => new THREE.PlaneGeometry(1, 1));
  return <mesh geometry={g} material={mat} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, rotY]} scale={[w, l, 1]} />;
}

export function Display({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 71), 5, 3000);
  const l = clamp(num(p, "length", 147), 5, 3000);
  const t = clamp(num(p, "thickness", 1.2), 0.2, 100);
  const bezel = clamp(num(p, "bezel", 1.5), 0, Math.min(w, l) / 4);
  const cr = clamp(num(p, "cornerRadius", 8), 0, Math.min(w, l) / 2);
  const notch = str(p, "notch", "island").toLowerCase();
  const outline = useMemo(() => roundedProfile(w, l, cr, 8), [w, l, cr]);
  const aw = w - 2 * bezel;
  const al = l - 2 * bezel;
  const pill = useMemo<Vec2[]>(() => {
    const pw = Math.min(aw * 0.35, 26);
    const ph = Math.min(al * 0.05, 7.5);
    return roundedProfile(pw, ph, ph / 2, 8);
  }, [aw, al]);
  const tex = screenTexture("phone");
  return (
    <group>
      <Plate profile={outline} t={t} m="screen" bevel={Math.min(0.3, t * 0.25)} />
      <GlowPlane w={aw} l={al} y={t + 0.01} tex={tex} intensity={0.95} />
      {notch === "island" ? (
        <Plate profile={pill} t={0.02} p={[0, t + 0.015, -al / 2 + Math.min(al * 0.05, 7.5) + 2.5]} m={{ color: "#010102", roughness: 0.2 }} />
      ) : notch === "notch" ? (
        <Box s={[Math.min(aw * 0.45, 34), 0.02, Math.min(al * 0.04, 6)]} p={[0, t + 0.02, -al / 2 + Math.min(al * 0.02, 3)]} m={{ color: "#010102", roughness: 0.2 }} round={0} />
      ) : null}
      <Box s={[w * 0.4, Math.max(0.1, t * 0.15), Math.min(15, l * 0.1)]} p={[0, -t * 0.1, l / 2 + Math.min(7, l * 0.05) - 2]} m={{ color: "#d48a1f", roughness: 0.4 }} />
    </group>
  );
}

export function OledModule() {
  const tex = screenTexture("oled");
  return (
    <group>
      <Board w={27} l={27} t={1.2} preset="pcb_blue" holes={[[-11.5, -11.5], [11.5, -11.5], [11.5, 11.5], [-11.5, 11.5]]} holeR={1} radius={1} />
      <Box s={[26, 1.4, 19]} p={[0, 1.2 + 0.7, 1.5]} m="screen" />
      <GlowPlane w={22} l={11} y={2.62} tex={tex} intensity={1.2} />
      <Header n={4} p={[0, 1.2, -11.5]} />
      <Label text="GND VCC SCL SDA" w={10} l={1.4} p={[0, 1.21, -9.2]} bg="#1b5aa8" fg="#e6e9ef" res={256} />
    </group>
  );
}

export function Led({ p }: { p: Params }) {
  const color = str(p, "color", "#ff3b30");
  const d = clamp(num(p, "diameter", 5), 1, 50);
  const r = d / 2;
  const H = d * 1.72;
  return (
    <group>
      <InstBoxes size={[0.5, 1.2, 0.5]} m="steel" at={[[-r * 0.5, 0.6, 0], [r * 0.5, 0.6, 0]]} />
      <Lathe profile={[[0, 1], [r * 1.16, 1], [r * 1.16, 2], [r, 2], [r, H - r], ...Array.from({ length: 8 }, (_, i) => { const a = ((i + 1) / 8) * (Math.PI / 2); return [Math.cos(a) * r, H - r + Math.sin(a) * r] as Vec2; })]} m={{ color, emissive: color, emissiveIntensity: 1.6, opacity: 0.88, roughness: 0.15, clearcoat: 1 }} seg={32} />
    </group>
  );
}

export function Button({ p }: { p: Params }) {
  const s = clamp(num(p, "size", 12), 2, 100);
  const k = s / 12;
  return (
    <group>
      <InstBoxes size={[0.7 * k, 2 * k, 0.4 * k]} m="steel" at={[[-s * 0.42, 1 * k, -s * 0.3], [s * 0.42, 1 * k, -s * 0.3], [-s * 0.42, 1 * k, s * 0.3], [s * 0.42, 1 * k, s * 0.3]]} />
      <Box s={[s, 3.4 * k, s]} p={[0, 2 * k + 1.7 * k, 0]} m={{ color: "#141416", roughness: 0.6 }} round={0.3 * k} />
      <Box s={[s * 1.01, 0.3 * k, s * 1.01]} p={[0, 5.55 * k, 0]} m="steel" />
      <Cyl rad={s * 0.28} h={2.3 * k} p={[0, 5.7 * k + 1.15 * k, 0]} m={{ color: "#c0392b", roughness: 0.5 }} rTop={s * 0.27} seg={32} />
    </group>
  );
}

export function SwitchToggle() {
  return (
    <group>
      <InstBoxes size={[0.6, 4, 2]} m="brass" at={[[-4.7, 2, 0], [0, 2, 0], [4.7, 2, 0]]} />
      <Box s={[13, 8, 8]} p={[0, 8, 0]} m={{ color: "#1a3b8c", roughness: 0.5 }} round={0.4} />
      <Cyl rad={3} h={3} p={[0, 13.5, 0]} m={{ color: "#c7cbd0", metalness: 1, roughness: 0.3 }} seg={28} />
      <Mesh g={hexPrism(8, 1.6)} p={[0, 12.8, 0]} m="stainless" />
      <Cyl rad={1.1} h={7} p={[1.4, 17.5, 0]} r={[0, 0, -0.35]} m="stainless" rTop={0.9} seg={16} />
    </group>
  );
}

export function Breadboard({ p }: { p: Params }) {
  const half = str(p, "size", "full").toLowerCase().startsWith("h");
  const W = half ? 82 : 165;
  const L = 55;
  const H = 9;
  const cols = half ? 30 : 63;
  const holes = useMemo(() => {
    const out: V3[] = [];
    const x0 = -((cols - 1) * 2.54) / 2;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 5; r++) {
        out.push([x0 + c * 2.54, H + 0.01, 2.54 * 1.5 + r * 2.54], [x0 + c * 2.54, H + 0.01, -(2.54 * 1.5 + r * 2.54)]);
      }
    }
    const railCols = Math.floor(cols * 0.8);
    for (let c = 0; c < railCols; c++) {
      const x = x0 + 2 * 2.54 + c * 2.54 + Math.floor(c / 5) * 2.54 * 0.2;
      if (x > -x0) break;
      for (const z of [L / 2 - 4, L / 2 - 6.54, -(L / 2 - 4), -(L / 2 - 6.54)]) out.push([x, H + 0.01, z]);
    }
    return out;
  }, [cols]);
  return (
    <group>
      <Box s={[W, H, L]} p={[0, H / 2, 0]} m={{ color: "#f2f1ec", roughness: 0.65 }} round={0.8} />
      <Box s={[W - 4, 0.6, 2.6]} p={[0, H - 0.28, 0]} m={{ color: "#c9c7bf", roughness: 0.8 }} />
      <InstBoxes size={[1, 0.02, 1]} m={{ color: "#2a2b2e", roughness: 1 }} at={holes} />
      {[1, -1].map((s) => (
        <group key={s}>
          <Box s={[W - 8, 0.03, 0.5]} p={[0, H + 0.02, s * (L / 2 - 2.2)]} m={{ color: s > 0 ? "#d63031" : "#1e5bd6" }} />
          <Box s={[W - 8, 0.03, 0.5]} p={[0, H + 0.02, s * (L / 2 - 8.4)]} m={{ color: s > 0 ? "#1e5bd6" : "#d63031" }} />
        </group>
      ))}
      <Label text="a b c d e" w={1.2} l={12} p={[-W / 2 + 2, H + 0.02, 7]} bg="#f2f1ec" fg="#8a8f99" res={32} />
    </group>
  );
}

export function Antenna({ p }: { p: Params }) {
  const L = clamp(num(p, "length", 50), 5, 2000);
  const v = str(p, "variant", "whip").toLowerCase();
  if (v === "fpc") {
    return (
      <group>
        <Box s={[L * 0.8, 0.15, L * 0.2]} p={[0, 0.075, 0]} m={{ color: "#1b1c20", roughness: 0.4 }} round={0} />
        <Box s={[L * 0.6, 0.02, L * 0.08]} p={[L * 0.05, 0.16, 0]} m={{ color: "#c8a03a", metalness: 0.9, roughness: 0.35 }} />
        <Wire pts={[[-L * 0.4, 0.4, 0], [-L * 0.6, 0.8, L * 0.1], [-L * 0.9, 0.8, L * 0.2]]} rad={0.6} m={{ color: "#16171a" }} />
        <Cyl rad={1} h={1.2} p={[-L * 0.9, 0.8, L * 0.2]} m="gold" seg={12} />
      </group>
    );
  }
  const base = (
    <group>
      <Mesh g={hexPrism(8, 3)} p={[0, 1.5, 0]} m="gold" />
      <Cyl rad={3.2} h={4} p={[0, 5, 0]} m="gold" seg={24} />
    </group>
  );
  if (v === "lollipop") {
    const stalk = Math.max(5, L * 0.55);
    return (
      <group>
        {base}
        <Cyl rad={2.3} h={stalk} p={[0, 7 + stalk / 2, 0]} m={{ color: "#16171a", roughness: 0.6 }} seg={20} />
        <Lathe profile={[[0, 0], [4, 1.5], [5.5, 6], [4.5, 11], [0, 13]]} p={[0, 7 + stalk, 0]} m={{ color: "#c0392b", roughness: 0.45, opacity: 0.95 }} seg={32} />
      </group>
    );
  }
  return (
    <group>
      {base}
      <Cyl rad={3.6} h={6} p={[0, 10, 0]} m={{ color: "#16171a", roughness: 0.6 }} seg={24} />
      <Cyl rad={3.2} h={Math.max(4, L - 13)} p={[0, 13 + Math.max(4, L - 13) / 2, 0]} m={{ color: "#16171a", roughness: 0.6 }} rTop={2} seg={24} />
    </group>
  );
}

export function RfModule({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 20), 3, 200);
  const l = clamp(num(p, "length", 25), 3, 200);
  const label = str(p, "label", "RX");
  const can: V3 = [w * 0.75, Math.min(2.4, Math.max(1, w * 0.1)), l * 0.55];
  return (
    <group>
      <Board w={w} l={l} t={1} preset="pcb_black" holeR={0} radius={0.6} />
      <Box s={can} p={[0, 1 + can[1] / 2, -l * 0.1]} m={{ color: "#c4c8cc", metalness: 1, roughness: 0.3 }} round={0.2} />
      <Label text={label} w={can[0] * 0.8} l={can[2] * 0.5} p={[0, 1 + can[1] + 0.01, -l * 0.1]} bg="#c4c8cc" fg="#22252b" res={128} />
      <Cyl rad={Math.min(1.3, w * 0.07)} h={1.2} p={[w * 0.28, 1.6, l * 0.36]} m="gold" seg={16} />
      <Box s={[w * 0.35, 1, l * 0.12]} p={[-w * 0.15, 1.5, l * 0.36]} m={{ color: "#ece8dc", roughness: 0.5 }} />
      <InstBoxes size={[1.2, 0.05, 1.2]} m="gold" at={Array.from({ length: 4 }, (_, i) => [-w / 2 + 1.2 + i * 2.2, 1.02, l / 2 - 1.2] as V3)} />
      <InstBoxes size={[1, 0.4, 0.6]} m={{ color: "#f0f0e8", emissive: "#34d399", emissiveIntensity: 0.9 }} at={[[w * 0.3, 1.2, -l * 0.42]]} />
    </group>
  );
}

export function Speaker({ p }: { p: Params }) {
  const d = clamp(num(p, "diameter", 28), 3, 1000);
  const h = clamp(num(p, "height", 5), 1, 500);
  const v = str(p, "variant", "round").toLowerCase();
  const r = d / 2;
  const grille = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) out.push([(i - 2.5) * (d * 0.1), h + 0.01, (j - 1) * (d * 0.12)]);
    return out;
  }, [d, h]);
  if (v === "box") {
    return (
      <group>
        <Box s={[d * 0.7, h, d * 0.45]} p={[0, h / 2, 0]} m={{ color: "#1a1b1e", roughness: 0.55 }} round={Math.min(1, h * 0.2)} />
        <InstBoxes size={[d * 0.06, 0.02, d * 0.06]} m={{ color: "#050506" }} at={grille} />
        <InstBoxes size={[1.5, 0.06, 2]} m="gold" at={[[-d * 0.2, -0.02, d * 0.12], [d * 0.2, -0.02, d * 0.12]]} />
      </group>
    );
  }
  return (
    <group>
      <Cyl rad={r * 0.38} h={h * 0.45} p={[0, h * 0.225, 0]} m="steel" seg={32} />
      <Lathe profile={[[r * 0.34, h * 0.4], [r * 0.85, h * 0.85], [r, h * 0.85], [r, h], [r * 0.85, h], [r * 0.36, h * 0.48]]} m={{ color: "#2a2b2f", metalness: 0.5, roughness: 0.4 }} seg={48} />
      <Lathe profile={[[r * 0.3, h * 0.5], [r * 0.84, h * 0.94], [r * 0.82, h * 0.96], [r * 0.3, h * 0.55]]} m={{ color: "#141416", roughness: 0.9 }} seg={48} />
      <Lathe profile={[[0, h * 0.62], [r * 0.3, h * 0.55], [r * 0.15, h * 0.72], [0, h * 0.75]]} m={{ color: "#18191b", roughness: 0.4 }} seg={32} />
      <InstBoxes size={[2, 0.4, 3]} m="brass" at={[[-r * 0.95, h * 0.85, 0], [r * 0.95, h * 0.85, 0]]} />
    </group>
  );
}

/** Socket head cap screw — under-head face at y=0, head +Y, thread to y=-length. */
export function Screw({ p }: { p: Params }) {
  const D = clamp(num(p, "diameter", 3), 0.5, 48);
  const L = clamp(num(p, "length", 8), 0.5, 500);
  const head = useMemo(() => {
    const hr = D * 0.85;
    const hh = D;
    const base = memoGeometry(`shcs-head:${D}`, () => new THREE.LatheGeometry(
      [new THREE.Vector2(0, 0), new THREE.Vector2(hr * 0.96, 0), new THREE.Vector2(hr, hh * 0.06), new THREE.Vector2(hr, hh * 0.9), new THREE.Vector2(hr * 0.9, hh), new THREE.Vector2(0, hh)],
      32,
    ));
    const socket = applyCuts(base, [{ geometry: { type: "cylinder", radius: (D * 0.8) / 2 / Math.cos(Math.PI / 6), height: hh, segments: 6 }, position: [0, hh, 0] }], `shcs-socket:${D}`);
    return socket;
  }, [D]);
  const thread = useMemo(() => threadGeometry(D, L), [D, L]);
  const m = { color: "#2b2d31", metalness: 0.85, roughness: 0.38 };
  return (
    <group>
      <Mesh g={head} m={m} />
      <Mesh g={thread} m={m} />
    </group>
  );
}

export function Standoff({ p }: { p: Params }) {
  const af = clamp(num(p, "diameter", 5), 1, 50);
  const L = clamp(num(p, "length", 20), 0.5, 500);
  const color = str(p, "color", "#8e44ad");
  return (
    <group>
      <Mesh g={hexPrism(af, L)} p={[0, L / 2, 0]} m={{ color, metalness: 0.8, roughness: 0.32 }} />
      <InstCyl rad={af * 0.3} h={0.05} at={[[0, -0.02, 0], [0, L + 0.02, 0]]} m={{ color: "#0a0a0c" }} seg={16} />
    </group>
  );
}

export function Heatsink({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 20), 2, 1000);
  const l = clamp(num(p, "length", 20), 2, 1000);
  const h = clamp(num(p, "height", 10), 1, 500);
  const base = Math.max(0.8, h * 0.18);
  const fins = useMemo(() => {
    const n = Math.max(3, Math.round(w / 2.4));
    const pitch = w / n;
    return Array.from({ length: n }, (_, i) => [-w / 2 + pitch * (i + 0.5), base + (h - base) / 2, 0] as V3);
  }, [w, h, base]);
  return (
    <group>
      <Box s={[w, base, l]} p={[0, base / 2, 0]} m="anodized_black" />
      <InstBoxes size={[Math.max(0.4, (w / Math.max(3, Math.round(w / 2.4))) * 0.42), h - base, l]} m="anodized_black" at={fins} />
    </group>
  );
}

export function SolarPanel({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 110), 5, 5000);
  const l = clamp(num(p, "length", 60), 5, 5000);
  const tex = canvasTexture(`solar:${Math.round(w / 20)}x${Math.round(l / 20)}`, 512, Math.max(64, Math.round((512 * l) / w)), (ctx, cw, ch) => {
    ctx.fillStyle = "#c8ccd2";
    ctx.fillRect(0, 0, cw, ch);
    const nx = Math.max(1, Math.round(w / 20));
    const nz = Math.max(1, Math.round(l / 20));
    const gx = cw / nx;
    const gz = ch / nz;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const g = ctx.createLinearGradient(i * gx, j * gz, (i + 1) * gx, (j + 1) * gz);
        g.addColorStop(0, "#14244f");
        g.addColorStop(1, "#1d3672");
        ctx.fillStyle = g;
        ctx.fillRect(i * gx + 2, j * gz + 2, gx - 4, gz - 4);
        ctx.fillStyle = "rgba(220,225,235,0.55)";
        ctx.fillRect(i * gx + gx * 0.33, j * gz + 2, 1.5, gz - 4);
        ctx.fillRect(i * gx + gx * 0.66, j * gz + 2, 1.5, gz - 4);
      }
    }
  });
  const mat = useMat()({ color: "#ffffff", map: tex, roughness: 0.2, metalness: 0.2, clearcoat: 1 });
  const g = memoGeometry("unit-plane", () => new THREE.PlaneGeometry(1, 1));
  return (
    <group>
      <Box s={[w, 2.6, l]} p={[0, 1.3, 0]} m="aluminum" round={0.4} />
      <mesh geometry={g} material={mat} position={[0, 2.62, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w - 3, l - 3, 1]} />
      <Box s={[Math.min(20, w * 0.2), 4, Math.min(14, l * 0.2)]} p={[0, -2, 0]} m={{ color: "#141416" }} />
    </group>
  );
}

/** Fallback for unknown models: neutral labelled box. */
export function UnknownModel({ model, size }: { model: string; size: [number, number, number] }) {
  const [x, y, z] = size;
  return (
    <group>
      <Box s={[x, y, z]} p={[0, y / 2, 0]} m={{ color: "#8a909c", roughness: 0.6 }} round={Math.min(x, y, z) * 0.08} />
      <Label text={model} w={x * 0.9} l={Math.min(z * 0.5, x * 0.3)} p={[0, y + 0.02, 0]} bg="#8a909c" fg="#111317" res={256} />
    </group>
  );
}

