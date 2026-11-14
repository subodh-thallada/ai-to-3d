import { useMemo } from "react";
import { BatteryMedium, Zap } from "lucide-react";
import type { BomItem, ElectronicsSpec } from "@protoforge/shared";
import { fmtV, type Netlist } from "./model";

interface Battery {
  name: string;
  capacityMah: number;
  voltage: number | null;
  source: string;
}

const BATTERY_RE = /batter|li-?ion|li-?po|lipo|18650|21700|cell|nimh|alkaline|\bAA\b|\bAAA\b|pack/i;

function parseCapacity(text: string): number | null {
  const mah = /(\d+(?:\.\d+)?)\s*mah/i.exec(text);
  if (mah) return Number(mah[1]);
  const ah = /(\d+(?:\.\d+)?)\s*ah\b/i.exec(text);
  if (ah) return Number(ah[1]) * 1000;
  const wh = /(\d+(?:\.\d+)?)\s*wh\b/i.exec(text);
  if (wh) return -Number(wh[1]); // negative => Wh, converted later
  return null;
}
function parseVoltage(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*v\b/i.exec(text);
  if (m) return Number(m[1]);
  const s = /(\d)s\b/i.exec(text);
  if (s) return Number(s[1]) * 3.7;
  return null;
}

/** Best-effort battery detection from BOM specs, then from electronics components. */
export function findBattery(bom: BomItem[] | undefined, nl: Netlist): Battery | null {
  for (const b of bom ?? []) {
    const text = `${b.name} ${b.partNumber ?? ""} ${b.notes ?? ""} ${Object.entries(b.specs ?? {})
      .map(([k, v]) => `${k} ${v}`)
      .join(" ")}`;
    if (!BATTERY_RE.test(text) || (b.category !== "power" && !/batter|li-?ion|lipo|18650/i.test(text))) continue;
    let cap = parseCapacity(text);
    if (cap === null) continue;
    const v = parseVoltage(text);
    if (cap < 0) {
      if (!v) continue;
      cap = (-cap * 1000) / v;
    }
    return { name: b.name, capacityMah: cap, voltage: v, source: "BOM" };
  }
  for (const c of nl.components) {
    const text = `${c.name} ${c.partNumber ?? ""} ${c.value ?? ""} ${c.description ?? ""}`;
    if (!BATTERY_RE.test(text)) continue;
    let cap = parseCapacity(text);
    if (cap === null) continue;
    const v = parseVoltage(text);
    if (cap < 0) {
      if (!v) continue;
      cap = (-cap * 1000) / v;
    }
    return { name: c.name, capacityMah: cap, voltage: v, source: "component" };
  }
  return null;
}

function fmtDuration(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
  return `${(h / 24).toFixed(1)} days`;
}

