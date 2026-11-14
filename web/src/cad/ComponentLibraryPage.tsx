/**
 * ComponentLibraryPage (route /library) — every catalog model rendered live in 3D at default params.
 * One shared <Canvas> sits behind a scrolling card grid; each card's preview is a drei <View> that
 * scissors its own scene into the card's rect (a single WebGL context for all ~40 models).
 * Fills its parent (give the route container a height).
 */
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, View } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { CATALOG, type CatalogEntry } from "@protoforge/shared";
import { ComponentModel } from "./library";
import { getEdges } from "./geometry";
import { EDGE_MATERIAL } from "./materials";

const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/** Shared PMREM room environment (local, no network) applied to the current (View) scene. */
function SharedEnv() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    let tex = envCache.get(gl);
    if (!tex) {
      const pm = new THREE.PMREMGenerator(gl);
      const room = new RoomEnvironment();
      tex = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
      envCache.set(gl, tex);
    }
    scene.environment = tex;
    scene.environmentIntensity = 0.85;
    return () => {
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

/** Views don't clear the whole canvas; clear once per frame before they draw (priority 0 < View's 1). */
function ClearEachFrame() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.clear(true, true, true);
  }, 0);
  return null;
}

function Preview({ entry, spin }: { entry: CatalogEntry; spin: boolean }) {
  const spinRef = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const cam = useRef<THREE.PerspectiveCamera>(null);
  useLayoutEffect(() => {
    const g = inner.current;
    const c = cam.current;
    if (!g || !c) return;
    g.position.set(0, 0, 0);
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    g.position.set(-center.x, -center.y, -center.z);
    const dist = (radius / Math.sin((c.fov * Math.PI) / 360)) * 0.98;
    c.position.copy(new THREE.Vector3(0.9, 0.75, 1.25).normalize().multiplyScalar(dist));
    c.near = dist / 100;
    c.far = dist * 10;
    c.lookAt(0, 0, 0);
    c.updateProjectionMatrix();
    // light CAD edges on the preview
    const added: THREE.LineSegments[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.geometry?.type === "PlaneGeometry") return;
      if ((m.geometry.getAttribute("position")?.count ?? 0) > 40000) return;
      const ls = new THREE.LineSegments(getEdges(m.geometry), EDGE_MATERIAL);
      ls.raycast = () => {};
      m.add(ls);
      added.push(ls);
    });
    return () => added.forEach((l) => l.removeFromParent());
  }, [entry.model]);
  useFrame((_, dt) => {
    if (spinRef.current) spinRef.current.rotation.y += Math.min(dt, 0.1) * (spin ? 1.1 : 0.3);
  });
  return (
    <>
      <color attach="background" args={["#10131a"]} />
      <PerspectiveCamera makeDefault ref={cam} fov={28} position={[0, 0, 100]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} />
      <directionalLight position={[-4, 1.5, -3]} intensity={0.45} color="#9fb6ff" />
      <SharedEnv />
      <group ref={spinRef}>
        <group ref={inner}>
          <ComponentModel model={entry.model} />
        </group>
      </group>
    </>
  );
}

const CATEGORY_ORDER: CatalogEntry["category"][] = ["motion", "compute", "power", "sensor", "io", "display", "rf", "audio", "structure", "passive"];

function Card({ entry }: { entry: CatalogEntry }) {
  const [hover, setHover] = useState(false);
  const params = Object.entries(entry.params);
  return (
    <article
      className="flex flex-col overflow-hidden rounded-md border border-line transition-colors hover:border-line-strong"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="relative h-44 w-full">
        <View className="absolute inset-0">
          <Preview entry={entry} spin={hover} />
        </View>
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/40 px-1.5 py-px font-mono text-[10px] text-ink-dim">{entry.footprint.join(" × ")} mm</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-line bg-panel p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-ink">{entry.label}</h3>
            <code className="font-mono text-[11px] text-accent">{entry.model}</code>
          </div>
          <span className="shrink-0 rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-ink-faint">{entry.category}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-ink-dim">{entry.description}</p>
        {entry.origin ? <p className="text-[11px] leading-relaxed text-ink-faint">{entry.origin}</p> : null}
        {params.length ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded border border-line bg-panel-2 px-2 py-1.5">
            {params.map(([k, p]) => (
              <div key={k} className="contents" title={p.description}>
                <dt className="font-mono text-[11px] text-ink-dim">{k}</dt>
                <dd className="truncate font-mono text-[11px] text-ink">
                  {String(p.default)}
                  {p.unit ? <span className="text-ink-faint"> {p.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="mt-auto text-[11px] leading-relaxed text-ink-faint">
          <span className="text-ink-dim">e.g.</span> {entry.examples.join(" · ")}
        </p>
      </div>
    </article>
  );
}

export function ComponentLibraryPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const categories = useMemo(() => CATEGORY_ORDER.filter((c) => CATALOG.some((e) => e.category === c)), []);
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((e) => (cat === "all" || e.category === cat) && (!q || `${e.model} ${e.label} ${e.description} ${e.examples.join(" ")}`.toLowerCase().includes(q)));
  }, [query, cat]);

  return (
    <div ref={wrapRef} className="relative h-full min-h-[480px] w-full overflow-hidden bg-bg text-ink">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        eventSource={wrapRef as RefObject<HTMLElement>}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
      >
        <ClearEachFrame />
        <View.Port />
      </Canvas>
      <div className="absolute inset-0 z-[1] overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-line bg-bg/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-ink">Component library</h1>
              <p className="mt-0.5 text-[12px] text-ink-dim">
                {CATALOG.length} parametric models the CAD agents place with <code className="font-mono text-[11px] text-accent">{'{ type: "component", model }'}</code>. Origin at the bottom-face centre, Y up, units mm.
              </p>
            </div>
            <label className="flex h-8 w-64 items-center gap-1.5 rounded border border-line bg-panel px-2 focus-within:border-line-strong">
              <Search className="h-3.5 w-3.5 text-ink-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search models, parts, examples" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-ink-faint" />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <X className="h-3 w-3 text-ink-faint hover:text-ink" />
                </button>
              ) : null}
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {["all", ...categories].map((c) => {
              const n = c === "all" ? CATALOG.length : CATALOG.filter((e) => e.category === c).length;
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCat(c)}
                  className={`h-6 rounded border px-2 text-[11px] capitalize transition-colors ${cat === c ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-ink-dim hover:border-line-strong hover:text-ink"}`}
                >
                  {c} <span className="font-mono text-[10px] opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
        </header>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-6">
          {entries.map((e) => (
            <Card key={e.model} entry={e} />
          ))}
          {entries.length === 0 ? <p className="col-span-full py-12 text-center text-ink-faint">No models match “{query}”.</p> : null}
        </div>
      </div>
    </div>
  );
}
