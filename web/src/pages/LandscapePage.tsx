import { useMemo, useState } from "react";
import { ArrowUpRight, Search, Sparkles, X } from "lucide-react";
import { LANDSCAPE } from "../data/landscape";
import type { LandscapeCompany } from "../data/landscape";
import { Badge, Card, Chip, EmptyState, SectionTitle } from "../components/ui";
import { cn, fmtDate } from "../lib/format";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function anchorId(name: string): string {
  return `co-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function CompanyCard({ c, highlighted }: { c: LandscapeCompany; highlighted: boolean }) {
  const href = safeHref(c.url);
  return (
    <Card className={cn("flex scroll-mt-4 flex-col p-4 transition-colors", highlighted && "border-accent/60")}>
      <div id={anchorId(c.name)} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink">{c.name}</div>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-0.5 rounded text-[11.5px] text-cyan outline-none hover:underline focus-visible:ring-1 focus-visible:ring-accent">
              {hostOf(c.url)} <ArrowUpRight size={11} />
            </a>
          ) : (
            <span className="mt-0.5 text-[11.5px] text-ink-faint">{c.url}</span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge>{c.category}</Badge>
          {c.funding && (
            <span className="max-w-[180px] text-right text-[10.5px] leading-tight text-ink-faint" title={c.funding}>
              {c.funding}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-dim">{c.description}</p>
      {c.keyIdeas?.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {c.keyIdeas.map((k, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink-dim">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
              <span>{k}</span>
            </li>
          ))}
        </ul>
      )}
      {c.protoforgeIntegration && (
        <div className="mt-auto pt-3">
          <div className="rounded-md border-l-2 border-accent bg-accent/[0.06] px-2.5 py-1.5 text-[12px] leading-snug text-ink-dim">
            <span className="mr-1 font-medium text-accent">In Protoforge:</span>
            {c.protoforgeIntegration}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function LandscapePage() {
  const data = LANDSCAPE;
  const companies = data?.companies ?? [];
  const integrations = data?.integrations ?? [];
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    companies.forEach((c) => m.set(c.category, (m.get(c.category) ?? 0) + 1));
    return [...m.entries()];
  }, [companies]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter(
      (c) =>
        (!category || c.category === category) &&
        (!q || [c.name, c.description, c.category, c.protoforgeIntegration, ...(c.keyIdeas ?? [])].some((v) => v && v.toLowerCase().includes(q))),
    );
  }, [companies, category, query]);

  const known = useMemo(() => new Set(companies.map((c) => c.name.toLowerCase())), [companies]);

  const jumpTo = (name: string) => {
    setCategory(null);
    setQuery("");
    setHighlight(name);
    requestAnimationFrame(() => {
      document.getElementById(anchorId(name))?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => setHighlight((h) => (h === name ? null : h)), 2200);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-8 pt-10 pb-16">
        <header>
          <div className="text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">Industry landscape</div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-ink">Who is turning AI into physical products</h1>
          <p className="mt-3 max-w-4xl text-[13.5px] leading-relaxed text-ink-dim">{data?.summary}</p>
          <div className="mt-2 text-[11.5px] text-ink-faint">
            {companies.length} companies · {integrations.length} capabilities integrated · updated {fmtDate(data?.updated)}
          </div>
        </header>

        {integrations.length > 0 && (
          <section aria-labelledby="matrix-title">
            <SectionTitle>
              <span id="matrix-title" className="inline-flex items-center gap-1.5">
                <Sparkles size={12} className="text-accent" /> Integrated into Protoforge
              </span>
            </SectionTitle>
            <Card className="overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line bg-panel-2 text-left text-[11px] text-ink-faint">
                    <th className="w-[26%] px-3 py-2 font-medium">Capability</th>
                    <th className="w-[30%] px-3 py-2 font-medium">Inspired by</th>
                    <th className="px-3 py-2 font-medium">Where in Protoforge</th>
                  </tr>
                </thead>
                <tbody>
                  {integrations.map((row, i) => (
                    <tr key={i} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-2.5 font-medium text-ink">{row.capability}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.inspiredBy.map((n) =>
                            known.has(n.toLowerCase()) ? (
                              <button
                                key={n}
                                type="button"
                                onClick={() => jumpTo(companies.find((c) => c.name.toLowerCase() === n.toLowerCase())!.name)}
                                className="rounded border border-line-strong bg-panel-2 px-1.5 py-[1px] text-[11px] text-ink-dim outline-none hover:border-accent/50 hover:text-ink focus-visible:ring-1 focus-visible:ring-accent"
                              >
                                {n}
                              </button>
                            ) : (
                              <span key={n} className="rounded border border-line bg-panel-2 px-1.5 py-[1px] text-[11px] text-ink-faint">
                                {n}
                              </span>
                            ),
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 leading-snug text-ink-dim">{row.whereInProtoforge}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        <section aria-labelledby="companies-title">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="companies-title" className="mr-2 text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
              Companies
            </h2>
            <Chip active={!category} onClick={() => setCategory(null)} count={companies.length}>
              All
            </Chip>
            {categories.map(([cat, n]) => (
              <Chip key={cat} active={category === cat} onClick={() => setCategory(category === cat ? null : cat)} count={n}>
                {cat}
              </Chip>
            ))}
            <div className="relative ml-auto">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search companies…"
                aria-label="Search companies"
                className="h-7 w-[220px] rounded-md border border-line-strong bg-panel-2 pr-7 pl-7 text-[12px] text-ink placeholder:text-ink-faint outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:text-ink">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          {visible.length === 0 ? (
            <Card>
              <EmptyState title="No companies match" className="min-h-[160px]">
                Clear the search or pick another category.
              </EmptyState>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
              {visible.map((c) => (
                <CompanyCard key={c.name} c={c} highlighted={highlight === c.name} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
