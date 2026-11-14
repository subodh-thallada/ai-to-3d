/**
 * CadViewer — bare React Three Fiber canvas for a CadModel. Fills its parent.
 *
 * - Parts: position (mm) + XYZ Euler rotation (degrees) from the spec; primitives built in geometry.ts,
 *   cuts applied in csg.ts, catalog components rendered by library/.
 * - Interaction: click selects (stopPropagation, drag-tolerant), hover tints, click on empty space deselects.
 * - Visual modes: highlightIds (+dimOthers greys everything else), xray (all translucent), CAD edge overlay,
 *   joints overlay, exploded view (part.explode or radial from the assembly centre), auto-rotate.
 * - Camera auto-frames the model's bounding box whenever the set of part ids changes; near/far scale with it.
 * - Each part sits behind an error boundary so a single bad part is skipped instead of blanking the scene.
 */
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import { Component, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { CadModel, CadPart, Joint, JointType, Vec3 } from "@protoforge/shared";
import { getEdges, partGeometryKey, toRadians, toVec3, DEG } from "./geometry";
import { getPartGeometry } from "./csg";
import { EDGE_MATERIAL, getMaterial, type RenderMode } from "./materials";
import { ComponentModel, RenderModeContext } from "./library";

export interface CadViewerApi {
  /** Re-frame the camera on the whole model. */
  fit(): void;
  /** Binary STL of all visible parts (mm). */
  exportSTL(): Blob | null;
  /** Binary glTF of all visible parts (metres, one node per part). */
  exportGLB(): Promise<Blob>;
  /** PNG data URL of the current view. */
  screenshot(): string | null;
}

export interface CadViewerProps {
  model: CadModel;
  highlightIds?: string[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** 0..1 exploded-view factor */
  explode?: number;
  xray?: boolean;
  showJoints?: boolean;
  autoRotate?: boolean;
  /** When highlightIds is non-empty, render the other parts as translucent grey (default true). */
  dimOthers?: boolean;
  className?: string;
  /** CAD feature-edge overlay (default true). */
  showEdges?: boolean;
  /** Part ids that are hidden. */
  hiddenIds?: string[] | ReadonlySet<string>;
  /** Imperative API (fit / export / screenshot). */
  apiRef?: Ref<CadViewerApi | null>;
  /** Called with the model bounding-box size (mm) after each framing. */
  onBounds?: (size: Vec3) => void;
  /** Floor grid + contact shadow (default true). */
  showFloor?: boolean;
}

export const JOINT_COLORS: Record<JointType, string> = {
  fastened: "#38bdf8",
  threaded: "#60a5fa",
  revolute: "#ff7a1a",
  prismatic: "#f59e0b",
  press_fit: "#a78bfa",
  snap_fit: "#c084fc",
  adhesive: "#f472b6",
  soldered: "#fbbf24",
  wired: "#34d399",
  magnetic: "#f87171",
  clamped: "#94a3b8",
};

const EDGE_FAINT = new THREE.LineBasicMaterial({ color: "#05070a", transparent: true, opacity: 0.12, depthWrite: false });
const noRaycast = () => {};

/* ------------------------------------------------------------------------------------------- */
/* Error boundary                                                                              */
/* ------------------------------------------------------------------------------------------- */

class PartBoundary extends Component<{ children: ReactNode; id: string; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn(`[cad] part "${this.props.id}" failed to render and was skipped`, err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** One merged LineSegments geometry with the CAD edges of every (non-instanced) mesh of a part, in the part's frame. */
const partEdgeCache = new Map<string, THREE.BufferGeometry | null>();
function partEdges(key: string, group: THREE.Object3D): THREE.BufferGeometry | null {
  if (partEdgeCache.has(key)) return partEdgeCache.get(key) ?? null;
  group.updateWorldMatrix(true, true);
  const inv = group.matrixWorld.clone().invert();
  const pieces: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.edgeOverlay) return;
    if (m.geometry?.type === "PlaneGeometry") return;
    const count = m.geometry?.getAttribute("position")?.count ?? 0;
    if (!count || count > 80000) return;
    const e = getEdges(m.geometry);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", (e.getAttribute("position") as THREE.BufferAttribute).clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    pieces.push(g);
  });
  let merged: THREE.BufferGeometry | null = null;
  try {
    merged = pieces.length ? mergeGeometries(pieces, false) : null;
  } catch {
    merged = null;
  }
  pieces.forEach((g) => g !== merged && g.dispose());
  if (merged) merged.computeBoundingSphere();
  if (partEdgeCache.size > 2000) partEdgeCache.clear();
  partEdgeCache.set(key, merged);
  return merged;
}

/* ------------------------------------------------------------------------------------------- */
/* Part                                                                                        */
/* ------------------------------------------------------------------------------------------- */

interface PartNodeProps {
  part: CadPart;
  mode: RenderMode;
  offset: [number, number, number];
  explode: number;
  showEdges: boolean;
  register: (id: string, obj: THREE.Object3D | null) => void;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
}

const PartNode = memo(function PartNode({ part, mode, offset, explode, showEdges, register, onPick, onHover }: PartNodeProps) {
  const ref = useRef<THREE.Group>(null);
  const geomKey = partGeometryKey(part);
  const isComponent = part.geometry?.type === "component";
  const geometry = useMemo(() => (isComponent ? null : getPartGeometry(part)), [geomKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const material = isComponent ? null : getMaterial(part.material, mode);
  const p = toVec3(part.position);
  const position: [number, number, number] = [p[0] + offset[0] * explode, p[1] + offset[1] * explode, p[2] + offset[2] * explode];
  const rotation = toRadians(part.rotation);
  const faint = mode === "dim" || mode === "xray";

  useEffect(() => {
    register(part.id, ref.current);
    return () => register(part.id, null);
  }, [part.id, register]);

  // shadows + CAD edge overlay (one merged LineSegments per part, component sub-meshes included)
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = !faint;
      m.receiveShadow = true;
    });
    let ls: THREE.LineSegments | null = null;
    if (showEdges) {
      const geo = partEdges(geomKey, g);
      if (geo) {
        ls = new THREE.LineSegments(geo, faint ? EDGE_FAINT : EDGE_MATERIAL);
        ls.userData.edgeOverlay = true;
        ls.raycast = noRaycast;
        g.add(ls);
      }
    }
    invalidate();
    return () => {
      ls?.removeFromParent();
    };
  }, [showEdges, geomKey, faint, invalidate]);

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 4) return;
      onPick(part.id);
    },
    [onPick, part.id],
  );
  const onOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(part.id);
    },
    [onHover, part.id],
  );
  const onOut = useCallback(() => onHover(null), [onHover]);

  return (
    <group ref={ref} position={position} rotation={rotation} userData={{ partId: part.id, partName: part.name }} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      <RenderModeContext.Provider value={mode}>
        {isComponent && part.geometry.type === "component" ? (
          <ComponentModel model={part.geometry.model} params={part.geometry.params} />
        ) : geometry && material ? (
          <mesh geometry={geometry} material={material} />
        ) : null}
      </RenderModeContext.Provider>
    </group>
  );
});

