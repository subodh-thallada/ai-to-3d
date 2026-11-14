/** Motion components: motors, servos, propellers, wheels, fans. Origin = centre of bottom face unless noted. */
import { useMemo } from "react";
import type { Vec2 } from "@protoforge/shared";
import { Box, Cyl, Inst, InstBoxes, InstCyl, Label, Lathe, Mesh, Plate, Wire, circleProfile, clamp, num, roundedProfile, str, type Params, type V3 } from "./kit";
import { bladesGeometry } from "./shapes";
import { getGeometry } from "../geometry";

export function BldcMotor({ p }: { p: Params }) {
  const D = clamp(num(p, "diameter", 28), 5, 400);
  const H = clamp(num(p, "height", 20), 3, 300);
  const sl = clamp(num(p, "shaftLength", 12), 0, 200);
  const sd = clamp(num(p, "shaftDiameter", 5), 0.5, D * 0.5);
  const accent = str(p, "color", "#c0392b");
  const R = D / 2;
  const baseH = H * 0.14;
  const baseR = R * 0.86;
  const bellY0 = H * 0.3;
  const capT = Math.max(0.8, H * 0.08);
  const baseHoles = useMemo<Vec2[][]>(() => {
    const hr = Math.max(0.6, D * 0.055);
    const pr = R * 0.58;
    return [
      ...[0, 1, 2, 3].map((i) => circleProfile(Math.cos((i * Math.PI) / 2 + Math.PI / 4) * pr, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * pr, hr, 14)),
      circleProfile(0, 0, Math.max(sd * 0.7, R * 0.18), 20),
    ];
  }, [D, R, sd]);
  const capHoles = useMemo<Vec2[][]>(() => {
    const out: Vec2[][] = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.12;
      const a1 = a0 + (Math.PI * 2) / n - 0.4;
      const pts: Vec2[] = [];
      const r0 = R * 0.34;
      const r1 = R * 0.78;
      for (let k = 0; k <= 6; k++) {
        const a = a0 + ((a1 - a0) * k) / 6;
        pts.push([Math.cos(a) * r1, Math.sin(a) * r1]);
      }
      for (let k = 6; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / 6;
        pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
      }
      out.push(pts);
    }
    return out;
  }, [R]);
  const teeth = useMemo(() => {
    const n = 12;
    const out: { p: V3; r: V3; s: V3 }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ p: [Math.cos(a) * R * 0.6, baseH + (H * 0.62 - baseH) / 2 + 0.3, Math.sin(a) * R * 0.6], r: [0, -a, 0], s: [R * 0.32, H * 0.5, R * 0.22] });
    }
    return out;
  }, [R, H, baseH]);
  const wireBase: V3 = [R * 0.7, baseH * 0.5, 0];
  return (
    <group>
      <Plate profile={circleProfile(0, 0, baseR, 40)} holes={baseHoles} t={baseH} m="anodized_black" />
      {/* base cross arms */}
      <Box s={[R * 1.95, baseH * 0.7, R * 0.42]} p={[0, baseH * 0.35, 0]} r={[0, Math.PI / 4, 0]} m="anodized_black" round={0.3} />
      {/* stator core + copper windings */}
      <Cyl rad={R * 0.4} h={H * 0.5} p={[0, baseH + H * 0.25, 0]} m={{ color: "#3b3e44", metalness: 0.8, roughness: 0.4 }} />
      <Inst g={getGeometry({ type: "box", size: [1, 1, 1], radius: 0.2 })} m="copper" items={teeth} />
      {/* bell: thin-walled shell with coloured band */}
      <Lathe
        profile={[[R * 0.9, bellY0], [R, bellY0 + 0.4], [R, H - capT], [R * 0.9, H - capT], [R * 0.9, bellY0]]}
        m={{ color: "#2c2f35", metalness: 0.85, roughness: 0.3 }}
        seg={56}
      />
      <Lathe profile={[[R * 1.004, bellY0 + (H - bellY0) * 0.25], [R * 1.004, bellY0 + (H - bellY0) * 0.7]]} m={{ color: accent, metalness: 0.75, roughness: 0.3 }} seg={56} />
      <Plate profile={circleProfile(0, 0, R, 48)} holes={capHoles} t={capT} p={[0, H - capT, 0]} m={{ color: accent, metalness: 0.8, roughness: 0.28 }} bevel={Math.min(0.4, capT * 0.3)} />
      <Cyl rad={R * 0.3} h={capT * 1.2} p={[0, H - capT * 0.4, 0]} m={{ color: "#1a1b1f", metalness: 0.8, roughness: 0.3 }} />
      {/* shaft */}
      <Cyl rad={sd / 2} h={sl + capT + 1} p={[0, H + (sl - capT - 1) / 2, 0]} m="stainless" seg={20} />
      <Cyl rad={sd * 0.45} h={0.6} p={[0, H + sl - 0.3, 0]} m="steel" rTop={sd * 0.3} seg={20} />
      {/* phase wires */}
      {["#1b1b1b", "#1b1b1b", "#1b1b1b"].map((c, i) => {
        const dz = (i - 1) * Math.max(0.9, D * 0.045);
        const r = Math.max(0.35, D * 0.022);
        return <Wire key={i} pts={[[wireBase[0], wireBase[1], dz], [R * 1.2, baseH * 0.5, dz], [R * 1.8, baseH * 0.3, dz * 1.6], [R * 2.4, baseH * 0.2, dz * 2.2]]} rad={r} m={{ color: c, roughness: 0.6 }} />;
      })}
      {[0, 1, 2].map((i) => (
        <Cyl key={i} rad={Math.max(0.25, D * 0.014)} h={R * 0.25} p={[R * 2.5, baseH * 0.2, (i - 1) * Math.max(0.9, D * 0.045) * 2.2]} r={[0, 0, Math.PI / 2]} m="copper" seg={8} />
      ))}
    </group>
  );
}

