import { useMemo, useState } from "react";
import { Bot, Calculator, Lightbulb } from "lucide-react";
import type { ReviewCheck, ReviewReport } from "@protoforge/shared";
import { Badge, Card, CheckIcon, Chip, Metric, ScoreRing, SectionTitle } from "../../components/ui";
import { cn, fmtMass, fmtNum, fmtUsd, titleCase } from "../../lib/format";

const CATEGORY_ORDER: ReviewCheck["category"][] = ["safety", "mechanical", "electrical", "firmware", "consistency", "sourcing", "assembly"];
const STATUS_RANK = { fail: 0, warn: 1, pass: 2 } as const;

export function ReviewTab({ review }: { review: ReviewReport }) {
  const [filter, setFilter] = useState<"all" | ReviewCheck["status"]>("all");
  const checks = review.checks ?? [];
  const counts = useMemo(
    () => ({
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    }),
    [checks],
  );

  const groups = useMemo(() => {
    const visible = filter === "all" ? checks : checks.filter((c) => c.status === filter);
    const map = new Map<string, ReviewCheck[]>();
    visible.forEach((c) => {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    });
    const rank = (cat: string) => {
      const i = CATEGORY_ORDER.indexOf(cat as ReviewCheck["category"]);
      return i < 0 ? CATEGORY_ORDER.length : i;
    };
    return [...map.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([cat, list]) => [cat, [...list].sort((x, y) => STATUS_RANK[x.status] - STATUS_RANK[y.status])] as const);
  }, [checks, filter]);

  const m = review.metrics ?? ({} as Partial<ReviewReport["metrics"]>);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-5">
      <Card className="flex items-center gap-6 p-5">
        <ScoreRing score={review.score} size={120} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Engineering review</h2>
            <span className="text-[12px] text-ink-faint">
              {fmtNum(checks.length)} checks · <span className="text-ok">{counts.pass} pass</span> · <span className="text-warn">{counts.warn} warn</span> · <span className="text-bad">{counts.fail} fail</span>
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-ink-dim">{review.summary}</p>
          {checks.length > 0 && (
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-panel-3" aria-hidden>
              <div className="bg-ok" style={{ width: `${(counts.pass / checks.length) * 100}%` }} />
              <div className="bg-warn" style={{ width: `${(counts.warn / checks.length) * 100}%` }} />
              <div className="bg-bad" style={{ width: `${(counts.fail / checks.length) * 100}%` }} />
            </div>
          )}
        </div>
      </Card>

      <div>
        <SectionTitle>Metrics</SectionTitle>
        <div className="grid grid-cols-5 gap-2.5 2xl:grid-cols-9">
          <Metric label="Parts" value={fmtNum(m.partCount)} />
          <Metric label="Joints" value={fmtNum(m.jointCount)} />
          <Metric label="BOM lines" value={fmtNum(m.bomLineCount)} />
          <Metric label="Cost" value={fmtUsd(m.costUsd)} />
          <Metric label="Mass" value={fmtMass(m.massG)} />
          <Metric label="Components" value={fmtNum(m.componentCount)} />
          <Metric label="Nets" value={fmtNum(m.netCount)} />
          <Metric label="Firmware lines" value={fmtNum(m.firmwareLines)} />
          <Metric label="Power draw" value={m.powerDrawMa !== undefined ? `${fmtNum(m.powerDrawMa)} mA` : "—"} />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div className="min-w-0">
          <SectionTitle
            right={
              <div className="flex gap-1.5">
                <Chip active={filter === "all"} onClick={() => setFilter("all")} count={checks.length}>
                  All
                </Chip>
                <Chip active={filter === "fail"} onClick={() => setFilter("fail")} count={counts.fail}>
                  Fail
                </Chip>
                <Chip active={filter === "warn"} onClick={() => setFilter("warn")} count={counts.warn}>
                  Warn
                </Chip>
                <Chip active={filter === "pass"} onClick={() => setFilter("pass")} count={counts.pass}>
                  Pass
                </Chip>
              </div>
            }
          >
            Checks
          </SectionTitle>
          {groups.length === 0 ? (
            <Card className="p-6 text-center text-[12.5px] text-ink-faint">No checks match this filter.</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map(([cat, list]) => {
                const f = list.filter((c) => c.status === "fail").length;
                const w = list.filter((c) => c.status === "warn").length;
                return (
                  <Card key={cat} className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-line bg-panel-2 px-3 py-1.5">
                      <span className="text-[12px] font-medium text-ink">{titleCase(cat)}</span>
                      <span className="font-mono text-[10.5px] text-ink-faint">
                        {f > 0 && <span className="text-bad">{f} fail · </span>}
                        {w > 0 && <span className="text-warn">{w} warn · </span>}
                        {list.length} total
                      </span>
                    </div>
                    <ul>
                      {list.map((c) => (
                        <li key={c.id} className={cn("flex gap-2.5 border-b border-line px-3 py-2 last:border-0", c.status === "fail" && "bg-bad/[0.04]")}>
                          <span className="mt-[1px]">
                            <CheckIcon status={c.status} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-[12.5px] text-ink">{c.name}</span>
                              <Badge tone={c.source === "agent" ? "cyan" : "default"} title={c.source === "agent" ? "Judged by the reviewer agent" : "Computed deterministically by code"}>
                                {c.source === "agent" ? <Bot size={10} className="mr-1" /> : <Calculator size={10} className="mr-1" />}
                                {c.source === "agent" ? "agent" : "computed"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-[12px] leading-snug break-words text-ink-dim">{c.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <SectionTitle>Suggestions</SectionTitle>
          <Card className="p-3">
            {review.suggestions?.length ? (
              <ol className="space-y-2.5">
                {review.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-ink-dim">
                    <Lightbulb size={13} className="mt-[2px] shrink-0 text-accent" />
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-[12px] text-ink-faint">No suggestions — the reviewer had nothing to add.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