/* ------------------------------------------------------------------------------------------- */
/* Overlays                                                                                    */
/* ------------------------------------------------------------------------------------------- */

function SelectionBox({ target }: { target: () => THREE.Object3D | undefined }) {
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#ff7a1a"));
    const m = h.material as THREE.LineBasicMaterial;
    m.depthTest = false;
    m.transparent = true;
    m.opacity = 0.85;
    h.renderOrder = 999;
    h.raycast = noRaycast;
    return h;
  }, []);
  useEffect(() => () => helper.geometry.dispose(), [helper]);
  useFrame(() => {
    const t = target();
    if (!t) {
      helper.visible = false;
      return;
    }
    helper.box.setFromObject(t);
    helper.visible = !helper.box.isEmpty();
  });
  return <primitive object={helper} />;
}

interface JointMarker {
  pos: THREE.Vector3;
  color: THREE.Color;
  a?: THREE.Vector3;
  b?: THREE.Vector3;
}

function JointsOverlay({ markers, radius }: { markers: JointMarker[]; radius: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }), []);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.55, toneMapped: false }), []);
  const lines = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    for (const m of markers) {
      for (const end of [m.a, m.b]) {
        if (!end) continue;
        pos.push(m.pos.x, m.pos.y, m.pos.z, end.x, end.y, end.z);
        col.push(m.color.r, m.color.g, m.color.b, m.color.r, m.color.g, m.color.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [markers]);
  useEffect(() => () => lines.dispose(), [lines]);
  useEffect(
    () => () => {
      sphere.dispose();
      mat.dispose();
      lineMat.dispose();
    },
    [sphere, mat, lineMat],
  );
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    const r = Math.max(0.3, radius * 0.012);
    markers.forEach((m, i) => {
      o.position.copy(m.pos);
      o.scale.setScalar(r);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, m.color);
    });
    mesh.count = markers.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [markers, radius]);
  if (!markers.length) return null;
  return (
    <group renderOrder={1000}>
      <instancedMesh key={markers.length} ref={meshRef} args={[sphere, mat, markers.length]} frustumCulled={false} renderOrder={1001} raycast={noRaycast} />
      <lineSegments geometry={lines} material={lineMat} frustumCulled={false} renderOrder={1000} raycast={noRaycast} />
    </group>
  );
}