export function DcMotor({ p }: { p: Params }) {
  const D = clamp(num(p, "diameter", 24), 4, 200);
  const L = clamp(num(p, "length", 30), 4, 400);
  const sl = clamp(num(p, "shaftLength", 8), 0, 200);
  const gear = num(p, "gearbox", 0) >= 1;
  const R = D / 2;
  const capH = Math.max(1, L * 0.1);
  const gbH = gear ? Math.max(6, D * 0.75) : 0;
  const top = L + gbH;
  return (
    <group>
      <Cyl rad={R * 0.97} h={capH} p={[0, capH / 2, 0]} m={{ color: "#1d1e21", roughness: 0.6 }} />
      <Lathe profile={[[0, capH], [R, capH], [R, L - 0.8], [R * 0.9, L], [0, L]]} m="steel" seg={48} />
      <Lathe profile={[[0.01, L], [R * 0.32, L], [R * 0.3, L + 1.2], [0.01, L + 1.2]]} m="brass" seg={24} />
      {[-1, 1].map((s) => (
        <Box key={s} s={[Math.max(0.8, D * 0.06), Math.max(1.5, capH * 1.6), Math.max(1.6, D * 0.14)]} p={[s * R * 0.55, capH * 0.6, 0]} m="brass" />
      ))}
      <Label text="+" w={D * 0.18} l={D * 0.18} p={[R * 0.55, 0.002, R * 0.4]} bg="#1d1e21" fg="#e74c3c" res={32} />
      {gear ? (
        <group>
          <Box s={[D * 0.95, gbH, D * 0.8]} p={[0, L + gbH / 2 + 1.2, 0]} m="brass" round={0.4} />
          {[-1, 1].map((s) => (
            <Box key={s} s={[D * 0.96, gbH * 0.12, D * 0.82]} p={[0, L + 1.2 + gbH * (s > 0 ? 0.88 : 0.12), 0]} m="steel" />
          ))}
        </group>
      ) : null}
      <Cyl rad={Math.max(0.6, D * 0.08)} h={sl + 2} p={[0, top + 1.2 + sl / 2 - 1, 0]} m="stainless" seg={16} />
    </group>
  );
}

