/**
 * Building blocks for the procedural component library. All sizes in mm, Y up.
 * Components read the current RenderMode from context so selection / dim / x-ray styling applies
 * to every sub-mesh without the models knowing about it.
 */
import * as THREE from "three";
import type {} from "@react-three/fiber"; // loads the R3F JSX intrinsic element types
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Vec2, Vec3 } from "@protoforge/shared";
import { getMaterial, labelTexture, type MatLike, type RenderMode } from "../materials";
import { getGeometry, memoGeometry } from "../geometry";

export type V3 = [number, number, number];
export type Params = Record<string, number | string>;

export const RenderModeContext = createContext<RenderMode>("normal");

/** Returns a resolver MatLike -> THREE.Material for the current render mode. */
export function useMat(): (m: MatLike) => THREE.Material {
  const mode = useContext(RenderModeContext);
  return (m: MatLike) => getMaterial(m, mode);
}

export const num = (p: Params, k: string, d: number): number => {
  const v = p[k];
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
export const str = (p: Params, k: string, d: string): string => {
  const v = p[k];
  return v === undefined || v === null || v === "" ? d : String(v);
};
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNIT_BOX = memoGeometry("unit-box", () => new THREE.BoxGeometry(1, 1, 1));

interface Placement {
  p?: V3;
  r?: V3;
}

/** Box. `round` adds an edge fillet (cached per size). */
export function Box({ s, p, r, m, round = 0 }: Placement & { s: V3; m: MatLike; round?: number }) {
  const mat = useMat()(m);
  const min = Math.min(s[0], s[1], s[2]);
  if (round > 0 && min > 0.2) {
    const rr = Math.min(round, min / 2 - 0.01);
    const g = memoGeometry(`rbox:${s.join(",")}:${rr}`, () => new RoundedBoxGeometry(s[0], s[1], s[2], 2, rr));
    return <mesh geometry={g} material={mat} position={p} rotation={r} />;
  }
  return <mesh geometry={UNIT_BOX} material={mat} position={p} rotation={r} scale={s} />;
}

/** Cylinder along local Y (centred), optional tapered top. */
export function Cyl({ rad, h, p, r, m, seg = 32, rTop }: Placement & { rad: number; h: number; m: MatLike; seg?: number; rTop?: number }) {
  const mat = useMat()(m);
  const g = getGeometry({ type: "cylinder", radius: Math.max(0.01, rad), height: Math.max(0.01, h), radiusTop: rTop, segments: seg });
  return <mesh geometry={g} material={mat} position={p} rotation={r} />;
}

/** Arbitrary geometry. */
export function Mesh({ g, p, r, s, m }: Placement & { g: THREE.BufferGeometry; m: MatLike; s?: V3 }) {
  const mat = useMat()(m);
  return <mesh geometry={g} material={mat} position={p} rotation={r} scale={s} />;
}

/** Extruded plan-view profile [x,z], bottom at y=0 (unlike the spec primitive which is centred). */
export function Plate({ profile, holes, t, p = [0, 0, 0], r, m, bevel }: Placement & { profile: Vec2[]; holes?: Vec2[][]; t: number; m: MatLike; bevel?: number }) {
  const g = getGeometry({ type: "extrude", profile, holes, depth: t, bevel });
  const mat = useMat()(m);
  return <mesh geometry={g} material={mat} position={[p[0], p[1] + t / 2, p[2]]} rotation={r} />;
}

/** Lathe profile [radius, y]. */
export function Lathe({ profile, p, r, m, seg = 48 }: Placement & { profile: Vec2[]; m: MatLike; seg?: number }) {
  const g = getGeometry({ type: "lathe", profile, segments: seg });
  const mat = useMat()(m);
  return <mesh geometry={g} material={mat} position={p} rotation={r} />;
}

/** Wire / cable along a smooth curve. */
export function Wire({ pts, rad, m }: { pts: Vec3[]; rad: number; m: MatLike }) {
  const g = getGeometry({ type: "tube", path: pts, radius: rad });
  const mat = useMat()(m);
  return <mesh geometry={g} material={mat} />;
}

export interface InstanceSpec {
  p: V3;
  r?: V3;
  s?: V3;
}

/** Many copies of one geometry in a single draw call. */
export function Inst({ g, m, items }: { g: THREE.BufferGeometry; m: MatLike; items: InstanceSpec[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMat()(m);
  const count = Math.max(1, items.length);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(it.p[0], it.p[1], it.p[2]);
      o.rotation.set(it.r?.[0] ?? 0, it.r?.[1] ?? 0, it.r?.[2] ?? 0);
      o.scale.set(it.s?.[0] ?? 1, it.s?.[1] ?? 1, it.s?.[2] ?? 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh key={count} ref={ref} args={[g, mat, count]} material={mat} frustumCulled={false} />;
}

/** Instanced boxes of a given size. */
export function InstBoxes({ size, m, at, r }: { size: V3; m: MatLike; at: V3[]; r?: V3 }) {
  const items = useMemo(() => at.map((p) => ({ p, r, s: size })), [at, size, r]);
  return <Inst g={UNIT_BOX} m={m} items={items} />;
}

/** Instanced cylinders (axis Y). */
export function InstCyl({ rad, h, m, at, seg = 12, r }: { rad: number; h: number; m: MatLike; at: V3[]; seg?: number; r?: V3 }) {
  const g = getGeometry({ type: "cylinder", radius: rad, height: h, segments: seg });
  const items = useMemo(() => at.map((p) => ({ p, r })), [at, r]);
  return <Inst g={g} m={m} items={items} />;
}

/** Flat text label lying on the XZ plane facing +Y (top face). */
export function Label({ text, lines, w, l, p, rotY = 0, bg = "#111317", fg = "#e6e9ef", res = 256 }: { text: string; lines?: string[]; w: number; l: number; p: V3; rotY?: number; bg?: string; fg?: string; res?: number }) {
  const aspect = w / Math.max(0.01, l);
  const tw = res;
  const th = Math.max(16, Math.round(res / aspect));
  const tex = labelTexture(text, { bg, fg, w: tw, h: th, lines });
  const mat = useMat()({ color: "#ffffff", map: tex, roughness: 0.6, metalness: 0 });
  const g = memoGeometry("unit-plane", () => new THREE.PlaneGeometry(1, 1));
  return <mesh geometry={g} material={mat} position={p} rotation={[-Math.PI / 2, 0, rotY]} scale={[w, l, 1]} />;
}

/** Row of header pins: black plastic strip + gold pins. Along X, centred at p, pins pointing up (+Y) or down. */
export function Header({ n, rows = 1, p, pitch = 2.54, up = true, female = false, axis = "x" }: { n: number; rows?: number; p: V3; pitch?: number; up?: boolean; female?: boolean; axis?: "x" | "z" }) {
  const count = Math.max(1, Math.round(n));
  const len = count * pitch;
  const wid = rows * pitch;
  const bodyH = female ? 8.5 : 2.5;
  const dir = up ? 1 : -1;
  const pins = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < rows; j++) {
        const a = -len / 2 + pitch * (i + 0.5);
        const b = -wid / 2 + pitch * (j + 0.5);
        const px = axis === "x" ? a : b;
        const pz = axis === "x" ? b : a;
        out.push(female ? [p[0] + px, p[1] + bodyH + 0.01, p[2] + pz] : [p[0] + px, p[1] + dir * (bodyH + 3), p[2] + pz]);
      }
    }
    return out;
  }, [count, rows, len, wid, pitch, axis, p[0], p[1], p[2], female, dir, bodyH]);
  const bodySize: V3 = axis === "x" ? [len, bodyH, wid] : [wid, bodyH, len];
  return (
    <group>
      <Box s={bodySize} p={[p[0], p[1] + (dir * bodyH) / 2, p[2]]} m={{ color: "#141416", roughness: 0.6 }} />
      {female ? (
        <InstBoxes size={[1, 0.05, 1]} m={{ color: "#020203", roughness: 1 }} at={pins} />
      ) : (
        <InstBoxes size={[0.64, 6, 0.64]} m="gold" at={pins} />
      )}
    </group>
  );
}

