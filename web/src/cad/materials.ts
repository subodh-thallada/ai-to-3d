/**
 * MaterialSpec -> three.js material, with a render "mode" layered on top (hover / selected /
 * highlight / dim / xray). Materials are cached by (spec, mode) so hundreds of parts share a
 * handful of GPU programs and switching modes never allocates in the hot path.
 */
import * as THREE from "three";
import type { MaterialPreset, MaterialSpec } from "@protoforge/shared";

export type RenderMode = "normal" | "hover" | "selected" | "highlight" | "dim" | "xray";

/** Internal material definition: a MaterialSpec plus a few renderer-only extras used by the library. */
export interface MatDef extends MaterialSpec {
  map?: THREE.Texture;
  emissiveMap?: THREE.Texture;
  emissiveIntensity?: number;
  doubleSide?: boolean;
  clearcoat?: number;
}

/** A preset name ("anodized_black"), a CSS hex colour ("#ff0000"), or a full definition. */
export type MatLike = MatDef | MaterialPreset | string;

interface PresetDef {
  color: string;
  metalness: number;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  texture?: "carbon" | "wood";
}

export const PRESETS: Record<MaterialPreset, PresetDef> = {
  aluminum: { color: "#c9ccd1", metalness: 1, roughness: 0.32 },
  anodized_black: { color: "#232529", metalness: 0.75, roughness: 0.38 },
  steel: { color: "#9aa0a8", metalness: 1, roughness: 0.34 },
  stainless: { color: "#c4c8cc", metalness: 1, roughness: 0.22 },
  titanium: { color: "#8d8f93", metalness: 1, roughness: 0.4 },
  brass: { color: "#c9a24a", metalness: 1, roughness: 0.3 },
  copper: { color: "#c87543", metalness: 1, roughness: 0.3 },
  gold: { color: "#e2b84b", metalness: 1, roughness: 0.24 },
  carbon_fiber: { color: "#2a2c31", metalness: 0.3, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25, texture: "carbon" },
  abs_plastic: { color: "#2b2e33", metalness: 0, roughness: 0.55 },
  pla: { color: "#d9dde3", metalness: 0, roughness: 0.6 },
  petg: { color: "#3b4252", metalness: 0, roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.4 },
  nylon: { color: "#e8e4d8", metalness: 0, roughness: 0.75 },
  rubber: { color: "#1c1c1e", metalness: 0, roughness: 0.92 },
  silicone: { color: "#3a3d42", metalness: 0, roughness: 0.7 },
  glass: { color: "#dfe9f2", metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, opacity: 0.28 },
  lens: { color: "#0c1220", metalness: 0.3, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, opacity: 0.94 },
  screen: { color: "#06080c", metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: "#14223d", emissiveIntensity: 0.6 },
  pcb_green: { color: "#1f6b3a", metalness: 0.05, roughness: 0.5 },
  pcb_black: { color: "#16181b", metalness: 0.05, roughness: 0.45 },
  pcb_blue: { color: "#1b5aa8", metalness: 0.05, roughness: 0.48 },
  ceramic: { color: "#ecebe6", metalness: 0, roughness: 0.38 },
  wood: { color: "#a0703f", metalness: 0, roughness: 0.72, texture: "wood" },
  fabric: { color: "#4a4f5a", metalness: 0, roughness: 1 },
  foam: { color: "#2a2d33", metalness: 0, roughness: 1 },
};

const DEFAULT_PRESET: PresetDef = { color: "#b8bcc4", metalness: 0.1, roughness: 0.55 };

/* --------------------------------------------------------------------------------------------- */
/* Procedural textures (UVs are in millimetres — see geometry.ts boxProjectUV)                    */
/* --------------------------------------------------------------------------------------------- */

const texCache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  return ctx ? [c, ctx] : null;
}