export function Servo({ p }: { p: Params }) {
  const std = str(p, "size", "micro").toLowerCase().startsWith("s");
  const horn = (num(p, "hornAngle", 0) * Math.PI) / 180;
  const d = std
    ? { L: 40.7, W: 19.7, H: 37, tabL: 54, tabY: 27.5, tabT: 2.6, bossR: 7, spline: 2.9, hornL: 32, col: "#16181c" }
    : { L: 23, W: 12.2, H: 22.7, tabL: 32.2, tabY: 15.9, tabT: 2.4, bossR: 5.9, spline: 2.4, hornL: 19, col: "#1f4fbf" };
  const bossX = d.L / 2 - d.bossR;
  const bodyM = { color: d.col, roughness: 0.45, opacity: std ? 1 : 0.92 };
  const hornProfile = useMemo<Vec2[]>(() => {
    const pts: Vec2[] = [];
    const r0 = d.spline * 1.5;
    const r1 = d.spline * 0.75;
    const l = d.hornL / 2;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI;
      pts.push([-l + Math.cos(a) * r1, Math.sin(a) * r1]);
    }
    pts.push([0, -r0]);
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI;
      pts.push([l + Math.cos(a) * r1, Math.sin(a) * r1]);
    }
    pts.push([0, r0]);
    return pts;
  }, [d.spline, d.hornL]);
  const hornHoles = useMemo(() => {
    const out: V3[] = [];
    for (let i = 1; i <= 5; i++) {
      const x = (d.hornL / 2) * (i / 5.6);
      out.push([x, 0, 0], [-x, 0, 0]);
    }
    return out;
  }, [d.hornL]);
  const hy = d.H + 3.6;
  return (
    <group>
      <Box s={[d.L, d.H, d.W]} p={[0, d.H / 2, 0]} m={bodyM} round={0.6} />
      <Box s={[d.tabL, d.tabT, d.W]} p={[0, d.tabY, 0]} m={bodyM} round={0.4} />
      {[-1, 1].map((s) => (
        <Cyl key={s} rad={1} h={d.tabT + 0.1} p={[s * (d.tabL / 2 - 2.2), d.tabY, 0]} m={{ color: "#05060a" }} seg={14} />
      ))}
      <Cyl rad={d.bossR} h={2.2} p={[bossX, d.H + 1.1, 0]} m={bodyM} seg={40} />
      <Cyl rad={d.bossR * 0.55} h={1.4} p={[bossX - d.bossR * 0.9, d.H + 0.7, 0]} m={bodyM} seg={24} />
      <Cyl rad={d.spline} h={1.6} p={[bossX, d.H + 2.9, 0]} m={{ color: "#e9e7e0", roughness: 0.5 }} seg={18} />
      <group position={[bossX, hy, 0]} rotation={[0, horn, 0]}>
        <Plate profile={hornProfile} t={1.4} m={{ color: "#f1efe8", roughness: 0.55 }} />
        <InstCyl rad={0.45} h={1.5} at={hornHoles.map(([x, , z]) => [x, 0.7, z] as V3)} m={{ color: "#5b5e66" }} seg={10} />
        <Cyl rad={d.spline * 0.9} h={1.2} p={[0, 1.8, 0]} m="steel" seg={18} />
      </group>
      <Label text={std ? "MG996R" : "SG90"} w={d.L * 0.5} l={d.W * 0.6} p={[-d.L * 0.12, d.H + 0.01, 0]} bg={d.col} fg="#e6e9ef" res={128} />
      {["#6b3e1e", "#c0392b", "#f39c12"].map((c, i) => (
        <Wire key={c} pts={[[-d.L / 2 + 0.5, d.H * 0.2, (i - 1) * 1.1], [-d.L / 2 - 6, d.H * 0.12, (i - 1) * 1.1], [-d.L / 2 - 16, 0.6, (i - 1) * 1.1 + 4]]} rad={0.45} m={{ color: c, roughness: 0.6 }} />
      ))}
    </group>
  );
}

export function StepperNema17({ p }: { p: Params }) {
  const L = clamp(num(p, "length", 40), 10, 200);
  const sl = clamp(num(p, "shaftLength", 24), 0, 200);
  const S = 42.3;
  const ch = 4.5;
  const outline = useMemo<Vec2[]>(() => {
    const h = S / 2;
    return [[-h + ch, -h], [h - ch, -h], [h, -h + ch], [h, h - ch], [h - ch, h], [-h + ch, h], [-h, h - ch], [-h, -h + ch]];
  }, []);
  const cap = Math.min(9, L * 0.22);
  const holes = useMemo<V3[]>(() => [[-15.5, L + 0.02, -15.5], [15.5, L + 0.02, -15.5], [15.5, L + 0.02, 15.5], [-15.5, L + 0.02, 15.5]], [L]);
  return (
    <group>
      <Plate profile={outline} t={cap} m={{ color: "#2b2d31", metalness: 0.7, roughness: 0.45 }} bevel={0.4} />
      <Plate profile={outline} t={L - 2 * cap} p={[0, cap, 0]} m={{ color: "#141518", metalness: 0.5, roughness: 0.6 }} />
      {[0.33, 0.66].map((f) => (
        <Plate key={f} profile={outline} t={0.25} p={[0, cap + (L - 2 * cap) * f, 0]} m={{ color: "#3a3d42", metalness: 0.7, roughness: 0.5 }} />
      ))}
      <Plate profile={outline} t={cap} p={[0, L - cap, 0]} m={{ color: "#2b2d31", metalness: 0.7, roughness: 0.45 }} bevel={0.4} />
      <InstCyl rad={1.5} h={0.05} at={holes} m={{ color: "#050507" }} seg={16} />
      <Cyl rad={11} h={2} p={[0, L + 1, 0]} m="aluminum" seg={48} />
      <Cyl rad={2.5} h={sl} p={[0, L + 2 + sl / 2, 0]} m="stainless" seg={24} />
      <Box s={[0.6, sl * 0.8, 4.4]} p={[2.25, L + 2 + sl * 0.55, 0]} m="steel" />
      <Box s={[16, 7, 6]} p={[0, L * 0.35, -S / 2 - 2.5]} m={{ color: "#ece8dc", roughness: 0.6 }} round={0.3} />
      <Label text="17HS4401" w={20} l={6} p={[0, 0.001, 0]} rotY={Math.PI} bg="#2b2d31" fg="#c9ccd1" res={128} />
    </group>
  );
}