/* ------------------------------------------------------------------------------------------- */
/* Export helpers                                                                              */
/* ------------------------------------------------------------------------------------------- */

/** Flatten the visible parts into plain meshes with baked world matrices (instances expanded). */
function bakeForExport(root: THREE.Object3D): THREE.Group {
  root.updateWorldMatrix(true, true);
  const out = new THREE.Group();
  out.name = "Protoforge assembly";
  const groups = new Map<string, THREE.Group>();
  const tmp = new THREE.Matrix4();
  const visible = new Set<THREE.Object3D>();
  root.traverseVisible((o) => visible.add(o));
  for (const o of visible) {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || o.userData.edgeOverlay) continue;
    let a: THREE.Object3D | null = o;
    while (a && a.userData.partId === undefined) a = a.parent;
    const pid = (a?.userData.partId as string | undefined) ?? "misc";
    let g = groups.get(pid);
    if (!g) {
      g = new THREE.Group();
      g.name = (a?.userData.partName as string | undefined) ?? pid;
      groups.set(pid, g);
      out.add(g);
    }
    const add = (world: THREE.Matrix4) => {
      const m = new THREE.Mesh(mesh.geometry, mesh.material);
      m.matrixAutoUpdate = false;
      m.matrix.copy(world);
      g!.add(m);
    };
    const inst = mesh as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, tmp);
        add(new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, tmp));
      }
    } else add(mesh.matrixWorld.clone());
  }
  out.updateMatrixWorld(true);
  return out;
}

/* ------------------------------------------------------------------------------------------- */
/* Scene                                                                                       */
/* ------------------------------------------------------------------------------------------- */

interface Frame {
  center: THREE.Vector3;
  size: THREE.Vector3;
  radius: number;
  floorY: number;
}

