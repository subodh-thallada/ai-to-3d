/**
 * CadWorkspace — full CAD workspace that fills its parent:
 *   left  : part tree grouped by subsystem (search, per-part / per-subsystem visibility, click to select)
 *   centre: CadViewer + floating toolbar (explode, x-ray, edges, joints, auto-rotate, fit, STL/GLB/PNG export)
 *   right : inspector (geometry, transform, material, fabrication, mass, BOM link, electronics pins, joints)
 *   footer: part / joint counts and bounding box (mm)
 * Selection is controlled when `selectedId` is provided, otherwise internal.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  Component as ComponentIcon,
  Cylinder,
  Download,
  Expand,
  Eye,
  EyeOff,
  Focus,
  Layers,
  Link2,
  PanelLeft,
  PanelRight,
  RotateCw,
  ScanEye,
  Search,
  Shapes,
  Spline,
  X,
} from "lucide-react";
import { computeMeshVolume } from "three-bvh-csg";
import { CATALOG_BY_MODEL, type BomItem, type CadModel, type CadPart, type ElectronicsSpec, type Joint, type PinType, type Vec3 } from "@protoforge/shared";
import { CadViewer, JOINT_COLORS, type CadViewerApi } from "./CadViewer";
import { describeGeometry } from "./geometry";
import { getPartGeometry } from "./csg";
import { DENSITY, PRESETS } from "./materials";

export interface CadWorkspaceProps {
  model: CadModel;
  bom?: BomItem[];
  electronics?: ElectronicsSpec | null;
  highlightIds?: string[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
}

const PIN_COLORS: Partial<Record<PinType, string>> = {
  power_in: "#f87171",
  power_out: "#f87171",
  ground: "#6b7489",
  digital: "#38bdf8",
  analog: "#34d399",
  pwm: "#ff7a1a",
  i2c_sda: "#a78bfa",
  i2c_scl: "#a78bfa",
  spi_mosi: "#fbbf24",
  spi_miso: "#fbbf24",
  spi_sck: "#fbbf24",
  spi_cs: "#fbbf24",
  uart_tx: "#f472b6",
  uart_rx: "#f472b6",
  usb: "#60a5fa",
  motor: "#ff7a1a",
};

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? (Math.round(n * 10 ** d) / 10 ** d).toString() : "—");
const fmtVec = (v?: Vec3) => (v ? v.map((n) => fmt(n)).join(", ") : "0, 0, 0");

function download(data: Blob | string, name: string) {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof data !== "string") setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function partIcon(p: CadPart) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (p.geometry?.type) {
    case "component":
      return <ComponentIcon className={`${cls} text-cyan`} />;
    case "tube":
      return <Spline className={`${cls} text-ok`} />;
    case "cylinder":
    case "cone":
    case "lathe":
      return <Cylinder className={`${cls} text-ink-faint`} />;
    case "extrude":
      return <Layers className={`${cls} text-ink-faint`} />;
    case "box":
      return <Box className={`${cls} text-ink-faint`} />;
    default:
      return <Shapes className={`${cls} text-ink-faint`} />;
  }
}

function estimateMass(part: CadPart): number | null {
  if (typeof part.massG === "number" && Number.isFinite(part.massG)) return part.massG;
  if (!part.geometry || part.geometry.type === "component") return null;
  try {
    const vol = Math.abs(computeMeshVolume(getPartGeometry(part)));
    const rho = (part.material?.preset && DENSITY[part.material.preset]) || 0.0012;
    return vol * rho;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------- */

