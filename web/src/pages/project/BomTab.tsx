import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Download, ExternalLink, Search, X } from "lucide-react";
import type { BomCategory, BomItem, CadModel } from "@protoforge/shared";
import { Badge, Button, Card, Chip, EmptyState, Metric, SectionTitle } from "../../components/ui";
import { downloadText, slugify, toCsv } from "../../lib/download";
import { cn, fmtMass, fmtNum, fmtUsd, titleCase } from "../../lib/format";
import { bomCost, bomMass } from "../../lib/metrics";

type SortKey = "name" | "category" | "supplier" | "qty" | "unit" | "ext" | "mass";

const CAT_COLOR: Record<BomCategory, string> = {
  electronics: "#38bdf8",
  mechanical: "#a3abbd",
  fastener: "#8b93a7",
  fabricated: "#ff7a1a",
  power: "#fbbf24",
  propulsion: "#f87171",
  sensor: "#34d399",
  display: "#c084fc",
  enclosure: "#ffb36b",
  cable: "#60a5fa",
  other: "#6b7489",
};

function safeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SortHeader({ k, label, sort, onSort, align = "left" }: { k: SortKey; label: string; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = sort?.key === k;
  return (
    <th className={cn("px-2.5 py-0 font-medium", align === "right" && "text-right")} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex h-8 items-center gap-1 rounded outline-none hover:text-ink focus-visible:text-ink focus-visible:underline", active && "text-ink", align === "right" && "flex-row-reverse")}
      >
        {label}
        {active ? sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <ArrowUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  );
}

export function BomTab({ bom, cad, productName }: { bom: BomItem[]; cad?: CadModel; productName: string }) {
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<Set<BomCategory>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const cadCount = useMemo(() => {
    const m = new Map<string, number>();
    cad?.parts.forEach((p) => p.bomId && m.set(p.bomId, (m.get(p.bomId) ?? 0) + 1));
    return m;
  }, [cad]);

  const categories = useMemo(() => {
    const m = new Map<BomCategory, { count: number; cost: number; mass: number }>();
    bom.forEach((b) => {
      const e = m.get(b.category) ?? { count: 0, cost: 0, mass: 0 };
      e.count += 1;
      e.cost += (b.qty || 0) * (b.unitPrice || 0);
      e.mass += (b.qty || 0) * (b.massG || 0);
      m.set(b.category, e);
    });
    return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [bom]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = bom.filter((b) => (cats.size === 0 || cats.has(b.category)) && (!q || [b.name, b.partNumber, b.manufacturer, b.supplier, b.notes, b.category, ...Object.values(b.specs ?? {})].some((v) => v && String(v).toLowerCase().includes(q))));
    if (sort) {
      const val = (b: BomItem): string | number => {
        switch (sort.key) {
          case "name":
            return (b.name ?? "").toLowerCase();
          case "category":
            return b.category;
          case "supplier":
            return (b.supplier ?? "").toLowerCase();
          case "qty":
            return b.qty || 0;
          case "unit":
            return b.unitPrice || 0;
          case "ext":
            return (b.qty || 0) * (b.unitPrice || 0);
          case "mass":
            return (b.qty || 0) * (b.massG || 0);
        }
      };
      list = [...list].sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
    }
    return list;
  }, [bom, cats, query, sort]);

  const total = bomCost(bom);
  const mass = bomMass(bom);
  const filteredTotal = bomCost(rows);
  const totalQty = bom.reduce((s, b) => s + (b.qty || 0), 0);

  // Cycle: natural direction (A→Z for text, high→low for numbers) → reversed → original order
  const onSort = (k: SortKey) =>
    setSort((s) => {
      const first: 1 | -1 = k === "name" || k === "category" || k === "supplier" ? 1 : -1;
      if (!s || s.key !== k) return { key: k, dir: first };
      if (s.dir === first) return { key: k, dir: first === 1 ? -1 : 1 };
      return null;
    });

  const toggleCat = (c: BomCategory) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const header = ["ID", "Name", "Category", "Manufacturer", "Part number", "Supplier", "URL", "Qty", "Unit price (USD)", "Extended (USD)", "Unit mass (g)", "Specs", "Notes", "Fabrication", "Alternatives"];
    const data = bom.map((b) => [
      b.id,
      b.name,
      b.category,
      b.manufacturer,
      b.partNumber,
      b.supplier,
      b.url,
      b.qty,
      (b.unitPrice ?? 0).toFixed(2),
      ((b.qty || 0) * (b.unitPrice || 0)).toFixed(2),
      b.massG,
      Object.entries(b.specs ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join("; "),
      b.notes,
      b.fabrication,
      (b.alternatives ?? []).join("; "),
    ]);
    data.push(["", "TOTAL", "", "", "", "", "", totalQty, "", total.toFixed(2), mass ? mass.toFixed(1) : "", "", "", "", ""]);
    downloadText("﻿" + toCsv([header, ...data]), `${slugify(productName)}-bom.csv`, "text/csv;charset=utf-8");
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="grid grid-cols-4 gap-2.5">
        <Metric label="Grand total" value={fmtUsd(total)} sub={`${fmtNum(bom.length)} lines · ${fmtNum(totalQty)} pieces`} valueClass="text-accent" />
        <Metric label="Total mass" value={fmtMass(mass || undefined)} sub={mass ? "from BOM unit masses" : "no masses listed"} />
        <Metric label="Most expensive line" value={fmtUsd(Math.max(0, ...bom.map((b) => (b.qty || 0) * (b.unitPrice || 0))))} sub={[...bom].sort((a, b) => b.qty * b.unitPrice - a.qty * a.unitPrice)[0]?.name} />
        <Metric label="Linked to CAD" value={`${fmtNum(bom.filter((b) => cadCount.has(b.id)).length)} / ${fmtNum(bom.length)}`} sub="lines with 3D parts" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-5">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search parts, numbers, specs…"
                aria-label="Search BOM"
                className="h-7 w-[240px] rounded-md border border-line-strong bg-panel-2 pr-7 pl-7 text-[12px] text-ink placeholder:text-ink-faint outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:text-ink">
                  <X size={12} />
                </button>
              )}
            </div>
            <Chip active={cats.size === 0} onClick={() => setCats(new Set())} count={bom.length}>
              All
            </Chip>
            {categories.map(([c, e]) => (
              <Chip key={c} active={cats.has(c)} onClick={() => toggleCat(c)} count={e.count}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[c] ?? CAT_COLOR.other }} />
                {titleCase(c)}
              </Chip>
            ))}
            <Button className="ml-auto" onClick={exportCsv}>
              <Download size={13} /> Export CSV
            </Button>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12px]">
              <thead>
                <tr className="border-b border-line bg-panel-2 text-left text-[11px] text-ink-faint">
                  <th className="w-7" />
                  <SortHeader k="name" label="Item" sort={sort} onSort={onSort} />
                  <th className="px-2.5 font-medium">Part number</th>
                  <SortHeader k="category" label="Category" sort={sort} onSort={onSort} />
                  <SortHeader k="supplier" label="Supplier" sort={sort} onSort={onSort} />
                  <SortHeader k="qty" label="Qty" sort={sort} onSort={onSort} align="right" />
                  <SortHeader k="unit" label="Unit" sort={sort} onSort={onSort} align="right" />
                  <SortHeader k="ext" label="Extended" sort={sort} onSort={onSort} align="right" />
                  <SortHeader k="mass" label="Mass" sort={sort} onSort={onSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState title="No matching items" className="min-h-[140px]">
                        Try a different search or category filter.
                      </EmptyState>
                    </td>
                  </tr>
                )}
                {rows.map((b) => {
                  const open = expanded.has(b.id);
                  const url = safeUrl(b.url);
                  const ext = (b.qty || 0) * (b.unitPrice || 0);
                  const specs = Object.entries(b.specs ?? {});
                  const hasDetail = specs.length > 0 || b.notes || b.fabrication || (b.alternatives?.length ?? 0) > 0;
                  return (
                    <Fragment key={b.id}>
                      <tr className={cn("border-b border-line transition-colors hover:bg-panel-2/60", open && "bg-panel-2/60")}>
                        <td className="pl-2">
                          {hasDetail && (
                            <button type="button" onClick={() => toggleRow(b.id)} aria-expanded={open} aria-label={open ? "Hide details" : "Show details"} className="rounded p-0.5 text-ink-faint outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-accent">
                              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                        </td>
                        <td className="max-w-[280px] px-2.5 py-1.5">
                          <div className="truncate text-ink" title={b.name}>
                            {b.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                            {b.manufacturer && <span className="truncate">{b.manufacturer}</span>}
                            {cadCount.get(b.id) ? <span className="shrink-0 text-cyan/80">· {cadCount.get(b.id)} in CAD</span> : null}
                          </div>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap text-ink-dim">{b.partNumber || "—"}</td>
                        <td className="px-2.5 py-1.5">
                          <span className="inline-flex items-center gap-1.5 text-ink-dim">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[b.category] ?? CAT_COLOR.other }} />
                            {titleCase(b.category)}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-cyan outline-none hover:underline focus-visible:ring-1 focus-visible:ring-accent" title={url}>
                              {b.supplier || hostOf(url)}
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span className="text-ink-dim">{b.supplier || "—"}</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono text-ink tabular-nums">{fmtNum(b.qty)}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono text-ink-dim tabular-nums">{fmtUsd(b.unitPrice)}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono text-ink tabular-nums">{fmtUsd(ext)}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono text-ink-dim tabular-nums">{b.massG ? fmtMass((b.qty || 0) * b.massG) : "—"}</td>
                      </tr>
                      {open && hasDetail && (
                        <tr className="border-b border-line bg-panel-2/40">
                          <td />
                          <td colSpan={8} className="px-2.5 pt-1.5 pb-3">
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                              {specs.length > 0 && (
                                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11.5px]">
                                  {specs.map(([k, v]) => (
                                    <Fragment key={k}>
                                      <dt className="text-ink-faint">{k}</dt>
                                      <dd className="font-mono text-[11px] text-ink">{String(v)}</dd>
                                    </Fragment>
                                  ))}
                                </dl>
                              )}
                              <div className="space-y-1.5 text-[11.5px] text-ink-dim">
                                {b.notes && <p>{b.notes}</p>}
                                {b.fabrication && (
                                  <p>
                                    <span className="text-ink-faint">Fabrication: </span>
                                    {b.fabrication}
                                  </p>
                                )}
                                {b.alternatives && b.alternatives.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-ink-faint">Alternatives:</span>
                                    {b.alternatives.map((a, i) => (
                                      <Badge key={i}>{a}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-panel-2 text-[12px]">
                    <td />
                    <td className="px-2.5 py-2 font-medium text-ink" colSpan={4}>
                      {rows.length === bom.length ? "Total" : `Filtered total (${fmtNum(rows.length)} of ${fmtNum(bom.length)} lines)`}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-ink tabular-nums">{fmtNum(rows.reduce((s, b) => s + (b.qty || 0), 0))}</td>
                    <td />
                    <td className="px-2.5 py-2 text-right font-mono font-semibold text-accent tabular-nums">{fmtUsd(filteredTotal)}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-ink-dim tabular-nums">{fmtMass(bomMass(rows) || undefined)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>
        </div>

        <div>
          <SectionTitle>Cost by category</SectionTitle>
          <Card className="p-3">
            <ul className="space-y-2.5">
              {categories.map(([c, e]) => {
                const pct = total > 0 ? (e.cost / total) * 100 : 0;
                return (
                  <li key={c}>
                    <div className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-1.5 text-ink-dim">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[c] ?? CAT_COLOR.other }} />
                        {titleCase(c)}
                        <span className="font-mono text-[10px] text-ink-faint">{e.count}</span>
                      </span>
                      <span className="font-mono text-ink tabular-nums">{fmtUsd(e.cost)}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-panel-3">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CAT_COLOR[c] ?? CAT_COLOR.other }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5 text-[12.5px]">
              <span className="font-medium text-ink">Grand total</span>
              <span className="font-mono font-semibold text-accent tabular-nums">{fmtUsd(total)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-[12px]">
              <span className="text-ink-dim">Total mass</span>
              <span className="font-mono text-ink tabular-nums">{fmtMass(mass || undefined)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