function Scene(props: CadViewerProps) {
  const { model, highlightIds, selectedId = null, onSelect, explode = 0, xray = false, showJoints = false, autoRotate = false, dimOthers = true, showEdges = true, hiddenIds, apiRef, onBounds, showFloor = true } = props;
  const parts = useMemo(() => (Array.isArray(model?.parts) ? model.parts.filter((p) => p && typeof p.id === "string" && p.geometry) : []), [model]);
  const joints = useMemo<Joint[]>(() => (Array.isArray(model?.joints) ? model.joints.filter((j) => j && j.partA && j.partB) : []), [model]);
  const rootRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const objects = useRef(new Map<string, THREE.Object3D>());
  const [hovered, setHovered] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>({ center: new THREE.Vector3(), size: new THREE.Vector3(100, 100, 100), radius: 90, floorY: 0 });
  const get = useThree((s) => s.get);
  const ex = Math.max(0, Math.min(1, Number.isFinite(explode) ? explode : 0));

  const hidden = useMemo(() => (hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds as string[] | undefined)), [hiddenIds]) as ReadonlySet<string>;
  const highlight = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);
  const structureKey = useMemo(() => parts.map((p) => p.id).join("|"), [parts]);

  // exploded-view offsets: explicit part.explode, otherwise radial from the assembly centre
  const offsets = useMemo(() => {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const p of parts) box.expandByPoint(v.set(...toVec3(p.position)));
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const extent = Math.max(30, box.isEmpty() ? 100 : box.getSize(new THREE.Vector3()).length());
    const out = new Map<string, [number, number, number]>();
    for (const p of parts) {
      if (Array.isArray(p.explode) && p.explode.length === 3) {
        out.set(p.id, toVec3(p.explode));
        continue;
      }
      const d = new THREE.Vector3(...toVec3(p.position)).sub(center);
      const len = d.length();
      const dir = len > 1e-6 ? d.clone().divideScalar(len) : new THREE.Vector3(0, 1, 0);
      const o = dir.multiplyScalar(extent * 0.22).add(d.multiplyScalar(0.6));
      out.set(p.id, [o.x, o.y, o.z]);
    }
    return out;
  }, [parts]);

  const register = useCallback((id: string, obj: THREE.Object3D | null) => {
    if (obj) objects.current.set(id, obj);
    else objects.current.delete(id);
  }, []);
  const onPick = useCallback((id: string) => onSelect?.(id), [onSelect]);
  const onHover = useCallback((id: string | null) => setHovered((h) => (id === null ? null : id === h ? h : id)), []);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  const fit = useCallback(() => {
    const root = rootRef.current;
    const state = get();
    const cam = state.camera as THREE.PerspectiveCamera;
    if (!root || !cam) return;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    for (const child of root.children) if (child.visible) box.expandByObject(child);
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 100, 50));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 2);
    const fov = (cam.fov ?? 35) * DEG;
    const aspect = cam.aspect || 1;
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const dist = (radius / Math.sin(Math.min(fov, hFov) / 2)) * 1.05;
    const dir = new THREE.Vector3(0.85, 0.62, 1.15).normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.near = Math.max(0.01, dist / 800);
    cam.far = dist * 60 + radius * 20;
    cam.updateProjectionMatrix();
    const controls = state.controls as unknown as { target: THREE.Vector3; update: () => void; minDistance: number; maxDistance: number } | null;
    if (controls?.target) {
      controls.target.copy(center);
      controls.minDistance = radius * 0.02;
      controls.maxDistance = dist * 20;
      controls.update();
    } else cam.lookAt(center);
    setFrame({ center, size, radius, floorY: box.min.y });
    onBounds?.([size.x, size.y, size.z]);
    state.invalidate();
  }, [get, onBounds]);

  // auto-frame when the set of parts changes (not on every SSE snapshot)
  useEffect(() => {
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
  }, [structureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // key light follows the model's scale
  useEffect(() => {
    const l = lightRef.current;
    if (!l) return;
    const { center, radius } = frame;
    l.position.set(center.x + radius * 0.9, center.y + radius * 2.2, center.z + radius * 1.1);
    l.target.position.copy(center);
    l.target.updateMatrixWorld();
    const c = l.shadow.camera;
    c.left = -radius * 1.4;
    c.right = radius * 1.4;
    c.top = radius * 1.4;
    c.bottom = -radius * 1.4;
    c.near = radius * 0.1;
    c.far = radius * 6;
    c.updateProjectionMatrix();
    l.shadow.normalBias = radius * 0.004;
    l.shadow.needsUpdate = true;
  }, [frame]);

  // joint markers (anchor or midpoint between part bounding centres), recomputed when layout changes
  const [markers, setMarkers] = useState<JointMarker[]>([]);
  useEffect(() => {
    if (!showJoints) {
      setMarkers([]);
      return;
    }
    const id = requestAnimationFrame(() => {
      const centers = new Map<string, THREE.Vector3>();
      const centerOf = (pid: string) => {
        if (centers.has(pid)) return centers.get(pid);
        const o = objects.current.get(pid);
        if (!o) return undefined;
        o.updateWorldMatrix(true, true);
        const b = new THREE.Box3().setFromObject(o);
        const c = b.isEmpty() ? o.getWorldPosition(new THREE.Vector3()) : b.getCenter(new THREE.Vector3());
        centers.set(pid, c);
        return c;
      };
      const out: JointMarker[] = [];
      for (const j of joints) {
        const a = centerOf(j.partA);
        const b = centerOf(j.partB);
        if (!a && !b) continue;
        let pos: THREE.Vector3;
        if (Array.isArray(j.anchor) && j.anchor.length === 3) {
          const oa = offsets.get(j.partA) ?? [0, 0, 0];
          const ob = offsets.get(j.partB) ?? [0, 0, 0];
          pos = new THREE.Vector3(...toVec3(j.anchor)).add(new THREE.Vector3((oa[0] + ob[0]) / 2, (oa[1] + ob[1]) / 2, (oa[2] + ob[2]) / 2).multiplyScalar(ex));
        } else if (a && b) pos = a.clone().add(b).multiplyScalar(0.5);
        else pos = (a ?? b)!.clone();
        out.push({ pos, color: new THREE.Color(JOINT_COLORS[j.type] ?? "#94a3b8"), a, b });
      }
      setMarkers(out);
    });
    return () => cancelAnimationFrame(id);
  }, [showJoints, joints, offsets, ex, parts, hidden]);

  useImperativeHandle(
    apiRef,
    (): CadViewerApi => ({
      fit,
      exportSTL() {
        const root = rootRef.current;
        if (!root) return null;
        const baked = bakeForExport(root);
        const dv = new STLExporter().parse(baked, { binary: true });
        return new Blob([dv.buffer as ArrayBuffer], { type: "model/stl" });
      },
      async exportGLB() {
        const root = rootRef.current;
        if (!root) throw new Error("viewer not ready");
        const baked = bakeForExport(root);
        const scaled = new THREE.Group();
        scaled.name = "Protoforge assembly (m)";
        scaled.scale.setScalar(0.001);
        scaled.add(baked);
        scaled.updateMatrixWorld(true);
        const res = await new GLTFExporter().parseAsync(scaled, { binary: true });
        if (!(res instanceof ArrayBuffer)) throw new Error("GLB export failed");
        return new Blob([res], { type: "model/gltf-binary" });
      },
      screenshot() {
        const { gl, scene, camera } = get();
        try {
          gl.render(scene, camera);
          return gl.domElement.toDataURL("image/png");
        } catch (err) {
          console.warn("[cad] screenshot failed", err);
          return null;
        }
      },
    }),
    [fit, get],
  );

  // the key-light shadow only depends on the layout, not the camera: re-render it after each commit only
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  });

  const modeFor = (id: string): RenderMode => {
    if (id === selectedId) return "selected";
    if (highlight.size && highlight.has(id)) return "highlight";
    if (id === hovered) return "hover";
    if (highlight.size && dimOthers) return "dim";
    if (xray) return "xray";
    return "normal";
  };

  const cell = Math.pow(10, Math.floor(Math.log10(Math.max(1, frame.radius / 4))));
  const ZERO: [number, number, number] = [0, 0, 0];

  return (
    <>
      <ambientLight intensity={0.18} />
      <hemisphereLight args={["#dfe6f5", "#1a1d24", 0.35]} />
      <directionalLight ref={lightRef} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
      <directionalLight position={[-frame.radius * 2, frame.radius, -frame.radius * 1.5]} intensity={0.35} color="#9fb6ff" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-8, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[16, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[8, 1.5, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[16, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 1, -9]} rotation={[0, 0, 0]} scale={[20, 4, 1]} color="#cfe0ff" />
        <Lightformer form="ring" intensity={1.6} position={[4, 4, 7]} scale={4} color="#fff3e6" target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.25} position={[0, -4, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[20, 20, 1]} color="#2a3040" />
      </Environment>

      <group ref={rootRef}>
        {parts.map((part) =>
          hidden.has(part.id) ? null : (
            <PartBoundary key={part.id} id={part.id} resetKey={partGeometryKey(part)}>
              <PartNode part={part} mode={modeFor(part.id)} offset={offsets.get(part.id) ?? ZERO} explode={ex} showEdges={showEdges} register={register} onPick={onPick} onHover={onHover} />
            </PartBoundary>
          ),
        )}
      </group>

      {selectedId && !hidden.has(selectedId) ? <SelectionBox target={() => objects.current.get(selectedId)} /> : null}
      {showJoints ? <JointsOverlay markers={markers} radius={frame.radius} /> : null}

      {showFloor ? (
        <>
          <Grid
            position={[frame.center.x, frame.floorY - frame.radius * 0.002, frame.center.z]}
            infiniteGrid
            cellSize={cell}
            sectionSize={cell * 10}
            cellThickness={0.6}
            sectionThickness={1}
            cellColor="#1c2130"
            sectionColor="#2c3447"
            fadeDistance={frame.radius * 14}
            fadeStrength={1.6}
            followCamera={false}
          />
          <ContactShadows
            key={`${structureKey}|${ex.toFixed(3)}|${hidden.size}|${frame.radius.toFixed(1)}|${frame.floorY.toFixed(1)}`}
            frames={2}
            position={[frame.center.x, frame.floorY - frame.radius * 0.001, frame.center.z]}
            scale={frame.radius * 5}
            far={frame.radius * 1.6}
            blur={2.4}
            opacity={0.55}
            resolution={512}
            color="#000000"
          />
        </>
      ) : null}

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} autoRotate={autoRotate} autoRotateSpeed={0.7} />
    </>
  );
}

export function CadViewer(props: CadViewerProps) {
  const { onSelect, className } = props;
  return (
    <div className={`relative h-full w-full min-h-0 overflow-hidden ${className ?? ""}`}>
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: 35, near: 0.5, far: 100000, position: [250, 200, 320] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={(e) => {
          if (e.type === "click") onSelect?.(null);
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={["#0d1017"]} />
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
