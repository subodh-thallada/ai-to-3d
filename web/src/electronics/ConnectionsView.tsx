import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Download } from "lucide-react";
import type { ElectronicsSpec } from "@protoforge/shared";
import { fmtV, pinKey, type Netlist, type RNode } from "./model";
import type { BreadboardLayout } from "./layout";

interface WireRow {
  id: string;
  from: string;
  to: string;
  net: string;
  netId: string;
  type: string;
  color: string;
  display: string;
  gauge: string;
  hole: string;
}

type SortKey = "from" | "to" | "net" | "type" | "gauge" | "hole";

/** Hub node of a net: power source first, then MCU pin, then first node. */
function hubOf(nodes: RNode[]): RNode {
  return (
    nodes.find((n) => n.pinDef.type === "power_out") ??
    nodes.find((n) => n.comp.kind === "mcu") ??
    nodes.find((n) => n.comp.mount !== "breadboard") ??
    nodes[0]
  );
}

function csvCell(s: string) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ConnectionsView({ netlist, layout, spec, fw }: { netlist: Netlist; layout: BreadboardLayout; spec: ElectronicsSpec; fw: Map<string, string[]> }) {
  const [section, setSection] = useState<"parts" | "table" | "steps">("parts");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "net", dir: 1 });
  const [done, setDone] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");

  const rows = useMemo<WireRow[]>(() => {
    const out: WireRow[] = [];
    for (const n of netlist.nets) {
      if (n.nodes.length < 2) continue;
      const hub = hubOf(n.nodes);
      for (const node of n.nodes) {
        if (node === hub) continue;
        const a = layout.pinLocation.get(pinKey(hub.component, hub.pin)) ?? layout.netLocation.get(n.id) ?? "";
        const b = layout.pinLocation.get(pinKey(node.component, node.pin)) ?? layout.netLocation.get(n.id) ?? "";
        out.push({
          id: `${n.id}:${node.component}.${node.pin}`,
          from: `${hub.comp.name} ${hub.pinDef.label}`,
          to: `${node.comp.name} ${node.pinDef.label}`,
          net: n.name,
          netId: n.id,
          type: n.type,
          color: n.net.color ?? n.color,
          display: n.display,
          gauge: n.net.wireGauge ?? "",
          hole: a === b ? a : `${a} → ${b}`,
        });
      }
    }
    return out;
  }, [netlist, layout]);

  const sorted = useMemo(() => {
    const q = filter.toLowerCase();
    const f = q ? rows.filter((r) => `${r.from} ${r.to} ${r.net}`.toLowerCase().includes(q)) : rows;
    return [...f].sort((a, b) => a[sort.key].localeCompare(b[sort.key], undefined, { numeric: true }) * sort.dir);
  }, [rows, sort, filter]);

  const exportCsv = () => {
    const head = ["From", "To", "Net", "Type", "Wire colour", "Gauge", "Breadboard"];
    const lines = [head.join(","), ...sorted.map((r) => [r.from, r.to, r.net, r.type, r.color, r.gauge, r.hole].map(csvCell).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wiring.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const th = (key: SortKey, label: string) => (
    <th className="sticky top-0 z-10 border-b border-line bg-panel-2 px-2 py-1.5 text-left font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-ink-dim hover:text-ink"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
      >
        {label}
        {sort.key === key ? sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : null}
      </button>
    </th>
  );

  const steps = spec.wiringSteps ?? [];
  const safety = spec.safetyNotes ?? [];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center gap-1 border-b border-line bg-panel px-3 py-1.5">
        {(
          [
            ["parts", `Per component (${netlist.components.length})`],
            ["table", `Wiring table (${rows.length})`],
            ["steps", `Wiring steps (${done.size}/${steps.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSection(k)}
            className={`rounded px-2 py-1 text-[11.5px] ${section === k ? "bg-panel-3 text-ink" : "text-ink-dim hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        {section !== "steps" ? (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-44 rounded border border-line bg-panel-2 px-2 py-1 text-[11.5px] text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
          />
        ) : null}
        {section === "table" ? (
          <button type="button" onClick={exportCsv} className="ml-1 inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11.5px] text-ink-dim hover:border-line-strong hover:text-ink">
            <Download size={12} /> CSV
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {safety.length && section !== "table" ? (
          <div className="space-y-1.5 px-3 pt-3">
            {safety.map((s, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-[11.5px] text-ink-dim">
                <AlertTriangle size={13} className="mt-px shrink-0 text-warn" />
                <span>{s}</span>
              </div>
            ))}
          </div>
        ) : null}

        {section === "parts" ? (
          <div className="grid grid-cols-1 gap-3 p-3 xl:grid-cols-2 2xl:grid-cols-3">
            {netlist.components
              .filter((c) => {
                const q = filter.toLowerCase();
                return !q || `${c.name} ${c.id} ${c.partNumber ?? ""}`.toLowerCase().includes(q);
              })
              .map((c) => (
                <div key={c.id} className="overflow-hidden rounded-md border border-line bg-panel">
                  <div className="flex items-baseline gap-2 border-b border-line bg-panel-2 px-3 py-2">
                    <span className="font-mono text-[10.5px] text-ink-faint">{c.id}</span>
                    <span className="truncate text-[12.5px] font-semibold text-ink">{c.name}</span>
                    {c.value ? <span className="font-mono text-[11px] text-accent-2">{c.value}</span> : null}
                    <span className="flex-1" />
                    <span className="shrink-0 rounded border border-line px-1.5 text-[10px] text-ink-faint">{c.mount}</span>
                    <span className="shrink-0 text-[10.5px] text-ink-faint">{c.kind}</span>
                  </div>
                  {c.partNumber ? <div className="px-3 pt-1.5 font-mono text-[10.5px] text-ink-faint">{c.partNumber}</div> : null}
                  {c.pins.length === 0 ? (
                    <div className="px-3 py-2 text-[11.5px] text-ink-faint">No electrical pins.</div>
                  ) : (
                    <table className="w-full text-[11.5px]">
                      <tbody>
                        {c.pins.map((p) => {
                          const k = pinKey(c.id, p.id);
                          const nid = netlist.pinNet.get(k);
                          const net = nid ? netlist.netById.get(nid) : undefined;
                          const others = net ? net.nodes.filter((n) => !(n.component === c.id && n.pin === p.id)) : [];
                          const fn = fw.get(k);
                          return (
                            <tr key={p.id} className="border-t border-line/60 align-top">
                              <td className="w-20 py-1 pr-1 pl-3 font-mono text-ink">{p.label}</td>
                              <td className="w-6 py-1.5">
                                {net ? <span className="block h-2.5 w-2.5 rounded-full border border-black/40" style={{ background: net.color }} title={net.net.color ?? net.color} /> : null}
                              </td>
                              <td className="py-1 pr-2">
                                {net ? (
                                  <>
                                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                                      <span className="font-mono font-medium" style={{ color: net.display }}>
                                        {net.name}
                                      </span>
                                      {net.voltage !== undefined && net.type !== "ground" ? <span className="font-mono text-[10px] text-warn">{fmtV(net.voltage)}</span> : null}
                                      {net.net.wireGauge ? <span className="text-[10px] text-ink-faint">{net.net.wireGauge}</span> : null}
                                    </div>
                                    <div className="text-ink-dim">
                                      {others.length ? (
                                        <>
                                          → {others.slice(0, 6).map((o) => `${o.comp.name} ${o.pinDef.label}`).join(", ")}
                                          {others.length > 6 ? <span className="text-ink-faint"> +{others.length - 6} more</span> : null}
                                        </>
                                      ) : (
                                        <span className="text-ink-faint">no other connection</span>
                                      )}
                                    </div>
                                    {fn?.length ? <div className="text-[10.5px] text-cyan">fw: {fn.join("; ")}</div> : null}
                                  </>
                                ) : (
                                  <span className="text-ink-faint">{p.type === "nc" ? "not connected (NC)" : "unconnected"}</span>
                                )}
                              </td>
                              <td className="w-28 py-1 pr-3 text-right font-mono text-[10.5px] text-ink-faint">{layout.pinLocation.get(k) ?? ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
          </div>
        ) : null}

        {section === "table" ? (
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr>
                {th("from", "From")}
                {th("to", "To")}
                {th("net", "Net")}
                {th("type", "Type")}
                <th className="sticky top-0 z-10 border-b border-line bg-panel-2 px-2 py-1.5 text-left font-medium text-ink-dim">Colour</th>
                {th("gauge", "Gauge")}
                {th("hole", "Breadboard")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-line/60 hover:bg-panel-2">
                  <td className="px-2 py-1 font-mono text-ink">{r.from}</td>
                  <td className="px-2 py-1 font-mono text-ink">{r.to}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: r.display }}>
                    {r.net}
                  </td>
                  <td className="px-2 py-1 text-ink-dim">{r.type}</td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1.5 text-ink-dim">
                      <span className="h-2.5 w-5 rounded-sm border border-black/40" style={{ background: netlist.netById.get(r.netId)?.color }} />
                      {r.color}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-ink-dim">{r.gauge}</td>
                  <td className="px-2 py-1 font-mono text-[10.5px] text-ink-faint">{r.hole}</td>
                </tr>
              ))}
              {!sorted.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink-faint">
                    No point-to-point connections.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}

        {section === "steps" ? (
          <div className="mx-auto max-w-3xl p-3">
            {steps.length ? (
              <ol className="space-y-1.5">
                {steps.map((s, i) => {
                  const on = done.has(i);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() =>
                          setDone((d) => {
                            const n = new Set(d);
                            if (n.has(i)) n.delete(i);
                            else n.add(i);
                            return n;
                          })
                        }
                        className={`flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left text-[12px] ${on ? "border-ok/30 bg-ok/5 text-ink-faint" : "border-line bg-panel text-ink hover:border-line-strong"}`}
                      >
                        <span className={`mt-px grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-ok bg-ok text-bg" : "border-line-strong"}`}>{on ? <Check size={11} strokeWidth={3} /> : null}</span>
                        <span className="w-5 shrink-0 font-mono text-[11px] text-ink-faint">{i + 1}.</span>
                        <span className={on ? "line-through decoration-ink-faint/60" : ""}>{s}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="py-6 text-center text-[12px] text-ink-faint">No wiring steps provided.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
