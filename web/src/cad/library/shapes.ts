/** Procedural geometry generators for the component library (all cached). */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { memoGeometry } from "../geometry";

/**
 * Twisted airfoil blades around Y. Blade i lies along +X rotated by 2πi/n.
 * rootR..tipR radial extent, chord in mm at root (tapers), pitch angles in degrees (root -> tip).
 */
export function bladesGeometry(opts: {
  n: number;
  rootR: number;
  tipR: number;
  chord: number;
  thickness: number;
  pitchRoot: number;
  pitchTip: number;
  y: number;
  tipTaper?: number;
  sweep?: number;
}): THREE.BufferGeometry {
  const key = `blades:${JSON.stringify(opts)}`;
  return memoGeometry(key, () => {
    const { n, rootR, tipR, chord, thickness, pitchRoot, pitchTip, y } = opts;
    const taper = opts.tipTaper ?? 0.45;
    const sweep = opts.sweep ?? 0.25;
    const S = 22;
    const K = 14;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let s = 0; s <= S; s++) {
      const t = s / S;
      const r = rootR + (tipR - rootR) * t;
      // chord: grows quickly from the root, tapers toward a rounded tip
      const grow = Math.min(1, 0.55 + t * 4);
      const tip = Math.sqrt(Math.max(0.02, 1 - Math.pow(t, 6)));
      const c = chord * grow * (1 - taper * t) * tip;
      const th = thickness * (1 - 0.6 * t) * tip;
      const ang = ((pitchRoot + (pitchTip - pitchRoot) * Math.pow(t, 0.7)) * Math.PI) / 180;
      const off = sweep * chord * t * t;
      for (let k = 0; k < K; k++) {
        const a = (k / K) * Math.PI * 2;
        const u = (Math.cos(a) * c) / 2;
        const camber = 0.06 * c * (1 - Math.pow((2 * u) / Math.max(c, 1e-3), 2));
        const v = (Math.sin(a) * th) / 2 + camber;
        const tan = u * Math.cos(ang) - v * Math.sin(ang) + off;
        const vert = u * Math.sin(ang) + v * Math.cos(ang);
        positions.push(r, y + vert, -tan);
      }
    }
    for (let s = 0; s < S; s++) {
      for (let k = 0; k < K; k++) {
        const a = s * K + k;
        const b = s * K + ((k + 1) % K);
        const c2 = (s + 1) * K + k;
        const d = (s + 1) * K + ((k + 1) % K);
        indices.push(a, c2, b, b, c2, d);
      }
    }
    // caps
    const rootC = positions.length / 3;
    positions.push(rootR, y, 0);
    const tipC = positions.length / 3;
    const last = S * K;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < K; k++) {
      cx += positions[(last + k) * 3];
      cy += positions[(last + k) * 3 + 1];
      cz += positions[(last + k) * 3 + 2];
    }
    positions.push(cx / K, cy / K, cz / K);
    for (let k = 0; k < K; k++) {
      indices.push(rootC, k, (k + 1) % K);
      indices.push(tipC, last + ((k + 1) % K), last + k);
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    blade.setIndex(indices);
    blade.computeVertexNormals();
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const g = blade.clone();
      g.rotateY((i / n) * Math.PI * 2);
      parts.push(g);
    }
    const merged = mergeGeometries(parts) ?? blade;
    merged.computeVertexNormals();
    return merged;
  });
}

/** Threaded shank as a lathe: y from 0 down to -length. */
export function threadGeometry(d: number, length: number): THREE.BufferGeometry {
  return memoGeometry(`thread:${d}:${length}`, () => {
    const pitch = Math.max(0.25, d * 0.17);
    const ro = d / 2;
    const ri = ro * 0.84;
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(ro, 0)];
    const turns = Math.max(1, Math.floor((length - pitch) / pitch));
    for (let i = 0; i < turns; i++) {
      const y0 = -i * pitch;
      pts.push(new THREE.Vector2(ri, y0 - pitch * 0.5), new THREE.Vector2(ro, y0 - pitch));
    }
    pts.push(new THREE.Vector2(ro * 0.8, -length), new THREE.Vector2(0, -length));
    return new THREE.LatheGeometry(pts, 24);
  });
}

/** Hexagonal prism (axis Y), centred, measured across flats. */
export function hexPrism(acrossFlats: number, height: number): THREE.BufferGeometry {
  return memoGeometry(`hex:${acrossFlats}:${height}`, () => {
    const r = acrossFlats / 2 / Math.cos(Math.PI / 6);
    const g = new THREE.CylinderGeometry(r, r, height, 6, 1);
    g.rotateY(Math.PI / 6);
    return g;
  });
}

/** Thin ring (washer-like) in XZ plane, height h centred. */
export function ringGeometry(rIn: number, rOut: number, h: number, seg = 48): THREE.BufferGeometry {
  return memoGeometry(`ring:${rIn}:${rOut}:${h}:${seg}`, () => {
    const pts = [
      new THREE.Vector2(rIn, -h / 2),
      new THREE.Vector2(rOut, -h / 2),
      new THREE.Vector2(rOut, h / 2),
      new THREE.Vector2(rIn, h / 2),
      new THREE.Vector2(rIn, -h / 2),
    ];
    return new THREE.LatheGeometry(pts, seg);
  });
}
