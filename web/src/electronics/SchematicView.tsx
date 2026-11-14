import { useMemo, useRef, useState } from "react";
import type { NetType } from "@protoforge/shared";
import { fmtV, nodeLabel, type Netlist, type RNet } from "./model";
import { layoutSchematic, type SchPin } from "./schematicLayout";
import { PanZoom, Tip } from "./PanZoom";

const NET_TYPES: NetType[] = ["power", "ground", "signal", "bus", "motor", "data"];

interface Hover {
  netId?: string;
  pinKey?: string;
  x: number;
  y: number;
}

export function NetTooltip({ net, fw, pinKey, pinLoc }: { net: RNet; fw: Map<string, string[]>; pinKey?: string; pinLoc?: string }) {
  const fnHere = pinKey ? fw.get(pinKey) : undefined;
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: net.display }} />
        <span className="font-mono font-semibold">{net.name}</span>
        <span className="text-ink-faint">{net.type}</span>
        {net.voltage !== undefined ? <span className="font-mono text-warn">{fmtV(net.voltage)}</span> : null}
      </div>
      {fnHere?.length ? <div className="mt-1 text-cyan">fw: {fnHere.join("; ")}</div> : null}
      {pinLoc ? <div className="mt-0.5 text-ink-dim">breadboard: {pinLoc}</div> : null}
      <div className="mt-1.5 space-y-0.5">
        {net.nodes.slice(0, 14).map((n) => {
          const f = fw.get(`${n.component}::${n.pin}`);
          return (
            <div key={n.component + n.pin} className="flex gap-1.5 font-mono text-[10.5px]">
              <span className="text-ink-dim">{n.comp.name}</span>
              <span className="text-ink">{n.pinDef.label}</span>
              {f?.length ? <span className="truncate text-cyan/80">· {f[0]}</span> : null}
            </div>
          );
        })}
        {net.nodes.length > 14 ? <div className="text-ink-faint">+{net.nodes.length - 14} more</div> : null}
      </div>
      {net.net.notes ? <div className="mt-1.5 text-ink-faint">{net.net.notes}</div> : null}
    </div>
  );
}

