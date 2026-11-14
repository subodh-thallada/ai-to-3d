import { ArrowRight, Boxes, Cpu, Crosshair, ShieldAlert, Target } from "lucide-react";
import type { Project } from "@protoforge/shared";
import { CadViewer } from "../../components/lazy3d";
import { Badge, Card, Metric, SectionTitle } from "../../components/ui";
import { fmtDims, fmtMass, fmtNum, fmtUsd, fmtVec } from "../../lib/format";
import { headlineMetrics, scoreColor } from "../../lib/metrics";

export function OverviewTab({ project, onOpenTab }: { project: Project; onOpenTab: (tab: string) => void }) {
  const b = project.brief!;
  const m = headlineMetrics(project);
  const perf = Object.entries(b.requirements?.performance ?? {});
  const functional = b.requirements?.functional ?? [];
  const constraints = b.requirements?.constraints ?? [];
  const hasCad = !!project.cad && project.cad.parts.length > 0;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-5">
      {/* Hero: description + preview */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,44%)] gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {b.category && <Badge tone="accent">{b.category}</Badge>}
              {b.hasElectronics && <Badge tone="cyan">Electronics</Badge>}
              {b.hasFirmware && <Badge tone="cyan">Firmware{b.firmwarePlatform ? ` · ${b.firmwarePlatform}` : ""}</Badge>}
              {b.envelope && <Badge>Envelope {fmtDims(b.envelope)}</Badge>}
            </div>
            <h2 className="mt-2.5 text-[20px] font-semibold tracking-tight text-ink">{b.name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-dim">{b.tagline}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">{b.description}</p>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <Metric label="Parts" value={m.parts !== undefined ? fmtNum(m.parts) : "—"} sub={project.cad ? `${fmtNum(project.cad.joints?.length ?? 0)} joints` : "CAD pending"} />
            <Metric label="BOM cost" value={fmtUsd(m.costUsd)} sub={project.bom ? `${fmtNum(project.bom.length)} lines` : "sourcing pending"} />
            <Metric label="Mass" value={fmtMass(m.massG)} sub="estimated" />
            <Metric
              label="Review score"
              value={<span style={{ color: scoreColor(m.score) }}>{m.score !== undefined ? Math.round(m.score) : "—"}</span>}
              sub={project.review ? `${project.review.checks.filter((c) => c.status === "fail").length} failing checks` : "review pending"}
            />
          </div>
          {b.coordinateNotes && (
            <div className="flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-ink-dim">
              <Crosshair size={13} className="mt-0.5 shrink-0 text-ink-faint" />
              <span>{b.coordinateNotes}</span>
            </div>
          )}
        </div>
        <Card className="relative h-[340px] overflow-hidden">
          {hasCad ? (
            <>
              <CadViewer model={project.cad!} autoRotate className="h-full w-full" />
              <button
                type="button"
                onClick={() => onOpenTab("cad")}
                className="absolute right-2.5 bottom-2.5 inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-panel/90 px-2.5 text-[12px] text-ink backdrop-blur outline-none hover:bg-panel-3 focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                Open CAD workspace <ArrowRight size={12} />
              </button>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[12px] text-ink-faint">
              <Boxes size={26} />
              <span>3D model appears once the CAD agents finish</span>
            </div>
          )}
        </Card>
      </div>

      {/* Requirements */}
      <div className="grid grid-cols-3 gap-5">
        <div>
          <SectionTitle>Functional requirements</SectionTitle>
          <Card className="p-3">
            {functional.length ? (
              <ul className="space-y-1.5">
                {functional.map((f, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-ink-dim">
                    <Target size={12} className="mt-[3px] shrink-0 text-accent" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-ink-faint">None listed.</div>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>Performance specs</SectionTitle>
          <Card className="overflow-hidden">
            {perf.length ? (
              <table className="w-full text-[12px]">
                <tbody>
                  {perf.map(([k, v]) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <td className="w-[45%] px-3 py-1.5 align-top text-ink-faint">{k}</td>
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-[12px] text-ink-faint">None listed.</div>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>Constraints</SectionTitle>
          <Card className="p-3">
            {constraints.length ? (
              <ul className="space-y-1.5">
                {constraints.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-ink-dim">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-ink-faint">None listed.</div>
            )}
          </Card>
        </div>
      </div>

      {/* Subsystems */}
      {b.subsystems?.length > 0 && (
        <div>
          <SectionTitle right={<span className="font-mono text-[10.5px] text-ink-faint">{b.subsystems.length}</span>}>Subsystems</SectionTitle>
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
            {b.subsystems.map((s) => {
              const partCount = project.cad?.parts.filter((p) => p.subsystem === s.name).length ?? 0;
              return (
                <Card key={s.id} className="flex flex-col p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-ink">{s.name}</div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">
                        {fmtDims(s.envelope?.size)} @ {fmtVec(s.envelope?.center)}
                      </div>
                    </div>
                    {partCount > 0 && <Badge>{partCount} parts</Badge>}
                  </div>
                  <p className="mt-2 text-[12px] leading-snug text-ink-dim">{s.description}</p>
                  {s.keyParts?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {s.keyParts.map((k, i) => (
                        <span key={i} className="rounded border border-line bg-panel-2 px-1.5 py-[1px] text-[11px] text-ink-dim">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.interfaces?.length > 0 && (
                    <div className="mt-3 border-t border-line pt-2">
                      <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">Interfaces</div>
                      <ul className="space-y-1">
                        {s.interfaces.map((itf, i) => (
                          <li key={i} className="flex gap-1.5 text-[11.5px] leading-snug text-ink-dim">
                            <ArrowRight size={11} className="mt-[3px] shrink-0 text-cyan" />
                            <span>{itf}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Key components + risks */}
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
        <div>
          <SectionTitle>Key components</SectionTitle>
          <Card className="overflow-hidden">
            {b.keyComponents?.length ? (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line bg-panel-2 text-left text-[11px] text-ink-faint">
                    <th className="px-3 py-1.5 font-medium">Component</th>
                    <th className="px-3 py-1.5 font-medium">Part number</th>
                    <th className="px-3 py-1.5 font-medium">Role</th>
                    <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {b.keyComponents.map((k, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 text-ink">
                        <span className="inline-flex items-center gap-1.5">
                          <Cpu size={12} className="shrink-0 text-ink-faint" />
                          {k.name}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-ink-dim">{k.partNumber || "—"}</td>
                      <td className="px-3 py-1.5 text-ink-dim">{k.role}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-ink tabular-nums">{fmtNum(k.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-[12px] text-ink-faint">None listed.</div>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>Risks</SectionTitle>
          <Card className="p-3">
            {b.risks?.length ? (
              <ul className="space-y-2">
                {b.risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-ink-dim">
                    <ShieldAlert size={13} className="mt-[2px] shrink-0 text-warn" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-ink-faint">No risks identified.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