export function Propeller({ p }: { p: Params }) {
  const D = clamp(num(p, "diameter", 127), 10, 3000);
  const n = Math.round(clamp(num(p, "blades", 3), 2, 8));
  const hh = clamp(num(p, "hubHeight", 6), 1, 200);
  const color = str(p, "color", "#1e90ff");
  const R = D / 2;
  const hubR = Math.max(3, Math.min(R * 0.14, 9 + D * 0.01));
  const blades = useMemo(
    () => bladesGeometry({ n, rootR: hubR * 0.7, tipR: R, chord: Math.min(R * 0.36, 9 + D * 0.11), thickness: Math.max(1, hh * 0.25), pitchRoot: 32, pitchTip: 11, y: hh * 0.55, tipTaper: 0.35, sweep: 0.35 }),
    [n, hubR, R, D, hh],
  );
  return (
    <group>
      <Cyl rad={hubR} h={hh} p={[0, hh / 2, 0]} m={{ color, roughness: 0.35, opacity: 0.96, clearcoat: 0.4 }} seg={32} />
      <Cyl rad={hubR * 0.42} h={hh + 0.05} p={[0, hh / 2, 0]} m={{ color: "#0d0e10" }} seg={24} />
      <Mesh g={blades} m={{ color, roughness: 0.32, metalness: 0, opacity: 0.94, clearcoat: 0.5, doubleSide: true }} />
    </group>
  );
}

export function Wheel({ p }: { p: Params }) {
  const D = clamp(num(p, "diameter", 65), 10, 3000);
  const W = clamp(num(p, "width", 26), 2, 1000);
  const R = D / 2;
  const rIn = R * 0.66;
  const tyre = useMemo<Vec2[]>(() => {
    const pts: Vec2[] = [];
    const hw = W / 2;
    const cr = Math.min(W * 0.22, (R - rIn) * 0.45);
    pts.push([rIn, -hw * 0.92]);
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
      pts.push([R - cr + Math.cos(a) * cr, -hw + cr + Math.sin(a) * cr]);
    }
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push([R - cr + Math.cos(a) * cr, hw - cr + Math.sin(a) * cr]);
    }
    pts.push([rIn, hw * 0.92]);
    return pts;
  }, [R, rIn, W]);
  const lugs = useMemo(() => {
    const n = Math.max(12, Math.round((Math.PI * D) / 6));
    const out: { p: V3; r: V3; s: V3 }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const off = (i % 2 ? 1 : -1) * W * 0.18;
      out.push({ p: [Math.cos(a) * (R + 0.2), off, Math.sin(a) * (R + 0.2)], r: [0, -a, 0], s: [Math.max(0.8, D * 0.02), W * 0.5, Math.max(1.2, D * 0.035)] });
    }
    return out;
  }, [D, R, W]);
  const spokes = useMemo(() => {
    const out: { p: V3; r: V3; s: V3 }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      out.push({ p: [Math.cos(a) * rIn * 0.55, 0, Math.sin(a) * rIn * 0.55], r: [0, -a, 0], s: [rIn * 0.9, W * 0.5, Math.max(1.5, rIn * 0.14)] });
    }
    return out;
  }, [rIn, W]);
  // Built around Y, then rotated so the axle lies along X (origin = wheel centre).
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <Lathe profile={tyre} m="rubber" seg={64} />
      <Inst g={getGeometry({ type: "box", size: [1, 1, 1], radius: 0.15 })} m="rubber" items={lugs} />
      <Lathe profile={[[rIn * 0.98, -W * 0.46], [rIn * 0.98, W * 0.46], [rIn * 0.86, W * 0.46], [rIn * 0.86, -W * 0.46]]} m={{ color: "#e5e3dc", roughness: 0.55 }} seg={48} />
      <Inst g={getGeometry({ type: "box", size: [1, 1, 1] })} m={{ color: "#e5e3dc", roughness: 0.55 }} items={spokes} />
      <Cyl rad={rIn * 0.24} h={W * 0.7} m={{ color: "#e5e3dc", roughness: 0.55 }} seg={32} />
      <Cyl rad={Math.max(1, rIn * 0.08)} h={W * 0.72} m={{ color: "#1a1a1a" }} seg={16} />
    </group>
  );
}