export function SchematicView({ netlist, fw }: { netlist: Netlist; fw: Map<string, string[]> }) {
  const layout = useMemo(() => layoutSchematic(netlist), [netlist]);
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [types, setTypes] = useState<Set<NetType>>(new Set());
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const active = hover?.netId ?? pinned ?? null;
  const typeActive = types.size > 0;
  const netVisible = (id?: string) => {
    if (!id) return !active && !typeActive;
    if (active) return id === active;
    if (typeActive) return types.has(netlist.netById.get(id)!.type);
    return true;
  };
  const dimmed = !!active || typeActive;
  const netsInBlock = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const b of layout.blocks) m.set(b.comp.id, new Set(b.pins.map((p) => p.netId).filter(Boolean) as string[]));
    return m;
  }, [layout]);

  const setHoverAt = (e: React.MouseEvent, netId?: string, pk?: string) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ netId, pinKey: pk, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const evts = (netId?: string, pk?: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHoverAt(e, netId, pk),
    onMouseMove: (e: React.MouseEvent) => setHoverAt(e, netId, pk),
    onMouseLeave: () => setHover(null),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (netId) setPinned((p) => (p === netId ? null : netId));
    },
    style: { cursor: netId ? "pointer" : "default" },
  });

  const legendNets = netlist.nets.filter(
    (n) => (!typeActive || types.has(n.type)) && (!query || n.name.toLowerCase().includes(query.toLowerCase())),
  );
  const hovNet = hover?.netId ? netlist.netById.get(hover.netId) : undefined;
  const hovPin: SchPin | undefined = hover?.pinKey ? layout.blocks.flatMap((b) => b.pins).find((p) => p.key === hover.pinKey) : undefined;

  // SVG content only depends on the highlighted net, so tooltip moves do not re-render the drawing
  const content = useMemo(
    () => (
      <>
            {/* wires */}
            {layout.wires.map((w, i) => {
              const net = netlist.netById.get(w.netId)!;
              const on = netVisible(w.netId);
              const pts = w.points.map((p) => p.join(",")).join(" ");
              return (
                <g key={`w${i}`} opacity={dimmed && !on ? 0.12 : 1} {...evts(w.netId)}>
                  <polyline points={pts} fill="none" stroke="transparent" strokeWidth={8} />
                  <polyline points={pts} fill="none" stroke={net.display} strokeWidth={active === w.netId ? 2.4 : 1.4} strokeLinejoin="round" />
                </g>
              );
            })}
            {/* blocks */}
            {layout.blocks.map((b) => {
              const touches = active ? netsInBlock.get(b.comp.id)?.has(active) : true;
              return (
                <g key={b.comp.id} opacity={active && !touches ? 0.35 : 1}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="#151a24" stroke={b.comp.kind === "mcu" ? "#ff7a1a" : "#3a4256"} strokeWidth={1} />
                  <text x={b.x + b.w / 2} y={b.titleY} textAnchor="middle" fill="#e6e9ef" fontSize={11.5} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
                    {b.comp.name.slice(0, 30)}
                  </text>
                  {b.comp.partNumber ? (
                    <text x={b.x + b.w / 2} y={b.titleY + 13} textAnchor="middle" fill="#8a93a8" fontSize={9.5} fontFamily="JetBrains Mono, monospace">
                      {b.comp.partNumber.slice(0, 32)}
                    </text>
                  ) : null}
                  {b.comp.value ? (
                    <text x={b.x + b.w / 2} y={b.titleY + (b.comp.partNumber ? 26 : 13)} textAnchor="middle" fill="#ffb36b" fontSize={9.5} fontFamily="JetBrains Mono, monospace">
                      {b.comp.value}
                    </text>
                  ) : null}
                  <text x={b.x + 4} y={b.y - 4} fill="#6b7489" fontSize={8.5} fontFamily="JetBrains Mono, monospace">
                    {b.pins.some((p) => p.side === "top") ? "" : b.comp.id}
                  </text>
                  {b.pins.map((p) => {
                    const net = p.netId ? netlist.netById.get(p.netId) : undefined;
                    const on = netVisible(p.netId);
                    const col = net ? net.display : "#4b5368";
                    const lbl = p.pin.label.slice(0, 14);
                    let tx = p.ax;
                    let ty = p.ay + 3.2;
                    let anchor: "start" | "end" | "middle" = "middle";
                    if (p.side === "left") (tx = p.ax + 5, (anchor = "start"));
                    else if (p.side === "right") (tx = p.ax - 5, (anchor = "end"));
                    else if (p.side === "top") ty = p.ay + 11;
                    else ty = p.ay - 5;
                    const hit =
                      p.side === "left" || p.side === "right"
                        ? { x: Math.min(p.x, p.ax) - 2, y: p.y - 7, w: STUB_HIT + lbl.length * 6, h: 14 }
                        : { x: p.x - 10, y: Math.min(p.y, p.ay) - 2, w: 20, h: 24 };
                    if (p.side === "right") hit.x = p.ax - lbl.length * 6 - 6;
                    return (
                      <g key={p.key} opacity={dimmed && !on ? 0.25 : 1} {...evts(p.netId, p.key)}>
                        <line x1={p.ax} y1={p.ay} x2={p.x} y2={p.y} stroke={col} strokeWidth={active && active === p.netId ? 2 : 1.2} />
                        <circle cx={p.x} cy={p.y} r={1.6} fill={col} />
                        {p.conn === "nc" ? (
                          <path d={`M${p.x - 3},${p.y - 3}l6,6m0,-6l-6,6`} stroke="#6b7489" strokeWidth={1} />
                        ) : null}
                        <text x={tx} y={ty} textAnchor={anchor} fontSize={p.side === "top" || p.side === "bottom" ? 8.5 : 9.5} fill={fw.has(p.key) ? "#7dd3fc" : "#b7bfd0"} fontFamily="JetBrains Mono, monospace">
                          {lbl}
                        </text>
                        <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" />
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {/* net flags */}
            {layout.flags.map((f) => {
              const net = netlist.netById.get(f.netId)!;
              const on = netVisible(f.netId);
              const d = f.side === "right" ? 1 : -1;
              const x0 = f.x + d * 2;
              const pts = [
                [x0, f.y],
                [x0 + d * 6, f.y - 7],
                [x0 + d * f.w, f.y - 7],
                [x0 + d * f.w, f.y + 7],
                [x0 + d * 6, f.y + 7],
              ]
                .map((p) => p.join(","))
                .join(" ");
              return (
                <g key={`f${f.pinKey}`} opacity={dimmed && !on ? 0.12 : 1} {...evts(f.netId, f.pinKey)}>
                  <polygon points={pts} fill={net.display} fillOpacity={active === f.netId ? 0.32 : 0.14} stroke={net.display} strokeWidth={1} />
                  <text x={x0 + d * (6 + (f.w - 6) / 2)} y={f.y + 3.2} textAnchor="middle" fontSize={9} fill={net.display} fontFamily="JetBrains Mono, monospace" fontWeight={600}>
                    {f.label.slice(0, 22)}
                  </text>
                </g>
              );
            })}
            {/* power / ground symbols */}
            {layout.symbols.map((s) => {
              const net = netlist.netById.get(s.netId)!;
              const on = netVisible(s.netId);
              return (
                <g key={`s${s.pinKey}`} opacity={dimmed && !on ? 0.12 : 1} {...evts(s.netId, s.pinKey)}>
                  {s.kind === "ground" ? (
                    <>
                      <line x1={s.x} y1={s.y} x2={s.x} y2={s.y + 4} stroke={net.display} strokeWidth={1.2} />
                      <line x1={s.x - 7} y1={s.y + 4} x2={s.x + 7} y2={s.y + 4} stroke={net.display} strokeWidth={1.4} />
                      <line x1={s.x - 4.5} y1={s.y + 7} x2={s.x + 4.5} y2={s.y + 7} stroke={net.display} strokeWidth={1.4} />
                      <line x1={s.x - 2} y1={s.y + 10} x2={s.x + 2} y2={s.y + 10} stroke={net.display} strokeWidth={1.4} />
                      {s.label.toUpperCase() !== "GND" ? (
                        <text x={s.x} y={s.y + 19} textAnchor="middle" fontSize={7.5} fill={net.display} fontFamily="JetBrains Mono, monospace">
                          {s.label}
                        </text>
                      ) : null}
                      <rect x={s.x - 8} y={s.y} width={16} height={14} fill="transparent" />
                    </>
                  ) : (
                    <>
                      <line x1={s.x - 7} y1={s.y} x2={s.x + 7} y2={s.y} stroke={net.display} strokeWidth={1.6} />
                      <path d={`M${s.x},${s.y - 9} l-3.5,5 h7 z`} fill={net.display} />
                      <line x1={s.x} y1={s.y} x2={s.x} y2={s.y - 4} stroke={net.display} strokeWidth={1.2} />
                      <text x={s.x} y={s.y - 12} textAnchor="middle" fontSize={8.5} fontWeight={600} fill={net.display} fontFamily="JetBrains Mono, monospace">
                        {s.label.slice(0, 14)}
                      </text>
                      <rect x={s.x - 14} y={s.y - 22} width={28} height={24} fill="transparent" />
                    </>
                  )}
                </g>
              );
            })}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, netlist, active, types, fw, netsInBlock],
  );

  return (
    <div className="flex h-full min-h-0 w-full">
      <div ref={wrap} className="relative min-w-0 flex-1">
        <PanZoom
          bounds={layout.bounds}
          onBackgroundClick={() => setPinned(null)}
          background="radial-gradient(circle, #1a1f2a 1px, transparent 1px) 0 0 / 16px 16px, #0d1016"
          overlay={
            hover && hover.x >= 0 && (hovNet || hovPin) ? (
              <Tip x={hover.x} y={hover.y} containerW={wrap.current?.clientWidth}>
                {hovPin ? (
                  <div className="mb-1 border-b border-line pb-1 font-mono text-[11px]">
                    <span className="text-ink-dim">{netlist.compById.get(hovPin.comp)?.name}</span> <span className="text-accent">{hovPin.pin.label}</span>{" "}
                    <span className="text-ink-faint">({hovPin.pin.type})</span>
                    {!hovNet && fw.get(hovPin.key)?.length ? <div className="text-cyan">fw: {fw.get(hovPin.key)!.join("; ")}</div> : null}
                  </div>
                ) : null}
                {hovNet ? <NetTooltip net={hovNet} fw={fw} pinKey={hover.pinKey} /> : <div className="text-ink-faint">not connected</div>}
              </Tip>
            ) : null
          }
        >
          {content}
        </PanZoom>
        <div className="pointer-events-none absolute top-2 left-2 rounded border border-line bg-panel/80 px-2 py-1 text-[10.5px] text-ink-faint backdrop-blur">
          drag to pan · wheel to zoom · click a pin or net to pin highlight
        </div>
      </div>
      {/* legend */}
      <aside className="flex w-60 shrink-0 flex-col border-l border-line bg-panel">
        <div className="border-b border-line p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide text-ink-dim uppercase">Nets</span>
            <span className="font-mono text-[10px] text-ink-faint">
              {legendNets.length}/{netlist.nets.length}
            </span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter nets…"
            className="mb-1.5 w-full rounded border border-line bg-panel-2 px-2 py-1 text-[11.5px] text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
          />
          <div className="flex flex-wrap gap-1">
            {NET_TYPES.filter((t) => netlist.nets.some((n) => n.type === t)).map((t) => {
              const on = types.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTypes((s) => {
                      const n = new Set(s);
                      if (n.has(t)) n.delete(t);
                      else n.add(t);
                      return n;
                    })
                  }
                  className={`rounded border px-1.5 py-0.5 text-[10.5px] ${on ? "border-accent/60 bg-accent/15 text-accent" : "border-line text-ink-dim hover:border-line-strong"}`}
                >
                  {t} <span className="text-ink-faint">{netlist.nets.filter((n) => n.type === t).length}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {legendNets.map((n) => (
            <button
              key={n.id}
              type="button"
              onMouseEnter={() => setHover({ netId: n.id, x: -999, y: -999 })}
              onMouseLeave={() => setHover(null)}
              onClick={() => setPinned((p) => (p === n.id ? null : n.id))}
              className={`flex w-full items-center gap-2 px-2.5 py-1 text-left text-[11.5px] hover:bg-panel-2 ${pinned === n.id ? "bg-panel-3" : ""}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: n.display }} />
              <span className="min-w-0 flex-1 truncate font-mono text-ink">{n.name}</span>
              {n.voltage !== undefined && n.type !== "ground" ? <span className="font-mono text-[10px] text-warn">{fmtV(n.voltage)}</span> : null}
              <span className="font-mono text-[10px] text-ink-faint">{n.nodes.length}</span>
              {n.dropped.length ? <span title={`${n.dropped.length} unknown node(s)`} className="text-[10px] text-bad">!</span> : null}
            </button>
          ))}
        </div>
        {pinned && netlist.netById.get(pinned) ? (
          <div className="max-h-[45%] overflow-y-auto border-t border-line p-2.5">
            <NetTooltip net={netlist.netById.get(pinned)!} fw={fw} />
            <div className="mt-2 text-[10px] text-ink-faint">{netlist.netById.get(pinned)!.nodes.map(nodeLabel).length} connections</div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

const STUB_HIT = 26;