/** Simple SMD passive scatter (instanced), deterministic. */
export function Passives({ w, l, y, count, seed, avoid = [] }: { w: number; l: number; y: number; count: number; seed: number; avoid?: [number, number, number, number][] }) {
  const items = useMemo(() => {
    const rand = rng(seed * 7 + 3);
    const caps: InstanceSpec[] = [];
    const res: InstanceSpec[] = [];
    let guard = 0;
    while (caps.length + res.length < count && guard++ < count * 8) {
      const x = (rand() - 0.5) * w * 0.9;
      const z = (rand() - 0.5) * l * 0.9;
      if (avoid.some(([ax, az, aw, al]) => Math.abs(x - ax) < aw / 2 + 0.8 && Math.abs(z - az) < al / 2 + 0.8)) continue;
      const big = rand() > 0.7;
      const s: V3 = big ? [1.6, 0.8, 0.8] : [1, 0.5, 0.5];
      const rot: V3 = [0, rand() > 0.5 ? Math.PI / 2 : 0, 0];
      (rand() > 0.5 ? caps : res).push({ p: [x, y + s[1] / 2, z], r: rot, s });
    }
    return { caps, res };
  }, [w, l, y, count, seed, avoid]);
  return (
    <group>
      <Inst g={UNIT_BOX} m={{ color: "#a08463", roughness: 0.5 }} items={items.caps} />
      <Inst g={UNIT_BOX} m={{ color: "#18191b", roughness: 0.5 }} items={items.res} />
    </group>
  );
}