export function VibrationMotor({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 10), 2, 200);
  const l = clamp(num(p, "length", 30), 2, 200);
  const h = clamp(num(p, "height", 4), 0.5, 100);
  return (
    <group>
      <Box s={[w, h, l]} p={[0, h / 2, 0]} m="stainless" round={Math.min(1, h * 0.3)} />
      <Box s={[w * 0.8, 0.05, l * 0.6]} p={[0, h + 0.03, 0]} m={{ color: "#d9c27a", roughness: 0.5, opacity: 0.85 }} />
      <Label text="LRA" w={w * 0.6} l={Math.min(l * 0.3, w * 0.5)} p={[0, h + 0.07, -l * 0.15]} bg="#c4c8cc" fg="#22252b" res={64} />
      <Box s={[w * 0.5, 0.12, l * 0.35]} p={[0, h * 0.4, l / 2 + l * 0.17]} m={{ color: "#d48a1f", roughness: 0.45 }} />
      <Box s={[w * 0.55, 0.6, 2]} p={[0, h * 0.4, l / 2 + l * 0.35]} m={{ color: "#1a1a1a" }} />
    </group>
  );
}

export function Fan({ p }: { p: Params }) {
  const S = clamp(num(p, "size", 40), 10, 400);
  const T = clamp(num(p, "thickness", 10), 2, 100);
  const frameHoles = useMemo<Vec2[][]>(() => {
    const k = S * 0.4;
    const hr = Math.max(0.8, S * 0.04);
    return [circleProfile(0, 0, S * 0.47, 48), circleProfile(-k, -k, hr), circleProfile(k, -k, hr), circleProfile(k, k, hr), circleProfile(-k, k, hr)];
  }, [S]);
  const blades = useMemo(() => bladesGeometry({ n: 7, rootR: S * 0.16, tipR: S * 0.455, chord: S * 0.24, thickness: Math.max(0.5, S * 0.012), pitchRoot: 40, pitchTip: 28, y: T * 0.5, tipTaper: -0.15, sweep: 0.4 }), [S, T]);
  const struts = useMemo(() => [0, 1, 2].map((i) => ({ p: [Math.cos((i * 2 * Math.PI) / 3) * S * 0.28, T * 0.06, Math.sin((i * 2 * Math.PI) / 3) * S * 0.28] as V3, r: [0, -(i * 2 * Math.PI) / 3, 0] as V3, s: [S * 0.3, T * 0.12, Math.max(1, S * 0.03)] as V3 })), [S, T]);
  return (
    <group>
      <Plate profile={roundedProfile(S, S, S * 0.06)} holes={frameHoles} t={T} m={{ color: "#18191c", roughness: 0.55 }} />
      <Cyl rad={S * 0.17} h={T * 0.86} p={[0, T * 0.5, 0]} m={{ color: "#1e1f23", roughness: 0.5 }} seg={40} />
      <Label text="12V" w={S * 0.24} l={S * 0.24} p={[0, T * 0.93 + 0.01, 0]} bg="#7a5a2b" fg="#f3efe4" res={64} />
      <Mesh g={blades} m={{ color: "#202125", roughness: 0.5, doubleSide: true }} />
      <Inst g={getGeometry({ type: "box", size: [1, 1, 1] })} m={{ color: "#18191c", roughness: 0.55 }} items={struts} />
      <Wire pts={[[S * 0.45, T * 0.1, S * 0.3], [S * 0.6, T * 0.1, S * 0.42], [S * 0.75, T * 0.1, S * 0.4]]} rad={Math.max(0.3, S * 0.01)} m={{ color: "#c0392b" }} />
    </group>
  );
}
