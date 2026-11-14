/**
 * Boolean cuts (CadPart.cuts) via three-bvh-csg. Each cut's transform is expressed in the PARENT
 * part's local frame (position mm, rotation XYZ degrees). Results are cached by the part's
 * geometry+cuts key. Any CSG failure falls back to the uncut geometry (console.warn) — never throws.
 */
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { CadCut, CadPart } from "@protoforge/shared";
import { getGeometry, partGeometryKey, toRadians, toVec3, type PrimitiveGeometry } from "./geometry";

let evaluator: Evaluator | null = null;
function getEvaluator(): Evaluator {
  if (!evaluator) {
    evaluator = new Evaluator();
    evaluator.attributes = ["position", "uv", "normal"];
    evaluator.useGroups = false;
  }
  return evaluator;
}

/** Make a geometry CSG-compatible: non-indexed attributes position/normal/uv only, no groups. */
function prepare(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  }
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  if (!g.getAttribute("uv")) {
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
  }
  g.clearGroups();
  return g;
}

const cutCache = new Map<string, THREE.BufferGeometry>();

/** Subtract cuts from a base geometry. Returns `base` unchanged when there is nothing to do or CSG fails. */
export function applyCuts(base: THREE.BufferGeometry, cuts: CadCut[] | undefined, cacheKey?: string): THREE.BufferGeometry {
  const valid = (cuts ?? []).filter((c) => c && c.geometry && c.geometry.type !== ("component" as string) && c.geometry.type !== ("tube" as string));
  if (!valid.length) return base;
  if (cacheKey) {
    const hit = cutCache.get(cacheKey);
    if (hit) return hit;
  }
  let out = base;
  // three-bvh-csg 0.0.18 + three-mesh-bvh 0.9 logs a deprecation warning per brush; keep the console clean
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("maxLeafSize")) return;
    warn(...args);
  };
  try {
    const ev = getEvaluator();
    let result = new Brush(prepare(base));
    result.updateMatrixWorld();
    for (const cut of valid) {
      const tool = new Brush(prepare(getGeometry(cut.geometry as PrimitiveGeometry)));
      tool.position.set(...toVec3(cut.position));
      tool.rotation.set(...toRadians(cut.rotation));
      tool.updateMatrixWorld();
      const next = ev.evaluate(result, tool, SUBTRACTION);
      tool.geometry.dispose();
      result.geometry.dispose();
      result = next;
      result.updateMatrixWorld();
    }
    const g = result.geometry;
    const p = g.getAttribute("position");
    if (!p || p.count === 0) throw new Error("CSG produced empty geometry");
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out = g;
  } catch (err) {
    warn("[cad] CSG cut failed, rendering uncut geometry", err);
    out = base;
  } finally {
    console.warn = warn;
  }
  if (cacheKey) cutCache.set(cacheKey, out);
  return out;
}

/** Final renderable geometry for a primitive (non-component) part, cuts applied and cached. */
export function getPartGeometry(part: Pick<CadPart, "geometry" | "cuts">): THREE.BufferGeometry {
  if (part.geometry.type === "component") throw new Error("component parts have no primitive geometry");
  const base = getGeometry(part.geometry as PrimitiveGeometry);
  if (!part.cuts?.length) return base;
  return applyCuts(base, part.cuts, partGeometryKey(part));
}