export function PowerView({ spec, netlist, bom }: { spec: ElectronicsSpec; netlist: Netlist; bom?: BomItem[] }) {
  const data = useMemo(() => {
    const rows = (spec.powerBudget ?? [])
      .filter((r) => r && typeof r.currentMa === "number")
      .map((r) => {
        const comp = netlist.compById.get(r.component) ?? netlist.components.find((c) => c.name.toLowerCase() === String(r.component).toLowerCase());
        const v = Number(r.voltage) || 0;
        const ma = Math.max(0, Number(r.currentMa) || 0);
        return { name: comp?.name ?? r.component, id: comp?.id, known: !!comp, voltage: v, ma, mw: v * ma, notes: r.notes };
      });
    const maxMa = Math.max(1, ...rows.map((r) => r.ma));
    const rails = new Map<number, { ma: number; mw: number; n: number }>();
    for (const r of rows) {
      const k = Math.round(r.voltage * 100) / 100;
      const e = rails.get(k) ?? { ma: 0, mw: 0, n: 0 };
      e.ma += r.ma;
      e.mw += r.mw;
      e.n++;
      rails.set(k, e);
    }
    const totalMw = rows.reduce((s, r) => s + r.mw, 0);
    const battery = findBattery(bom, netlist);
    const eff = 0.85;
    const vb = battery?.voltage ?? spec.supplyVoltage;
    const battMa = vb > 0 ? totalMw / eff / vb : 0;
    const runtimeH = battery && battMa > 0 ? (battery.capacityMah * 0.9) / battMa : null;
    return { rows, maxMa, rails: [...rails.entries()].sort((a, b) => b[0] - a[0]), totalMw, battery, battMa, runtimeH, vb, eff };
  }, [spec, netlist, bom]);

  const railColor = (v: number) => {
    const n = netlist.nets.find((x) => x.type === "power" && x.voltage !== undefined && Math.abs(x.voltage - v) < 0.05);
    return n?.display ?? "#ff7a1a";
  };

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto">
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line md:grid-cols-4">
        {[
          ["Supply", fmtV(spec.supplyVoltage) || "—", "text-accent"],
          ["Logic", fmtV(spec.logicVoltage) || "—", "text-cyan"],
          ["Total power", data.totalMw >= 1000 ? `${(data.totalMw / 1000).toFixed(2)} W` : `${Math.round(data.totalMw)} mW`, "text-ink"],
          [
            "Battery current",
            data.battMa ? `${Math.round(data.battMa)} mA @ ${fmtV(data.vb)}` : "—",
            "text-ink",
          ],
        ].map(([k, v, cls]) => (
          <div key={k} className="bg-panel px-4 py-3">
            <div className="text-[10.5px] tracking-wide text-ink-faint uppercase">{k}</div>
            <div className={`mt-0.5 font-mono text-[17px] ${cls}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_300px]">
        <div className="overflow-hidden rounded-md border border-line bg-panel">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-dim uppercase">
            <Zap size={13} className="text-accent" /> Power budget
          </div>
          {data.rows.length ? (
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left text-ink-faint">
                  <th className="px-3 py-1.5 font-medium">Component</th>
                  <th className="px-2 py-1.5 text-right font-medium">Rail</th>
                  <th className="px-2 py-1.5 text-right font-medium">Current</th>
                  <th className="px-2 py-1.5 text-right font-medium">Power</th>
                  <th className="w-[34%] px-3 py-1.5 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line/60 align-top">
                    <td className="px-3 py-1.5">
                      <div className="text-ink">
                        {r.name}
                        {!r.known ? <span title="Not found in components" className="ml-1 text-[10px] text-warn">?</span> : null}
                      </div>
                      {r.notes ? <div className="text-[10.5px] text-ink-faint">{r.notes}</div> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono" style={{ color: railColor(r.voltage) }}>
                      {fmtV(r.voltage)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-ink">{r.ma} mA</td>
                    <td className="px-2 py-1.5 text-right font-mono text-ink-dim">{r.mw >= 1000 ? `${(r.mw / 1000).toFixed(2)} W` : `${Math.round(r.mw)} mW`}</td>
                    <td className="px-3 py-2">
                      <div className="h-2 w-full rounded-sm bg-panel-3">
                        <div className="h-2 rounded-sm" style={{ width: `${(r.ma / data.maxMa) * 100}%`, background: railColor(r.voltage) }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line-strong bg-panel-2 font-medium">
                  <td className="px-3 py-1.5 text-ink">Total</td>
                  <td />
                  <td className="px-2 py-1.5 text-right font-mono text-ink">{data.rows.reduce((s, r) => s + r.ma, 0)} mA</td>
                  <td className="px-2 py-1.5 text-right font-mono text-ink">{data.totalMw >= 1000 ? `${(data.totalMw / 1000).toFixed(2)} W` : `${Math.round(data.totalMw)} mW`}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-6 text-center text-[12px] text-ink-faint">No power budget in this design.</div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-line bg-panel">
            <div className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-dim uppercase">Per rail</div>
            <div className="space-y-2.5 p-3">
              {data.rails.map(([v, e]) => {
                const pct = data.totalMw > 0 ? (e.mw / data.totalMw) * 100 : 0;
                return (
                  <div key={v}>
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="font-mono font-semibold" style={{ color: railColor(v) }}>
                        {fmtV(v)}
                      </span>
                      <span className="font-mono text-ink">
                        {e.ma} mA <span className="text-ink-faint">· {e.mw >= 1000 ? `${(e.mw / 1000).toFixed(2)} W` : `${Math.round(e.mw)} mW`}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-sm bg-panel-3">
                      <div className="h-1.5 rounded-sm" style={{ width: `${pct}%`, background: railColor(v) }} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-faint">
                      {e.n} load{e.n === 1 ? "" : "s"} · {pct.toFixed(0)}% of total
                    </div>
                  </div>
                );
              })}
              {!data.rails.length ? <div className="text-[11.5px] text-ink-faint">—</div> : null}
            </div>
          </div>

          <div className="rounded-md border border-line bg-panel">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-dim uppercase">
              <BatteryMedium size={13} className="text-ok" /> Battery runtime
            </div>
            <div className="p-3 text-[11.5px]">
              {data.battery && data.runtimeH ? (
                <>
                  <div className="font-mono text-[20px] text-ok">≈ {fmtDuration(data.runtimeH)}</div>
                  <div className="mt-1 text-ink-dim">
                    {data.battery.name} · {Math.round(data.battery.capacityMah)} mAh{data.battery.voltage ? ` @ ${fmtV(data.battery.voltage)}` : ""}
                  </div>
                  <div className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
                    Assumes every listed load draws its budgeted current continuously, {Math.round(data.eff * 100)}% conversion efficiency and 90% usable capacity.
                    Average draw in real use is usually lower.
                  </div>
                </>
              ) : (
                <div className="text-ink-faint">No battery with a stated capacity was found in the BOM or components.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