/** 2x2 twill weave, one tile = 8 mm. */
function carbonTexture(): THREE.Texture | undefined {
  const hit = texCache.get("carbon");
  if (hit) return hit;
  const cc = canvas(128, 128);
  if (!cc) return undefined;
  const [c, ctx] = cc;
  ctx.fillStyle = "#1b1c1f";
  ctx.fillRect(0, 0, 128, 128);
  const n = 8;
  const s = 128 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const horiz = (i + j) % 4 < 2;
      const g = ctx.createLinearGradient(i * s, j * s, horiz ? i * s : (i + 1) * s, horiz ? (j + 1) * s : j * s);
      g.addColorStop(0, "#26282c");
      g.addColorStop(0.5, horiz ? "#4a4d54" : "#3a3d43");
      g.addColorStop(1, "#202226");
      ctx.fillStyle = g;
      ctx.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 8, 1 / 8);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set("carbon", t);
  return t;
}

function woodTexture(): THREE.Texture | undefined {
  const hit = texCache.get("wood");
  if (hit) return hit;
  const cc = canvas(256, 256);
  if (!cc) return undefined;
  const [c, ctx] = cc;
  ctx.fillStyle = "#b07c48";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const v = Math.sin(y * 0.09) * 0.5 + Math.sin(y * 0.31 + 1.3) * 0.3;
    ctx.fillStyle = `rgba(80,45,20,${0.12 + 0.12 * Math.abs(v)})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 60, 1 / 60);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set("wood", t);
  return t;
}

/** Cached text label texture (white text on a coloured background). */
export function labelTexture(
  text: string,
  opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string; lines?: string[] } = {},
): THREE.Texture | undefined {
  const key = `label:${text}:${JSON.stringify(opts)}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const w = opts.w ?? 256;
  const h = opts.h ?? 128;
  const cc = canvas(w, h);
  if (!cc) return undefined;
  const [c, ctx] = cc;
  ctx.fillStyle = opts.bg ?? "#111317";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.fg ?? "#e6e9ef";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = opts.lines ?? [text];
  const lh = h / (lines.length + 0.6);
  lines.forEach((line, i) => {
    const size = Math.floor(i === 0 ? lh * 0.72 : lh * 0.5);
    ctx.font = opts.font ?? `600 ${size}px "JetBrains Mono", ui-monospace, monospace`;
    if (opts.font) ctx.font = opts.font.replace("{size}", String(size));
    ctx.fillText(line, w / 2, lh * (i + 0.8), w * 0.94);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Cached arbitrary canvas texture drawn by `draw`. */
export function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture | undefined {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cc = canvas(w, h);
  if (!cc) return undefined;
  const [c, ctx] = cc;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/* --------------------------------------------------------------------------------------------- */
/* Material factory                                                                              */
/* --------------------------------------------------------------------------------------------- */

const ACCENT = new THREE.Color("#ff7a1a");
const CYAN = new THREE.Color("#38bdf8");
const DIM = new THREE.Color("#6b7489");

const matCache = new Map<string, THREE.Material>();

function normalize(m: MatLike | undefined): MatDef {
  if (!m) return {};
  if (typeof m === "string") {
    if (m.startsWith("#") || m.startsWith("rgb")) return { color: m };
    if (m in PRESETS) return { preset: m as MaterialPreset };
    return { color: m };
  }
  return m;
}

function keyOf(d: MatDef, mode: RenderMode): string {
  const { map, emissiveMap, ...rest } = d;
  return `${mode}|${JSON.stringify(rest)}|${map?.uuid ?? ""}|${emissiveMap?.uuid ?? ""}`;
}

function safeColor(c: string | undefined, fallback: string): THREE.Color {
  const col = new THREE.Color(fallback);
  if (!c) return col;
  try {
    const parsed = new THREE.Color();
    parsed.setStyle(c, THREE.SRGBColorSpace);
    return parsed;
  } catch {
    return col;
  }
}

const clamp01 = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Resolve a material for a spec + render mode (cached; never dispose the result). */
export function getMaterial(input: MatLike | undefined, mode: RenderMode = "normal"): THREE.Material {
  const d = normalize(input);
  const key = keyOf(d, mode);
  const hit = matCache.get(key);
  if (hit) return hit;

  const preset = (d.preset && PRESETS[d.preset]) || DEFAULT_PRESET;
  const physical = !!(preset.clearcoat || d.clearcoat);
  const mat = physical ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();

  mat.color = safeColor(d.color, preset.color);
  mat.metalness = clamp01(d.metalness, preset.metalness);
  mat.roughness = clamp01(d.roughness, preset.roughness);
  if (mat instanceof THREE.MeshPhysicalMaterial) {
    mat.clearcoat = d.clearcoat ?? preset.clearcoat ?? 0;
    mat.clearcoatRoughness = preset.clearcoatRoughness ?? 0.2;
  }
  const tex = d.map ?? (preset.texture === "carbon" ? carbonTexture() : preset.texture === "wood" ? woodTexture() : undefined);
  if (tex) {
    mat.map = tex;
    // the texture carries the colour; keep a user colour override as a tint only
    if (!d.color && !d.map) mat.color.set("#ffffff");
  }
  const emissive = d.emissive ?? preset.emissive;
  if (emissive) {
    mat.emissive = safeColor(emissive, "#000000");
    mat.emissiveIntensity = d.emissiveIntensity ?? preset.emissiveIntensity ?? 1.4;
  }
  if (d.emissiveMap) {
    mat.emissiveMap = d.emissiveMap;
    if (!emissive) mat.emissive.set("#ffffff");
    mat.emissiveIntensity = d.emissiveIntensity ?? 1;
  }
  const opacity = clamp01(d.opacity, preset.opacity ?? 1);
  if (opacity < 1) {
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthWrite = opacity > 0.85;
  }
  if (d.doubleSide) mat.side = THREE.DoubleSide;

  switch (mode) {
    case "hover":
      mat.emissive = ACCENT.clone();
      mat.emissiveIntensity = 0.22;
      break;
    case "selected":
      mat.emissive = ACCENT.clone();
      mat.emissiveIntensity = 0.5;
      mat.emissiveMap = null;
      break;
    case "highlight":
      mat.emissive = CYAN.clone();
      mat.emissiveIntensity = 0.32;
      mat.emissiveMap = null;
      break;
    case "dim":
      mat.color = DIM.clone();
      mat.map = null;
      mat.metalness = 0;
      mat.roughness = 0.8;
      mat.emissive = new THREE.Color("#000000");
      mat.emissiveMap = null;
      mat.transparent = true;
      mat.opacity = 0.1;
      mat.depthWrite = false;
      break;
    case "xray":
      mat.transparent = true;
      mat.opacity = Math.min(mat.opacity, 0.2);
      mat.depthWrite = false;
      mat.side = THREE.DoubleSide;
      break;
    default:
      break;
  }
  mat.needsUpdate = true;
  matCache.set(key, mat);
  return mat;
}

/** Density g/mm^3 by preset (for mass estimates). */
export const DENSITY: Partial<Record<MaterialPreset, number>> = {
  aluminum: 0.0027, anodized_black: 0.0027, steel: 0.00785, stainless: 0.008, titanium: 0.0045,
  brass: 0.0085, copper: 0.00896, gold: 0.0193, carbon_fiber: 0.0016, abs_plastic: 0.00105,
  pla: 0.00124, petg: 0.00127, nylon: 0.00114, rubber: 0.0012, silicone: 0.0011, glass: 0.0025,
  lens: 0.0025, screen: 0.0025, pcb_green: 0.00185, pcb_black: 0.00185, pcb_blue: 0.00185,
  ceramic: 0.0039, wood: 0.0007, fabric: 0.0005, foam: 0.00005,
};

/** Shared line material for the CAD edge overlay. */
export const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: "#05070a", transparent: true, opacity: 0.55 });