/** IC package with marking on top. Bottom at p.y. */
export function Chip({ w, l, h = 1, p, label, sub }: { w: number; l: number; h?: number; p: V3; label?: string; sub?: string }) {
  return (
    <group position={p}>
      <Box s={[w, h, l]} p={[0, h / 2, 0]} m={{ color: "#17181b", roughness: 0.55, metalness: 0.1 }} round={Math.min(0.25, h / 3)} />
      {label ? <Label text={label} lines={sub ? [label, sub] : undefined} w={w * 0.86} l={l * 0.86} p={[0, h + 0.012, 0]} bg="#17181b" fg="#9aa0aa" res={128} /> : null}
      <Cyl rad={Math.min(w, l) * 0.05} h={0.02} p={[-w * 0.36, h + 0.02, -l * 0.36]} m={{ color: "#3a3c40" }} seg={12} />
    </group>
  );
}

/** Board outline with 4 corner holes, bottom at y. */
export function Board({ w, l, t = 1.6, y = 0, color, preset, holeInset = 3.5, holeR = 1.6, radius = 1.5, holes }: { w: number; l: number; t?: number; y?: number; color?: string; preset?: "pcb_green" | "pcb_blue" | "pcb_black"; holeInset?: number; holeR?: number; radius?: number; holes?: [number, number][] }) {
  const hl: Vec2[][] = useMemo(() => {
    const pts: [number, number][] = holes ?? (holeR > 0 ? [[-w / 2 + holeInset, -l / 2 + holeInset], [w / 2 - holeInset, -l / 2 + holeInset], [w / 2 - holeInset, l / 2 - holeInset], [-w / 2 + holeInset, l / 2 - holeInset]] : []);
    return pts.map(([x, z]) => circleProfile(x, z, holeR, 16));
  }, [w, l, holeInset, holeR, holes]);
  const outline = useMemo(() => roundedProfile(w, l, radius), [w, l, radius]);
  const m: MatLike = color ? { color, roughness: 0.5, metalness: 0.05 } : (preset ?? "pcb_green");
  return (
    <group>
      <Plate profile={outline} holes={hl} t={t} p={[0, y, 0]} m={m} />
      {hl.length ? <InstCyl rad={holeR + 0.6} h={0.04} m="gold" at={(holes ?? defaultCorners(w, l, holeInset)).map(([x, z]) => [x, y + t + 0.02, z] as V3)} seg={20} /> : null}
    </group>
  );
}

function defaultCorners(w: number, l: number, inset: number): [number, number][] {
  return [[-w / 2 + inset, -l / 2 + inset], [w / 2 - inset, -l / 2 + inset], [w / 2 - inset, l / 2 - inset], [-w / 2 + inset, l / 2 - inset]];
}

export function circleProfile(cx: number, cz: number, r: number, n = 24): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

export function roundedProfile(w: number, l: number, r: number, seg = 5): Vec2[] {
  const rr = Math.max(0, Math.min(r, w / 2 - 1e-3, l / 2 - 1e-3));
  const hw = w / 2;
  const hl = l / 2;
  if (rr <= 0.01) return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]];
  const pts: Vec2[] = [];
  const cs: [number, number, number][] = [[hw - rr, hl - rr, 0], [-hw + rr, hl - rr, 90], [-hw + rr, -hl + rr, 180], [hw - rr, -hl + rr, 270]];
  for (const [cx, cz, a0] of cs) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180;
      pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
  }
  return pts;
}

/** Ring of `n` points of radius r around Y at height y. */
export function ring(n: number, r: number, y: number, phase = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
}

export { UNIT_BOX };
