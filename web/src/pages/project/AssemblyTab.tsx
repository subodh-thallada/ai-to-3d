import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, TriangleExclamationPoint, Wrench } from "lucide-react";
import type { AssemblyStep, CadModel } from "@protoforge/shared";
import { CadViewer } from "../../components/lazy3d";
import { Button, Card } from "../../components/ui";
import { cn, fmtMinutes, fmtNum } from "../../lib/format";
import { useHotkeys } from "../../lib/hooks";

export function AssemblyTab({ steps: rawSteps, cad }: { steps: AssemblyStep[]; cad?: CadModel }) {
  const steps = useMemo(() => [...rawSteps].sort((a, b) => (a.step ?? 0) - (b.step ?? 0)), [rawSteps]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (index > steps.length - 1) setIndex(Math.max(0, steps.length - 1));
  }, [steps.length, index]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-step-index="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const go = (d: number) => setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + d)));
  useHotkeys(
    (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        go(-1);
      }
    },
    [steps.length],
  );

  const step = steps[Math.min(index, steps.length - 1)];
  const partsById = useMemo(() => new Map((cad?.parts ?? []).map((p) => [p.id, p])), [cad]);
  const totalMin = steps.reduce((s, x) => s + (x.durationMin ?? 0), 0);
  const allTools = useMemo(() => Array.from(new Set(steps.flatMap((s) => s.tools ?? []))), [steps]);
  const highlightIds = useMemo(() => (step?.partIds ?? []).filter((id) => partsById.has(id)), [step, partsById]);

  if (!step) return null;

  return (
    <div className="absolute inset-0 grid grid-cols-[340px_minmax(0,1fr)]">
      {/* Step list */}
      <div className="flex min-h-0 flex-col border-r border-line bg-panel">
        <div className="shrink-0 border-b border-line px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] font-medium text-ink">{fmtNum(steps.length)} steps</span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-dim">
              <Clock size={11} /> {totalMin ? fmtMinutes(totalMin) : "—"}
            </span>
          </div>
          {allTools.length > 0 && (
            <div className="mt-1 line-clamp-2 text-[11px] text-ink-faint" title={allTools.join(", ")}>
              Tools: {allTools.join(", ")}
            </div>
          )}
        </div>
        <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Assembly steps">
          {steps.map((s, i) => {
            const active = i === index;
            return (
              <li key={`${s.step}-${i}`}>
                <button
                  type="button"
                  data-step-index={i}
                  onClick={() => setIndex(i)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
                    active ? "bg-accent/10" : "hover:bg-panel-2",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                      active ? "border-accent bg-accent text-[#1a0d02]" : i < index ? "border-ok/50 text-ok" : "border-line-strong text-ink-dim",
                    )}
                  >
                    {s.step ?? i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[12.5px] leading-snug", active ? "text-ink" : "text-ink-dim")}>{s.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink-faint">
                      {s.durationMin !== undefined && (
                        <span className="inline-flex items-center gap-0.5">
                          <Clock size={10} /> {fmtMinutes(s.durationMin)}
                        </span>
                      )}
                      {s.tools && s.tools.length > 0 && (
                        <span className="inline-flex min-w-0 items-center gap-0.5">
                          <Wrench size={10} className="shrink-0" /> <span className="truncate">{s.tools.join(", ")}</span>
                        </span>
                      )}
                      {s.caution && (
                        <span className="inline-flex items-center gap-0.5 text-warn">
                          <TriangleExclamationPoint size={10} /> caution
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Detail + 3D */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="shrink-0 border-b border-line bg-panel px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                <span className="font-mono">
                  STEP {step.step ?? index + 1} / {steps.length}
                </span>
                {step.durationMin !== undefined && (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} /> {fmtMinutes(step.durationMin)}
                  </span>
                )}
              </div>
              <h2 className="mt-0.5 text-[15px] font-semibold text-ink">{step.title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous step" title="Previous (←)">
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="primary" onClick={() => go(1)} disabled={index >= steps.length - 1} aria-label="Next step" title="Next (→)">
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
          <div className="mt-2 max-h-[22vh] overflow-y-auto">
            <p className="text-[12.5px] leading-relaxed whitespace-pre-line text-ink-dim">{step.description}</p>
            {step.caution && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-warn/35 bg-warn/10 px-2.5 py-1.5 text-[12px] text-warn">
                <TriangleExclamationPoint size={13} className="mt-0.5 shrink-0" />
                <span>{step.caution}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {step.tools?.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded border border-line-strong bg-panel-2 px-1.5 py-[1px] text-[11px] text-ink-dim">
                  <Wrench size={10} /> {t}
                </span>
              ))}
              {(step.partIds ?? []).map((id) => {
                const p = partsById.get(id);
                return (
                  <span
                    key={id}
                    title={p ? `${p.subsystem} · ${p.id}` : "Part not found in CAD model"}
                    className={cn("rounded border px-1.5 py-[1px] text-[11px]", p ? "border-accent/35 bg-accent/10 text-accent" : "border-line text-ink-faint line-through")}
                  >
                    {p?.name ?? id}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {cad && cad.parts.length > 0 ? (
            <div className="absolute inset-0">
              <CadViewer model={cad} highlightIds={highlightIds} dimOthers className="h-full w-full" />
            </div>
          ) : (
            <Card className="m-4 flex h-[calc(100%-2rem)] items-center justify-center text-[12px] text-ink-faint">3D model not available.</Card>
          )}
          <div className="pointer-events-none absolute bottom-2.5 left-3 font-mono text-[10.5px] text-ink-faint">← → to step through</div>
        </div>
      </div>
    </div>
  );
}
