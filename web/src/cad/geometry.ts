/**
 * Geometry -> THREE.BufferGeometry builders with exact semantics from shared/src/types.ts.
 *
 * Conventions (mm, Y up, right-handed, rotations in DEGREES in the spec):
 *  - box: centred, size [x,y,z], optional fillet radius (RoundedBoxGeometry)
 *  - cylinder / cone / capsule: axis = local Y, centred (cone apex at +Y)
 *  - torus: ring in the local XZ plane (axis Y)
 *  - extrude: plan-view profile [x, z] (+ holes) extruded along +Y by depth, centred (y in [-d/2, d/2])
 *  - lathe: [radius, y] profile revolved about Y
 *  - tube: circle swept along a Catmull-Rom curve through `path`
 * Every non-tube primitive gets box-projected UVs in millimetres so tiling textures (carbon weave)
 * have a consistent physical scale, and so that CSG brushes share the same attribute set.
 * Geometries are cached by JSON key and must be treated as immutable / never disposed by callers.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { CadCut, CadPart, Geometry, Vec2, Vec3 } from "@protoforge/shared";

export const DEG = Math.PI / 180;

export type PrimitiveGeometry = Exclude<Geometry, { type: "component" }>;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const pos = (v: unknown, d: number, min = 0.01) => Math.max(min, Math.abs(num(v, d)));

export function toRadians(rot?: Vec3 | null): [number, number, number] {
  if (!rot || !Array.isArray(rot)) return [0, 0, 0];
  return [num(rot[0], 0) * DEG, num(rot[1], 0) * DEG, num(rot[2], 0) * DEG];
}

export function toVec3(v?: Vec3 | null): [number, number, number] {
  if (!v || !Array.isArray(v)) return [0, 0, 0];
  return [num(v[0], 0), num(v[1], 0), num(v[2], 0)];
}

/** Overwrite the uv attribute with a box (tri-planar) projection in mm. */
export function boxProjectUV(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = geo.getAttribute("position");
  if (!p) return geo;
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  const n = geo.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

function shapePoints(pts: Vec2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of pts) {
    if (!Array.isArray(p)) continue;
    const v = new THREE.Vector2(num(p[0], 0), -num(p[1], 0)); // shape (x, y) = (x, -z), see extrude()
    const last = out[out.length - 1];
    if (!last || last.distanceToSquared(v) > 1e-10) out.push(v);
  }
  if (out.length > 2 && out[0].distanceToSquared(out[out.length - 1]) < 1e-10) out.pop();
  return out;
}

function extrude(profile: Vec2[], holes: Vec2[][] | undefined, depthIn: number, bevelIn?: number): THREE.BufferGeometry {
  const pts = shapePoints(profile);
  if (pts.length < 3) throw new Error("extrude profile needs at least 3 points");
  const shape = new THREE.Shape(pts);
  for (const h of holes ?? []) {
    const hp = shapePoints(h);
    if (hp.length >= 3) shape.holes.push(new THREE.Path(hp));
  }
  const depth = pos(depthIn, 1);
  const bevel = Math.min(Math.max(0, num(bevelIn, 0)), depth * 0.45);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 16,
  });
  // ExtrudeGeometry extrudes the XY shape along +Z over [-bevel, depth - bevel].
  // rotateX(-90°): (x, y, z) -> (x, z, -y), so shape y = -z_plan lands on +z_plan and extrusion becomes +Y.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(depth / 2 - bevel), 0);
  return geo;
}

