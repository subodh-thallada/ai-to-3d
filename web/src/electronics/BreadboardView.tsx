import { memo, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { Netlist } from "./model";
import {
  BB_H,
  BB_ROWS,
  BB_W,
  LETTER_Y,
  RAIL_HOLES,
  RAIL_Y,
  railHoleX,
  resistorBands,
  rowX,
  type BBInline,
  type BBModule,
  type BreadboardLayout,
  type RailId,
} from "./layout";
import { PanZoom, Tip } from "./PanZoom";
import { NetTooltip } from "./SchematicView";

/** Static breadboard body: 830 tie points, rails, labels. Memoised — never re-renders on hover. */
const BoardBody = memo(function BoardBody({ rails, netColor }: { rails: Record<RailId, string | null>; netColor: (id: string) => string }) {
  const holes: React.ReactNode[] = [];
  const hole = (x: number, y: number, key: string) => (
    <rect key={key} x={x - 2.1} y={y - 2.1} width={4.2} height={4.2} rx={0.6} fill="#3b3a36" stroke="#cfc8b4" strokeWidth={0.5} />
  );
  for (let r = 1; r <= BB_ROWS; r++) for (const l of "abcdefghij") holes.push(hole(rowX(r), LETTER_Y[l], `${l}${r}`));
  for (const rid of Object.keys(RAIL_Y) as RailId[]) for (let k = 0; k < RAIL_HOLES; k++) holes.push(hole(railHoleX(k), RAIL_Y[rid], `${rid}${k}`));
  const nums: React.ReactNode[] = [];
  for (let r = 1; r <= BB_ROWS; r++) {
    if (r !== 1 && r % 5 !== 0) continue;
    nums.push(
      <text key={`nt${r}`} x={rowX(r)} y={44} textAnchor="middle" fontSize={5.5} fill="#8a8574" fontFamily="JetBrains Mono, monospace">
        {r}
      </text>,
      <text key={`nb${r}`} x={rowX(r)} y={172} textAnchor="middle" fontSize={5.5} fill="#8a8574" fontFamily="JetBrains Mono, monospace">
        {r}
      </text>,
    );
  }
  const letters = Object.entries(LETTER_Y).flatMap(([l, y]) => [
    <text key={`ll${l}`} x={11} y={y + 2} textAnchor="middle" fontSize={6} fill="#8a8574" fontFamily="JetBrains Mono, monospace">
      {l}
    </text>,
    <text key={`lr${l}`} x={BB_W - 11} y={y + 2} textAnchor="middle" fontSize={6} fill="#8a8574" fontFamily="JetBrains Mono, monospace">
      {l}
    </text>,
  ]);
  const railLine = (y: number, c: string, k: string) => <line key={k} x1={18} x2={BB_W - 18} y1={y} y2={y} stroke={c} strokeWidth={1.2} opacity={0.85} />;
  const railLabel = (rid: RailId) => {
    const n = rails[rid];
    if (!n) return null;
    return (
      <text key={`rl${rid}`} x={BB_W - 4} y={RAIL_Y[rid] + 2} textAnchor="end" fontSize={5.5} fontWeight={700} fill={netColor(n)} fontFamily="JetBrains Mono, monospace">
        {rid[1] === "+" ? "+" : "−"}
      </text>
    );
  };
  return (
    <g>
      <rect x={3} y={5} width={BB_W} height={BB_H} rx={7} fill="#000" opacity={0.35} />
      <rect x={0} y={0} width={BB_W} height={BB_H} rx={7} fill="#efe9d8" stroke="#d6cdb3" strokeWidth={1} />
      <rect x={18} y={101} width={BB_W - 36} height={10} rx={2} fill="#ddd4bb" />
      <rect x={18} y={103} width={BB_W - 36} height={6} rx={1} fill="#cfc5a8" />
      {railLine(8, "#e5484d", "l1")}
      {railLine(34, "#3b82f6", "l2")}
      {railLine(180, "#3b82f6", "l3")}
      {railLine(206, "#e5484d", "l4")}
      <text x={10} y={18} fontSize={7} fontWeight={700} fill="#e5484d" textAnchor="middle">+</text>
      <text x={10} y={28} fontSize={8} fontWeight={700} fill="#3b82f6" textAnchor="middle">−</text>
      <text x={10} y={190} fontSize={8} fontWeight={700} fill="#3b82f6" textAnchor="middle">−</text>
      <text x={10} y={200} fontSize={7} fontWeight={700} fill="#e5484d" textAnchor="middle">+</text>
      {(Object.keys(RAIL_Y) as RailId[]).map(railLabel)}
      {holes}
      {nums}
      {letters}
    </g>
  );
});

function ModuleBoard({ m, active, onPin, onLeave }: { m: BBModule; active: string | null; onPin: (e: React.MouseEvent, netId?: string, label?: string) => void; onLeave: () => void }) {
  const above = m.side === "above";
  return (
    <g>
      <rect x={m.x + 2} y={m.y + 3} width={m.w} height={m.h} rx={4} fill="#000" opacity={0.35} />
      <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={4} fill={m.color} stroke="#0008" strokeWidth={1} />
      <rect x={m.x + 0.5} y={m.y + 0.5} width={m.w - 1} height={m.h - 1} rx={3.5} fill="none" stroke="#ffffff22" strokeWidth={0.8} />
      {[0, 1].map((i) => (
        <circle key={i} cx={i ? m.x + m.w - 6 : m.x + 6} cy={above ? m.y + 6 : m.y + m.h - 6} r={2.2} fill="#0006" stroke="#d4b25b" strokeWidth={0.8} />
      ))}
      <text x={m.x + m.w / 2} y={above ? m.y + 13 : m.y + m.h - 12} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#f8fafc" fontFamily="Inter, system-ui, sans-serif">
        {m.name.slice(0, 32)}
      </text>
      {m.partNumber ? (
        <text x={m.x + m.w / 2} y={above ? m.y + 22 : m.y + m.h - 4} textAnchor="middle" fontSize={6} fill="#ffffffa0" fontFamily="JetBrains Mono, monospace">
          {m.partNumber.slice(0, 36)}
        </text>
      ) : null}
      {m.pins.map((p) => {
        const dim = active && p.netId !== active;
        const ly = above ? p.y - 6 : p.y + 6;
        return (
          <g key={p.pinId} opacity={dim ? 0.45 : 1} onMouseEnter={(e) => onPin(e, p.netId, `${m.name} ${p.label}`)} onMouseMove={(e) => onPin(e, p.netId, `${m.name} ${p.label}`)} onMouseLeave={onLeave} style={{ cursor: "pointer" }}>
            <rect x={p.x - 4.5} y={p.y - 4.5} width={9} height={9} fill="#111" />
            <rect x={p.x - 1.6} y={p.y - 1.6} width={3.2} height={3.2} fill="#d4b25b" />
            <text
              x={p.x + 2}
              y={ly}
              fontSize={5.6}
              fill={p.netId ? "#f1f5f9" : "#ffffff70"}
              fontFamily="JetBrains Mono, monospace"
              textAnchor={above ? "start" : "end"}
              transform={`rotate(-90 ${p.x + 2} ${ly})`}
            >
              {p.label.slice(0, 8)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function InlinePart({ part, dim }: { part: BBInline; dim: boolean }) {
  const pins = part.pins;
  if (!pins.length) return null;
  const legs = (cx: number, cy: number) =>
    pins.map((p) => <line key={p.pinId} x1={p.x} y1={p.y} x2={cx} y2={cy} stroke="#b9bec7" strokeWidth={1.1} strokeLinecap="round" />);
  const holeDots = pins.map((p) => <circle key={`h${p.pinId}`} cx={p.x} cy={p.y} r={1.6} fill="#9ca3af" stroke="#4b5563" strokeWidth={0.4} />);
  const cx = pins.reduce((s, p) => s + p.x, 0) / pins.length;
  const cy = pins.reduce((s, p) => s + p.y, 0) / pins.length;
  let body: React.ReactNode;
  if (pins.length === 2 && (part.shape === "resistor" || part.shape === "diode" || part.shape === "capacitor")) {
    const [a, b] = pins;
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (part.shape === "capacitor") {
      body = (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9bec7" strokeWidth={1} />
          <ellipse cx={mx} cy={my} rx={4.6} ry={3.6} fill="#e0a43a" stroke="#9a6a1a" strokeWidth={0.6} transform={`rotate(${ang} ${mx} ${my})`} />
          <text x={mx} y={my + 1.6} fontSize={3.6} textAnchor="middle" fill="#4a3208" fontFamily="JetBrains Mono, monospace">
            {(part.value ?? "").replace(/F$/i, "").slice(0, 5)}
          </text>
        </>
      );
    } else {
      const L = Math.max(10, Math.min(22, dist - 6));
      const bands = part.shape === "resistor" ? resistorBands(part.value) : [];
      body = (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9bec7" strokeWidth={1} />
          <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
            {part.shape === "resistor" ? (
              <>
                <rect x={-L / 2} y={-2.8} width={L} height={5.6} rx={2.6} fill="#d8c08f" stroke="#a88d5a" strokeWidth={0.5} />
                {bands.map((c, i) => (
                  <rect key={i} x={-L / 2 + 2.4 + i * ((L - 5) / 3.2) + (i === 3 ? 1.2 : 0)} y={-2.8} width={1.5} height={5.6} fill={c} />
                ))}
              </>
            ) : (
              <>
                <rect x={-L / 2} y={-2.6} width={L} height={5.2} rx={1} fill="#1f1f1f" />
                <rect x={L / 2 - 3} y={-2.6} width={1.6} height={5.2} fill="#d1d5db" />
              </>
            )}
          </g>
        </>
      );
    }
  } else if (part.shape === "led") {
    const ox = cx;
    const oy = cy - 7;
    body = (
      <>
        {legs(ox, oy)}
        <circle cx={ox} cy={oy} r={5.4} fill={part.color} opacity={0.35} />
        <circle cx={ox} cy={oy} r={4.2} fill={part.color} stroke="#0004" strokeWidth={0.6} />
        <circle cx={ox - 1.4} cy={oy - 1.4} r={1.3} fill="#fff" opacity={0.7} />
      </>
    );
  } else if (part.shape === "electrolytic") {
    const ox = cx;
    const oy = cy;
    body = (
      <>
        {legs(ox, oy)}
        <circle cx={ox} cy={oy} r={6} fill="#1e3a8a" stroke="#0b1d4d" strokeWidth={0.7} />
        <path d={`M${ox + 2.5},${oy - 5.4} A6,6 0 0 1 ${ox + 2.5},${oy + 5.4}`} fill="none" stroke="#cbd5e1" strokeWidth={1.4} />
        <circle cx={ox} cy={oy} r={3} fill="none" stroke="#94a3b8" strokeWidth={0.4} />
      </>
    );
  } else if (part.shape === "button") {
    body = (
      <>
        {legs(cx, cy)}
        <rect x={cx - 7} y={cy - 7} width={14} height={14} rx={1.2} fill="#2b2b2b" stroke="#111" strokeWidth={0.6} />
        <circle cx={cx} cy={cy} r={4.2} fill="#4b4b4b" stroke="#111" strokeWidth={0.5} />
        <circle cx={cx - 1} cy={cy - 1} r={1.6} fill="#6b6b6b" />
      </>
    );
  } else {
    body = (
      <>
        {legs(cx, cy - 6)}
        <rect x={cx - 11} y={cy - 12} width={22} height={11} rx={1.5} fill="#1f2937" stroke="#0b0f17" strokeWidth={0.6} />
        <text x={cx} y={cy - 4.8} fontSize={4} textAnchor="middle" fill="#e5e7eb" fontFamily="JetBrains Mono, monospace">
          {part.name.slice(0, 9)}
        </text>
      </>
    );
  }
  return (
    <g opacity={dim ? 0.3 : 1}>
      {holeDots}
      {body}
    </g>
  );
}

interface Hover {
  x: number;
  y: number;
  netId?: string;
  wire?: string;
  label?: string;
}

export function BreadboardView({ netlist, layout, fw }: { netlist: Netlist; layout: BreadboardLayout; fw: Map<string, string[]> }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const active = hover?.netId ?? pinned;
  const netColor = useMemo(() => (id: string) => netlist.netById.get(id)?.color ?? "#9ca3af", [netlist]);
  const partsByNet = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of layout.inlines) m.set(p.compId, new Set(p.pins.map((x) => x.netId ?? "")));
    return m;
  }, [layout]);

  const at = (e: React.MouseEvent, h: Omit<Hover, "x" | "y">) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ ...h, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const hovNet = hover?.netId ? netlist.netById.get(hover.netId) : undefined;
  const hoveredWire = hover?.wire ? layout.wires.find((w) => w.id === hover.wire) : undefined;

  const legendRails = (Object.keys(layout.rails) as RailId[]).filter((r) => layout.rails[r]);

  const hotWire = hover?.wire;
  // drawing only depends on the highlighted net / wire, so tooltip moves do not re-render it
  const content = useMemo(
    () => (
      <>
            {/* strip highlight for the active net */}
            {active
              ? layout.strips
                  .filter((s) => s.netId === active)
                  .map((s) => (
                    <rect
                      key={`hl${s.half}${s.row}`}
                      x={rowX(s.row) - 4.5}
                      y={s.half === "top" ? LETTER_Y.j - 5 : LETTER_Y.e - 5}
                      width={9}
                      height={50}
                      rx={2}
                      fill={netlist.netById.get(active)?.color ?? "#fff"}
                      opacity={0.28}
                    />
                  ))
              : null}
            {active
              ? (Object.keys(layout.rails) as RailId[])
                  .filter((r) => layout.rails[r] === active)
                  .map((r) => <rect key={`hr${r}`} x={rowX(2) - 5} y={RAIL_Y[r] - 4.5} width={rowX(60) - rowX(2) + 10} height={9} rx={2} fill={netColor(active)} opacity={0.25} />)
              : null}
            {layout.modules.map((m) => (
              <ModuleBoard key={m.compId} m={m} active={active} onPin={(e, netId, label) => at(e, { netId, label })} onLeave={() => setHover(null)} />
            ))}
            {layout.inlines.map((p) => (
              <g key={p.compId} onMouseMove={(e) => at(e, { netId: p.pins[0]?.netId, label: `${p.name}${p.value ? ` (${p.value})` : ""}` })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <InlinePart part={p} dim={!!active && !partsByNet.get(p.compId)?.has(active)} />
              </g>
            ))}
            {/* wires on top */}
            {layout.wires.map((w) => {
              const on = !active || w.netId === active;
              const hot = hotWire === w.id;
              return (
                <g
                  key={w.id}
                  opacity={on ? 1 : 0.1}
                  onMouseEnter={(e) => at(e, { netId: w.netId, wire: w.id })}
                  onMouseMove={(e) => at(e, { netId: w.netId, wire: w.id })}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinned((p) => (p === w.netId ? null : w.netId));
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <path d={w.path} fill="none" stroke="transparent" strokeWidth={7} />
                  <path d={w.path} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={hot ? 4.4 : 3.2} strokeLinecap="round" />
                  <path d={w.path} fill="none" stroke={w.color} strokeWidth={hot ? 3 : 2} strokeLinecap="round" />
                  <path d={w.path} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={0.6} strokeLinecap="round" transform="translate(-0.4,-0.4)" />
                  <rect x={w.to.x - 1.8} y={w.to.y - 1.8} width={3.6} height={3.6} fill="#9ca3af" stroke="#222" strokeWidth={0.4} />
                  {w.kind !== "module" ? <rect x={w.from.x - 1.8} y={w.from.y - 1.8} width={3.6} height={3.6} fill="#9ca3af" stroke="#222" strokeWidth={0.4} /> : null}
                </g>
              );
            })}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, netlist, active, hotWire, partsByNet, netColor],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {layout.pcbOnly ? (
        <div className="flex items-start gap-2 border-b border-line bg-cyan/5 px-3 py-2 text-[11.5px] text-ink-dim">
          <Info size={14} className="mt-px shrink-0 text-cyan" />
          <span>
            This design is intended for a <span className="text-ink">custom PCB</span> — every component is PCB-mounted. Below is a dev-kit style breadboard
            prototype of the same netlist (each part shown as a breakout board) so the circuit can be validated before layout.
          </span>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div ref={wrap} className="relative min-w-0 flex-1" onMouseLeave={() => setHover(null)}>
          <PanZoom
            bounds={layout.bounds}
            onBackgroundClick={() => setPinned(null)}
            background="radial-gradient(circle, #1a1f2a 1px, transparent 1px) 0 0 / 18px 18px, #0d1016"
            overlay={
              hover && hover.x >= 0 && (hovNet || hover.label) ? (
                <Tip x={hover.x} y={hover.y} containerW={wrap.current?.clientWidth}>
                  {hoveredWire ? <div className="mb-1.5 border-b border-line pb-1.5 font-mono text-[11px] text-ink">{hoveredWire.label}</div> : null}
                  {!hoveredWire && hover.label ? <div className="mb-1 font-mono text-[11px] text-accent">{hover.label}</div> : null}
                  {hovNet ? <NetTooltip net={hovNet} fw={fw} /> : <div className="text-ink-faint">not connected</div>}
                  {hovNet ? <div className="mt-1 text-[10.5px] text-ink-dim">breadboard: {layout.netLocation.get(hovNet.id)}</div> : null}
                </Tip>
              ) : null
            }
          >
            <BoardBody rails={layout.rails} netColor={netColor} />
            {content}
          </PanZoom>
          <div className="pointer-events-none absolute top-2 left-2 rounded border border-line bg-panel/80 px-2 py-1 text-[10.5px] text-ink-faint backdrop-blur">
            830 tie-point breadboard · hover a wire for its route · click to pin a net
          </div>
        </div>
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-l border-line bg-panel text-[11.5px]">
          <div className="border-b border-line p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-dim uppercase">Rails</div>
            {legendRails.length ? (
              legendRails.map((r) => {
                const n = netlist.netById.get(layout.rails[r]!)!;
                return (
                  <div key={r} className="flex items-center gap-2 py-0.5">
                    <span className="w-24 text-ink-faint">{r[0] === "T" ? "top" : "bottom"} {r[1] === "+" ? "+" : "−"}</span>
                    <span className="h-2 w-2 rounded-sm" style={{ background: n.display }} />
                    <span className="font-mono text-ink">{n.name}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-ink-faint">No power nets</div>
            )}
          </div>
          <div className="border-b border-line p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-dim uppercase">Strips</div>
            {netlist.nets
              .filter((n) => layout.strips.some((s) => s.netId === n.id))
              .map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onMouseEnter={() => setHover({ x: -999, y: -999, netId: n.id })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setPinned((p) => (p === n.id ? null : n.id))}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-panel-2 ${pinned === n.id ? "bg-panel-3" : ""}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: n.display }} />
                  <span className="min-w-0 flex-1 truncate font-mono text-ink">{n.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">{layout.netLocation.get(n.id)}</span>
                </button>
              ))}
          </div>
          <div className="p-2.5 text-[11px] text-ink-faint">
            {layout.wires.filter((w) => w.kind === "module").length} jumper wires · {layout.inlines.length} parts on board · {layout.modules.length} modules
            {layout.warnings.length ? (
              <div className="mt-2 space-y-1">
                {layout.warnings.slice(0, 12).map((w, i) => (
                  <div key={i} className="text-warn">
                    {w}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
