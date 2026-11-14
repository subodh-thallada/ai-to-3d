/** Formatting helpers shared by every view. All formatting goes through Intl so numbers read consistently. */

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function fmtUsd(n: number | undefined | null, opts: { whole?: boolean } = {}): string {
  if (!finite(n)) return "—";
  return opts.whole ? usd0.format(n) : usd2.format(n);
}

export function fmtNum(n: number | undefined | null, maxDigits = 0): string {
  if (!finite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDigits }).format(n);
}

export function fmtCompact(n: number | undefined | null): string {
  if (!finite(n)) return "—";
  return compact.format(n);
}

export function fmtMass(g: number | undefined | null): string {
  if (!finite(g)) return "—";
  if (Math.abs(g) >= 1000) return `${fmtNum(g / 1000, 2)} kg`;
  return `${fmtNum(g, g < 10 ? 1 : 0)} g`;
}

export function fmtMm(n: number | undefined | null): string {
  if (!finite(n)) return "—";
  return fmtNum(n, Math.abs(n) < 10 ? 1 : 0);
}

export function fmtDims(v: readonly number[] | undefined | null, unit = "mm"): string {
  if (!v || v.length === 0) return "—";
  return `${v.map((x) => fmtMm(x)).join(" × ")} ${unit}`;
}

export function fmtVec(v: readonly number[] | undefined | null): string {
  if (!v || v.length === 0) return "—";
  return `(${v.map((x) => fmtMm(x)).join(", ")})`;
}

/** Human readable duration from milliseconds: 850 ms, 12.4 s, 3m 05s, 1h 02m */
export function fmtDuration(ms: number | undefined | null): string {
  if (!finite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const totalS = Math.floor(s);
  const m = Math.floor(totalS / 60);
  if (m < 60) return `${m}m ${String(totalS % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function fmtMinutes(min: number | undefined | null): string {
  if (!finite(min)) return "—";
  if (min < 60) return `${fmtNum(min, 0)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtTokens(n: number | undefined | null): string {
  if (!finite(n)) return "—";
  if (n < 1000) return String(n);
  return compact.format(n).toLowerCase();
}

function toDate(d: string | number | Date | undefined | null): Date | null {
  if (d === undefined || d === null || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtClock(ts: string | undefined | null): string {
  const d = toDate(ts);
  if (!d) return "--:--:--";
  return d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDateTime(ts: string | undefined | null): string {
  const d = toDate(ts);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function fmtRelative(ts: string | undefined | null, now = Date.now()): string {
  const d = toDate(ts);
  if (!d) return "—";
  const diffS = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(diffS);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diffS / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffS / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diffS / 86400), "day");
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" }).format(d);
}

export function elapsedMs(start: string | undefined, end: string | undefined, now = Date.now()): number | undefined {
  const s = toDate(start);
  if (!s) return undefined;
  const e = toDate(end);
  return (e ? e.getTime() : now) - s.getTime();
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${fmtNum(n)} ${n === 1 ? word : pluralWord}`;
}

/** Calendar date for date-only ISO strings (e.g. "2026-11-14"), rendered without timezone drift. */
export function fmtDate(ts: string | undefined | null): string {
  const d = toDate(ts);
  if (!d) return "—";
  const dateOnly = typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: dateOnly ? "UTC" : undefined }).format(d);
}