function ToolButton({ active, onClick, title, children, disabled }: { active?: boolean; onClick: () => void; title: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-[11px] transition-colors disabled:opacity-40 ${
        active ? "bg-accent/15 text-accent" : "text-ink-dim hover:bg-panel-3 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ k, children, mono }: { k: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-[2px] text-[12px]">
      <span className="w-[76px] shrink-0 text-ink-faint">{k}</span>
      <span className={`min-w-0 flex-1 break-words text-ink ${mono ? "font-mono text-[11px]" : ""}`}>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- */

export function CadWorkspace({ model, bom, electronics, highlightIds, selectedId: selectedProp, onSelect, className }: CadWorkspaceProps) {
  const parts = useMemo(() => (Array.isArray(model?.parts) ? model.parts.filter((p) => p && p.id) : []), [model]);
  const joints = useMemo(() => (Array.isArray(model?.joints) ? model.joints : []), [model]);
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  const [internalSel, setInternalSel] = useState<string | null>(null);
  const controlled = selectedProp !== undefined;
  const selectedId = controlled ? (selectedProp ?? null) : internalSel;
  const select = useCallback(
    (id: string | null) => {
      if (!controlled) setInternalSel(id);
      onSelect?.(id);
    },
    [controlled, onSelect],
  );

  const [explode, setExplode] = useState(0);
  const [xray, setXray] = useState(false);
  const [edges, setEdges] = useState(true);
  const [showJoints, setShowJoints] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [bounds, setBounds] = useState<Vec3 | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiRef = useRef<CadViewerApi | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, CadPart[]>();
    for (const p of parts) {
      const sub = p.subsystem || "Unassigned";
      if (!map.has(sub)) map.set(sub, []);
      if (q) {
        const hay = `${p.name} ${p.id} ${p.geometry?.type === "component" ? p.geometry.model : p.geometry?.type} ${sub}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      map.get(sub)!.push(p);
    }
    return [...map.entries()].filter(([, list]) => !q || list.length > 0);
  }, [parts, query]);

  const totals = useMemo(() => {
    const t = new Map<string, number>();
    for (const p of parts) t.set(p.subsystem || "Unassigned", (t.get(p.subsystem || "Unassigned") ?? 0) + 1);
    return t;
  }, [parts]);

  useEffect(() => {
    if (!selectedId) return;
    const el = rowRefs.current.get(selectedId);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") select(null);
      else if (e.key === "f" || e.key === "F") apiRef.current?.fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const togglePart = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleGroup = (sub: string) =>
    setHidden((h) => {
      const ids = parts.filter((p) => (p.subsystem || "Unassigned") === sub).map((p) => p.id);
      const allHidden = ids.every((id) => h.has(id));
      const n = new Set(h);
      ids.forEach((id) => (allHidden ? n.delete(id) : n.add(id)));
      return n;
    });

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const selected = selectedId ? byId.get(selectedId) : undefined;

  return (
    <div className={`flex h-full w-full min-h-0 min-w-0 overflow-hidden bg-bg text-[12px] text-ink ${className ?? ""}`}>
      {/* ------------------------------ part tree ------------------------------ */}
      {leftOpen ? (
        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
          <div className="flex h-9 items-center gap-2 border-b border-line px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-dim">Parts</span>
            <span className="font-mono text-[11px] text-ink-faint">{parts.length}</span>
            {hidden.size ? (
              <button type="button" className="ml-auto text-[11px] text-ink-faint hover:text-accent" onClick={() => setHidden(new Set())}>
                Show all ({hidden.size})
              </button>
            ) : null}
          </div>
          <div className="border-b border-line p-2">
            <label className="flex h-7 items-center gap-1.5 rounded border border-line bg-panel-2 px-2 focus-within:border-line-strong">
              <Search className="h-3.5 w-3.5 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter parts"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
              />
              {query ? (
                <button type="button" aria-label="Clear filter" onClick={() => setQuery("")}>
                  <X className="h-3 w-3 text-ink-faint hover:text-ink" />
                </button>
              ) : null}
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {groups.length === 0 ? <p className="px-3 py-4 text-ink-faint">No parts{query ? " match" : ""}.</p> : null}
            {groups.map(([sub, list]) => {
              const isCollapsed = collapsed.has(sub) && !query;
              const ids = parts.filter((p) => (p.subsystem || "Unassigned") === sub);
              const allHidden = ids.length > 0 && ids.every((p) => hidden.has(p.id));
              return (
                <div key={sub}>
                  <div className="group flex h-7 items-center gap-1 px-2 hover:bg-panel-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                      onClick={() =>
                        setCollapsed((c) => {
                          const n = new Set(c);
                          if (n.has(sub)) n.delete(sub);
                          else n.add(sub);
                          return n;
                        })
                      }
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-ink-faint" /> : <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />}
                      <span className={`truncate text-[12px] font-medium ${allHidden ? "text-ink-faint" : "text-ink"}`}>{sub}</span>
                      <span className="ml-1 font-mono text-[10px] text-ink-faint">{query ? `${list.length}/` : ""}{totals.get(sub) ?? 0}</span>
                    </button>
                    <button type="button" title={allHidden ? "Show subsystem" : "Hide subsystem"} onClick={() => toggleGroup(sub)} className="rounded p-0.5 text-ink-faint hover:text-ink">
                      {allHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />}
                    </button>
                  </div>
                  {!isCollapsed &&
                    list.map((p) => {
                      const sel = p.id === selectedId;
                      const hid = hidden.has(p.id);
                      const hl = highlightIds?.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          ref={(el) => {
                            if (el) rowRefs.current.set(p.id, el);
                            else rowRefs.current.delete(p.id);
                          }}
                          className={`group flex h-[26px] cursor-pointer items-center gap-1.5 border-l-2 pl-6 pr-2 ${
                            sel ? "border-accent bg-accent/10" : hl ? "border-cyan bg-cyan/5" : "border-transparent hover:bg-panel-2"
                          }`}
                          onClick={() => select(sel ? null : p.id)}
                        >
                          {partIcon(p)}
                          <span className={`min-w-0 flex-1 truncate ${hid ? "text-ink-faint line-through" : sel ? "text-ink" : "text-ink-dim"}`}>{p.name || p.id}</span>
                          <button
                            type="button"
                            title={hid ? "Show part" : "Hide part"}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePart(p.id);
                            }}
                            className="rounded p-0.5 text-ink-faint hover:text-ink"
                          >
                            {hid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />}
                          </button>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </aside>
      ) : null}

      {/* ------------------------------ viewport ------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {parts.length ? (
            <CadViewer
              model={model}
              highlightIds={highlightIds}
              selectedId={selectedId}
              onSelect={select}
              explode={explode}
              xray={xray}
              showJoints={showJoints}
              autoRotate={autoRotate}
              showEdges={edges}
              hiddenIds={hidden}
              apiRef={apiRef}
              onBounds={setBounds}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-faint">No CAD parts yet.</div>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-2">
            <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-line bg-panel/95 p-1 shadow-lg shadow-black/30 backdrop-blur">
              <ToolButton title={leftOpen ? "Hide part tree" : "Show part tree"} active={leftOpen} onClick={() => setLeftOpen((v) => !v)}>
                <PanelLeft className="h-3.5 w-3.5" />
              </ToolButton>
              <div className="mx-1 h-4 w-px bg-line" />
              <div className="flex h-7 items-center gap-1.5 px-1.5" title="Exploded view">
                <Expand className={`h-3.5 w-3.5 ${explode > 0 ? "text-accent" : "text-ink-dim"}`} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={explode}
                  onChange={(e) => setExplode(parseFloat(e.target.value))}
                  aria-label="Explode"
                  className="h-1 w-20 cursor-pointer accent-[#ff7a1a]"
                />
                <span className="w-7 text-right font-mono text-[10px] text-ink-faint">{Math.round(explode * 100)}%</span>
              </div>
              <ToolButton title="X-ray" active={xray} onClick={() => setXray((v) => !v)}>
                <ScanEye className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton title="Edges" active={edges} onClick={() => setEdges((v) => !v)}>
                <Box className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton title="Joints" active={showJoints} onClick={() => setShowJoints((v) => !v)}>
                <Link2 className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton title="Auto-rotate" active={autoRotate} onClick={() => setAutoRotate((v) => !v)}>
                <RotateCw className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton title="Fit view (F)" onClick={() => apiRef.current?.fit()}>
                <Focus className="h-3.5 w-3.5" />
              </ToolButton>
              <div className="mx-1 h-4 w-px bg-line" />
              <ToolButton
                title="Export STL"
                disabled={!!busy || !parts.length}
                onClick={() =>
                  run("STL export", () => {
                    const blob = apiRef.current?.exportSTL();
                    if (!blob) throw new Error("viewer not ready");
                    download(blob, "protoforge-assembly.stl");
                  })
                }
              >
                <Download className="h-3.5 w-3.5" />
                <span className="font-mono">STL</span>
              </ToolButton>
              <ToolButton
                title="Export GLB"
                disabled={!!busy || !parts.length}
                onClick={() =>
                  run("GLB export", async () => {
                    if (!apiRef.current) throw new Error("viewer not ready");
                    download(await apiRef.current.exportGLB(), "protoforge-assembly.glb");
                  })
                }
              >
                <Download className="h-3.5 w-3.5" />
                <span className="font-mono">GLB</span>
              </ToolButton>
              <ToolButton
                title="Screenshot PNG"
                disabled={!!busy || !parts.length}
                onClick={() =>
                  run("Screenshot", () => {
                    const url = apiRef.current?.screenshot();
                    if (!url) throw new Error("viewer not ready");
                    download(url, "protoforge-view.png");
                  })
                }
              >
                <Camera className="h-3.5 w-3.5" />
              </ToolButton>
              <div className="mx-1 h-4 w-px bg-line" />
              <ToolButton title={rightOpen ? "Hide inspector" : "Show inspector"} active={rightOpen} onClick={() => setRightOpen((v) => !v)}>
                <PanelRight className="h-3.5 w-3.5" />
              </ToolButton>
            </div>
          </div>

          {showJoints && joints.length ? (
            <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[60%] flex-wrap gap-x-2.5 gap-y-1 rounded border border-line bg-panel/90 px-2 py-1.5">
              {[...new Set(joints.map((j) => j.type))].map((t) => (
                <span key={t} className="flex items-center gap-1 text-[10px] text-ink-dim">
                  <span className="h-2 w-2 rounded-full" style={{ background: JOINT_COLORS[t] ?? "#94a3b8" }} />
                  {t.replace("_", " ")}
                </span>
              ))}
            </div>
          ) : null}
          {busy || error ? (
            <div className={`absolute bottom-2 right-2 rounded border px-2 py-1 text-[11px] ${error ? "border-bad/40 bg-bad/10 text-bad" : "border-line bg-panel text-ink-dim"}`}>
              {error ?? `${busy}…`}
              {error ? (
                <button type="button" className="ml-2 text-ink-faint hover:text-ink" onClick={() => setError(null)} aria-label="Dismiss">
                  <X className="inline h-3 w-3" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 font-mono text-[11px] text-ink-faint">
          <span>
            <span className="text-ink-dim">{parts.length}</span> parts
          </span>
          <span>
            <span className="text-ink-dim">{joints.length}</span> joints
          </span>
          <span>
            bbox <span className="text-ink-dim">{bounds ? bounds.map((n) => fmt(n, 0)).join(" × ") : "—"}</span> mm
          </span>
          {hidden.size ? <span>{hidden.size} hidden</span> : null}
          {selected ? <span className="ml-auto truncate text-accent">{selected.name}</span> : null}
        </footer>
      </div>

      {/* ------------------------------ inspector ------------------------------ */}
      {rightOpen ? (
        <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-panel">
          <div className="flex h-9 items-center border-b border-line px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-dim">Inspector</span>
            {selected ? (
              <button type="button" className="ml-auto text-ink-faint hover:text-ink" onClick={() => select(null)} aria-label="Clear selection">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selected ? (
              <Inspector part={selected} joints={joints} byId={byId} bom={bom} electronics={electronics} onSelect={select} />
            ) : (
              <Overview parts={parts} joints={joints} totals={totals} />
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- */

function Overview({ parts, joints, totals }: { parts: CadPart[]; joints: Joint[]; totals: Map<string, number> }) {
  const comps = parts.filter((p) => p.geometry?.type === "component").length;
  const mass = parts.reduce((s, p) => s + (typeof p.massG === "number" ? p.massG : 0), 0);
  const jt = new Map<string, number>();
  joints.forEach((j) => jt.set(j.type, (jt.get(j.type) ?? 0) + 1));
  return (
    <div>
      <Section title="Assembly">
        <Row k="Parts">{parts.length}</Row>
        <Row k="Custom">{parts.length - comps}</Row>
        <Row k="Purchased">{comps}</Row>
        <Row k="Joints">{joints.length}</Row>
        {mass > 0 ? <Row k="Mass (spec)">{fmt(mass)} g</Row> : null}
      </Section>
      <Section title="Subsystems">
        {[...totals.entries()].map(([k, v]) => (
          <Row key={k} k={k}>
            <span className="font-mono text-[11px] text-ink-dim">{v}</span>
          </Row>
        ))}
      </Section>
      {jt.size ? (
        <Section title="Joint types">
          {[...jt.entries()].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 py-[2px]">
              <span className="h-2 w-2 rounded-full" style={{ background: JOINT_COLORS[k as Joint["type"]] ?? "#94a3b8" }} />
              <span className="flex-1 text-ink-dim">{k.replace("_", " ")}</span>
              <span className="font-mono text-[11px] text-ink-faint">{v}</span>
            </div>
          ))}
        </Section>
      ) : null}
      <p className="px-3 py-3 text-[11px] leading-relaxed text-ink-faint">Click a part in the viewport or the tree to inspect it. Esc clears the selection, F frames the model.</p>
    </div>
  );
}

function Inspector({
  part,
  joints,
  byId,
  bom,
  electronics,
  onSelect,
}: {
  part: CadPart;
  joints: Joint[];
  byId: Map<string, CadPart>;
  bom?: BomItem[];
  electronics?: ElectronicsSpec | null;
  onSelect: (id: string | null) => void;
}) {
  const g = part.geometry;
  const catalog = g?.type === "component" ? CATALOG_BY_MODEL[g.model] : undefined;
  const bomItem = part.bomId ? bom?.find((b) => b.id === part.bomId) : undefined;
  const comp = electronics?.components?.find((c) => c.id === part.electronicsId || (Array.isArray(c.cadPartIds) && c.cadPartIds.includes(part.id)));
  const related = joints.filter((j) => j.partA === part.id || j.partB === part.id);
  const mass = useMemo(() => estimateMass(part), [part]);
  const m = part.material;
  const swatch = m?.color ?? (m?.preset ? PRESETS[m.preset]?.color : undefined);

  return (
    <div>
      <div className="border-b border-line px-3 py-2.5">
        <div className="text-[13px] font-semibold leading-snug text-ink">{part.name || part.id}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] text-ink-faint">{part.id}</span>
          {part.subsystem ? <span className="rounded border border-line px-1.5 py-px text-[10px] text-ink-dim">{part.subsystem}</span> : null}
          {g?.type === "component" ? <span className="rounded bg-cyan/10 px-1.5 py-px text-[10px] text-cyan">purchased</span> : <span className="rounded bg-accent/10 px-1.5 py-px text-[10px] text-accent">custom</span>}
        </div>
        {part.description ? <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{part.description}</p> : null}
      </div>

      <Section title="Geometry">
        {catalog ? <Row k="Model">{catalog.label}</Row> : null}
        <Row k="Shape" mono>
          {g ? describeGeometry(g) : "—"}
        </Row>
        {part.cuts?.length ? <Row k="Cuts">{part.cuts.length} boolean cut{part.cuts.length > 1 ? "s" : ""}</Row> : null}
        {catalog ? (
          <Row k="Footprint" mono>
            {catalog.footprint.join(" × ")} mm
          </Row>
        ) : null}
      </Section>

      <Section title="Transform">
        <Row k="Position" mono>
          {fmtVec(part.position)} mm
        </Row>
        <Row k="Rotation" mono>
          {fmtVec(part.rotation)} °
        </Row>
        {part.explode ? (
          <Row k="Explode" mono>
            {fmtVec(part.explode)} mm
          </Row>
        ) : null}
      </Section>

      <Section title="Material & make">
        <Row k="Material">
          {m ? (
            <span className="inline-flex items-center gap-1.5">
              {swatch ? <span className="h-2.5 w-2.5 rounded-sm border border-line-strong" style={{ background: swatch }} /> : null}
              {m.preset?.replace(/_/g, " ") ?? "custom"}
              {m.color ? <span className="font-mono text-[10px] text-ink-faint">{m.color}</span> : null}
            </span>
          ) : g?.type === "component" ? (
            "library model"
          ) : (
            "default"
          )}
        </Row>
        {part.fabrication ? <Row k="Fabrication">{part.fabrication}</Row> : null}
        <Row k="Mass">{mass !== null ? `${fmt(mass)} g${typeof part.massG === "number" ? "" : " (est.)"}` : "—"}</Row>
      </Section>

      {part.bomId ? (
        <Section title="BOM">
          {bomItem ? (
            <>
              <Row k="Item">{bomItem.name}</Row>
              {bomItem.manufacturer ? <Row k="Maker">{bomItem.manufacturer}</Row> : null}
              {bomItem.partNumber ? (
                <Row k="Part no." mono>
                  {bomItem.partNumber}
                </Row>
              ) : null}
              <Row k="Price" mono>
                {bomItem.qty} × ${fmt(bomItem.unitPrice, 2)} = ${fmt(bomItem.qty * bomItem.unitPrice, 2)}
              </Row>
              {bomItem.supplier || bomItem.url ? (
                <Row k="Supplier">
                  {bomItem.url ? (
                    <a href={bomItem.url} target="_blank" rel="noreferrer" className="text-cyan hover:underline">
                      {bomItem.supplier || "link"}
                    </a>
                  ) : (
                    bomItem.supplier
                  )}
                </Row>
              ) : null}
            </>
          ) : (
            <Row k="BOM id" mono>
              {part.bomId} <span className="text-warn">(not found)</span>
            </Row>
          )}
        </Section>
      ) : null}

      {comp ? (
        <Section title="Electronics" right={<span className="font-mono text-[10px] text-ink-faint">{comp.pins?.length ?? 0} pins</span>}>
          <Row k="Component">{comp.name}</Row>
          <Row k="Kind">{comp.kind}</Row>
          {comp.partNumber ? (
            <Row k="Part no." mono>
              {comp.partNumber}
            </Row>
          ) : null}
          {comp.pins?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {comp.pins.map((pin) => (
                <span key={pin.id} title={`${pin.id} · ${pin.type}`} className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-1.5 py-px font-mono text-[10px] text-ink-dim">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: PIN_COLORS[pin.type] ?? "#6b7489" }} />
                  {pin.label || pin.id}
                </span>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="Joints" right={<span className="font-mono text-[10px] text-ink-faint">{related.length}</span>}>
        {related.length === 0 ? <p className="text-ink-faint">Not connected to any part.</p> : null}
        {related.map((j) => {
          const otherId = j.partA === part.id ? j.partB : j.partA;
          const other = byId.get(otherId);
          return (
            <button
              type="button"
              key={j.id}
              onClick={() => other && onSelect(otherId)}
              className="mb-1 block w-full rounded border border-line bg-panel-2 px-2 py-1.5 text-left hover:border-line-strong"
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: JOINT_COLORS[j.type] ?? "#94a3b8" }} />
                <span className="text-[11px] text-ink-dim">{j.type.replace("_", " ")}</span>
                <span className="text-ink-faint">→</span>
                <span className={`min-w-0 flex-1 truncate text-[12px] ${other ? "text-ink" : "text-warn"}`}>{other?.name ?? `${otherId} (missing)`}</span>
              </div>
              {j.fastener ? <div className="mt-0.5 pl-3.5 font-mono text-[10px] text-ink-faint">{j.fastener}</div> : null}
              {j.description ? <div className="mt-0.5 pl-3.5 text-[11px] text-ink-faint">{j.description}</div> : null}
            </button>
          );
        })}
      </Section>
    </div>
  );
}