/** Build a fresh (uncached) BufferGeometry for a primitive. Throws on unusable input. */
export function buildPrimitive(g: PrimitiveGeometry): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  switch (g.type) {
    case "box": {
      const s = Array.isArray(g.size) ? g.size : [10, 10, 10];
      const x = pos(s[0], 10);
      const y = pos(s[1], 10);
      const z = pos(s[2], 10);
      const r = Math.min(Math.max(0, num(g.radius, 0)), Math.min(x, y, z) / 2 - 1e-3);
      geo = r > 0.01 ? new RoundedBoxGeometry(x, y, z, 3, r) : new THREE.BoxGeometry(x, y, z);
      break;
    }
    case "cylinder": {
      const r = pos(g.radius, 5);
      const rt = g.radiusTop === undefined ? r : Math.max(0, num(g.radiusTop, r));
      geo = new THREE.CylinderGeometry(rt, r, pos(g.height, 10), Math.max(6, Math.min(128, Math.round(num(g.segments, 48)))));
      break;
    }
    case "cone":
      geo = new THREE.ConeGeometry(pos(g.radius, 5), pos(g.height, 10), Math.max(6, Math.min(128, Math.round(num(g.segments, 48)))));
      break;
    case "sphere":
      geo = new THREE.SphereGeometry(pos(g.radius, 5), 48, 32);
      break;
    case "torus":
      geo = new THREE.TorusGeometry(pos(g.radius, 10), pos(g.tube, 2), 24, 72);
      geo.rotateX(Math.PI / 2);
      break;
    case "capsule":
      geo = new THREE.CapsuleGeometry(pos(g.radius, 5), Math.max(0, num(g.length, 10)), 8, 32);
      break;
    case "extrude":
      geo = extrude(g.profile ?? [], g.holes, g.depth, g.bevel);
      break;
    case "lathe": {
      const pts = (g.profile ?? [])
        .filter((p) => Array.isArray(p))
        .map((p) => new THREE.Vector2(Math.max(0, num(p[0], 0)), num(p[1], 0)));
      if (pts.length < 2) throw new Error("lathe profile needs at least 2 points");
      geo = new THREE.LatheGeometry(pts, Math.max(8, Math.min(128, Math.round(num(g.segments, 64)))));
      break;
    }
    case "tube": {
      const pts: THREE.Vector3[] = [];
      for (const p of g.path ?? []) {
        if (!Array.isArray(p)) continue;
        const v = new THREE.Vector3(num(p[0], 0), num(p[1], 0), num(p[2], 0));
        const last = pts[pts.length - 1];
        if (!last || last.distanceToSquared(v) > 1e-8) pts.push(v);
      }
      const r = pos(g.radius, 1);
      if (pts.length < 2) {
        geo = new THREE.SphereGeometry(r, 12, 8);
        if (pts[0]) geo.translate(pts[0].x, pts[0].y, pts[0].z);
        return geo;
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      geo = new THREE.TubeGeometry(curve, Math.min(400, Math.max(24, pts.length * 16)), r, 10, false);
      return geo;
    }
    default:
      throw new Error(`unknown geometry type ${(g as { type?: string }).type}`);
  }
  return boxProjectUV(geo);
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Cached builder; falls back to a 10 mm cube on invalid input (warns once). */
export function getGeometry(g: PrimitiveGeometry): THREE.BufferGeometry {
  const key = JSON.stringify(g);
  const hit = geoCache.get(key);
  if (hit) return hit;
  let geo: THREE.BufferGeometry;
  try {
    geo = buildPrimitive(g);
  } catch (err) {
    console.warn("[cad] invalid geometry, using placeholder", g, err);
    geo = boxProjectUV(new THREE.BoxGeometry(10, 10, 10));
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geoCache.set(key, geo);
  return geo;
}

/** Generic memo cache for library geometries (key must fully describe the geometry). */
export function memoGeometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geoCache.get(key);
  if (hit) return hit as T;
  const g = make();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

const edgeCache = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>();

/** Cached CAD edge lines (feature edges with a 28° crease threshold). */
export function getEdges(geo: THREE.BufferGeometry): THREE.EdgesGeometry {
  let e = edgeCache.get(geo);
  if (!e) {
    e = new THREE.EdgesGeometry(geo, 28);
    edgeCache.set(geo, e);
  }
  return e;
}

/* ------------------------------ profile helpers ------------------------------ */

/** Rounded rectangle profile [x, z] centred on the origin. */
export function roundedRect(w: number, l: number, r: number, seg = 6): Vec2[] {
  const rr = Math.max(0, Math.min(r, w / 2 - 1e-3, l / 2 - 1e-3));
  const hw = w / 2;
  const hl = l / 2;
  if (rr <= 0.01) return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]];
  const pts: Vec2[] = [];
  const corners: [number, number, number][] = [
    [hw - rr, hl - rr, 0],
    [-hw + rr, hl - rr, 90],
    [-hw + rr, -hl + rr, 180],
    [hw - rr, -hl + rr, 270],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = (a0 + (90 * i) / seg) * DEG;
      pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
  }
  return pts;
}

/** Circle profile [x, z]. */
export function circle(cx: number, cz: number, r: number, n = 24): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/** Stadium / slot profile along X. */
export function slot(cx: number, cz: number, length: number, width: number, n = 10): Vec2[] {
  const r = width / 2;
  const h = Math.max(0, length / 2 - r);
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([cx + h + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI;
    pts.push([cx - h + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/** Short human summary of a geometry (inspector). */
export function describeGeometry(g: Geometry): string {
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  switch (g.type) {
    case "box":
      return `box ${g.size.map(f).join(" × ")}${g.radius ? ` r${f(g.radius)}` : ""}`;
    case "cylinder":
      return `cylinder Ø${f(g.radius * 2)} × ${f(g.height)}${g.radiusTop !== undefined ? ` (top Ø${f(g.radiusTop * 2)})` : ""}`;
    case "cone":
      return `cone Ø${f(g.radius * 2)} × ${f(g.height)}`;
    case "sphere":
      return `sphere Ø${f(g.radius * 2)}`;
    case "torus":
      return `torus R${f(g.radius)} tube ${f(g.tube)}`;
    case "capsule":
      return `capsule Ø${f(g.radius * 2)} × ${f(g.length + 2 * g.radius)}`;
    case "extrude":
      return `extrude ${g.profile?.length ?? 0} pts × ${f(g.depth)}${g.holes?.length ? `, ${g.holes.length} holes` : ""}`;
    case "lathe":
      return `lathe ${g.profile?.length ?? 0} pts`;
    case "tube":
      return `tube Ø${f(g.radius * 2)}, ${g.path?.length ?? 0} pts`;
    case "component":
      return `${g.model}${g.params && Object.keys(g.params).length ? " (" + Object.entries(g.params).map(([k, v]) => `${k}=${v}`).join(", ") + ")" : ""}`;
    default:
      return "unknown";
  }
}

/** Stable key for a part's final (cut) geometry. */
export function partGeometryKey(part: Pick<CadPart, "geometry" | "cuts">): string {
  return JSON.stringify([part.geometry, part.cuts ?? null]);
}

export type { CadCut };
