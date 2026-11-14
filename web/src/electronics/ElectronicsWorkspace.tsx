import { useMemo, useState } from "react";
import { AlertTriangle, Cable, CircuitBoard, Grid3x3, Zap } from "lucide-react";
import type { BomItem, ElectronicsSpec, FirmwareSpec } from "@protoforge/shared";
import { buildNetlist, firmwareFunctions, fmtV } from "./model";
import { layoutBreadboard } from "./layout";
import { SchematicView } from "./SchematicView";
import { BreadboardView } from "./BreadboardView";
import { ConnectionsView } from "./ConnectionsView";
import { PowerView } from "./PowerView";

type Tab = "schematic" | "breadboard" | "connections" | "power";

const TABS: { id: Tab; label: string; icon: typeof Zap }[] = [
  { id: "schematic", label: "Schematic", icon: CircuitBoard },
  { id: "breadboard", label: "Breadboard", icon: Grid3x3 },
  { id: "connections", label: "Connections", icon: Cable },
  { id: "power", label: "Power", icon: Zap },
];

function normalizeSpec(e: ElectronicsSpec): ElectronicsSpec {
  return {
    summary: e.summary ?? "",
    supplyVoltage: Number(e.supplyVoltage) || 0,
    logicVoltage: Number(e.logicVoltage) || 0,
    components: Array.isArray(e.components) ? e.components : [],
    nets: Array.isArray(e.nets) ? e.nets : [],
    powerBudget: Array.isArray(e.powerBudget) ? e.powerBudget : [],
    wiringSteps: Array.isArray(e.wiringSteps) ? e.wiringSteps : [],
    safetyNotes: Array.isArray(e.safetyNotes) ? e.safetyNotes : [],
  };
}

export function ElectronicsWorkspace({
  electronics,
  bom,
  firmware,
  className = "",
}: {
  electronics: ElectronicsSpec;
  bom?: BomItem[];
  firmware?: FirmwareSpec | null;
  className?: string;
}) {
  const [tab, setTab] = useState<Tab>("schematic");
  const [showWarn, setShowWarn] = useState(false);
  const spec = useMemo(() => normalizeSpec(electronics ?? ({} as ElectronicsSpec)), [electronics]);
  const netlist = useMemo(() => buildNetlist(spec), [spec]);
  const layout = useMemo(() => layoutBreadboard(spec, netlist), [spec, netlist]);
  const fw = useMemo(() => firmwareFunctions(netlist, firmware), [netlist, firmware]);
  const warnings = useMemo(() => [...netlist.warnings, ...layout.warnings], [netlist, layout]);

  const empty = netlist.components.length === 0;

  return (
    <div className={`flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg text-ink ${className}`}>
      {/* header strip */}
      <div className="flex items-start gap-4 border-b border-line bg-panel px-3 py-2">
        <p className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-snug text-ink-dim" title={spec.summary}>
          {spec.summary || "Electronics design"}
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
          <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-accent" title="Supply voltage">
            VIN {fmtV(spec.supplyVoltage) || "—"}
          </span>
          <span className="rounded border border-cyan/40 bg-cyan/10 px-1.5 py-0.5 font-mono text-cyan" title="Logic voltage">
            LOGIC {fmtV(spec.logicVoltage) || "—"}
          </span>
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-ink-dim">{netlist.components.length} parts</span>
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-ink-dim">{netlist.nets.length} nets</span>
          {warnings.length ? (
            <button
              type="button"
              onClick={() => setShowWarn((s) => !s)}
              className="inline-flex items-center gap-1 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-warn hover:bg-warn/20"
              title="Netlist warnings"
            >
              <AlertTriangle size={11} /> {warnings.length}
            </button>
          ) : null}
        </div>
      </div>
      {showWarn && warnings.length ? (
        <div className="max-h-32 overflow-y-auto border-b border-line bg-warn/5 px-3 py-1.5 font-mono text-[10.5px] text-warn">
          {warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      ) : null}
      {/* tabs */}
      <div className="flex items-center gap-0.5 border-b border-line bg-panel px-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-[12px] ${on ? "text-ink" : "text-ink-faint hover:text-ink-dim"}`}
            >
              <Icon size={13} className={on ? "text-accent" : ""} />
              {t.label}
              {on ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
            </button>
          );
        })}
        {firmware ? <span className="ml-auto pr-2 text-[10.5px] text-ink-faint">firmware pin map: {fw.size} pins linked</span> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {empty ? (
          <div className="grid h-full place-items-center text-[12px] text-ink-faint">No electronic components in this design.</div>
        ) : tab === "schematic" ? (
          <SchematicView netlist={netlist} fw={fw} />
        ) : tab === "breadboard" ? (
          <BreadboardView netlist={netlist} layout={layout} fw={fw} />
        ) : tab === "connections" ? (
          <ConnectionsView netlist={netlist} layout={layout} spec={spec} fw={fw} />
        ) : (
          <PowerView spec={spec} netlist={netlist} bom={bom} />
        )}
      </div>
    </div>
  );
}
