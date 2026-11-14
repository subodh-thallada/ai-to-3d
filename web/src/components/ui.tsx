import { Component, type ButtonHTMLAttributes, type ErrorInfo, type ReactNode } from "react";
import { CircleCheck, CircleDashed, CircleSlash, CircleX, LoaderCircle, TriangleExclamationPoint } from "lucide-react";
import type { AgentStatus, ProjectStatus } from "@protoforge/shared";
import { cn } from "../lib/format";
import { scoreColor } from "../lib/metrics";

/* ------------------------------------------------------------------ */

export function Spinner({ className, size = 14 }: { className?: string; size?: number }) {
  return <LoaderCircle size={size} className={cn("animate-spin text-accent", className)} aria-hidden />;
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 2.5 28 9.25v13.5L16 29.5 4 22.75V9.25L16 2.5Z" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 2.5v13.5m0 0 12-6.75M16 16 4 9.25" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" opacity="0.55" />
      <path d="M10 19.5h12M13 23.5h6" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "text-ink-dim border-line-strong bg-panel-2" },
  running: { label: "Running", cls: "text-accent border-accent/40 bg-accent/10" },
  done: { label: "Complete", cls: "text-ok border-ok/35 bg-ok/10" },
  error: { label: "Failed", cls: "text-bad border-bad/40 bg-bad/10" },
};

export function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  const s = PROJECT_STATUS[status] ?? PROJECT_STATUS.queued;
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium", s.cls, className)}>
      {status === "running" ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {s.label}
    </span>
  );
}

export function AgentStatusIcon({ status, size = 14 }: { status: AgentStatus | undefined; size?: number }) {
  switch (status) {
    case "running":
      return <Spinner size={size} />;
    case "done":
      return <CircleCheck size={size} className="text-ok" aria-label="done" />;
    case "error":
      return <CircleX size={size} className="text-bad" aria-label="error" />;
    case "skipped":
      return <CircleSlash size={size} className="text-ink-faint" aria-label="skipped" />;
    default:
      return <CircleDashed size={size} className="text-ink-faint" aria-label="pending" />;
  }
}

export function CheckIcon({ status, size = 14 }: { status: "pass" | "warn" | "fail"; size?: number }) {
  if (status === "pass") return <CircleCheck size={size} className="shrink-0 text-ok" aria-label="pass" />;
  if (status === "warn") return <TriangleExclamationPoint size={size} className="shrink-0 text-warn" aria-label="warning" />;
  return <CircleX size={size} className="shrink-0 text-bad" aria-label="fail" />;
}

/* ------------------------------------------------------------------ */

export function Badge({ children, className, tone = "default", title }: { children: ReactNode; className?: string; tone?: "default" | "accent" | "ok" | "warn" | "bad" | "cyan"; title?: string }) {
  const tones = {
    default: "border-line-strong text-ink-dim bg-panel-2",
    accent: "border-accent/40 text-accent bg-accent/10",
    ok: "border-ok/35 text-ok bg-ok/10",
    warn: "border-warn/35 text-warn bg-warn/10",
    bad: "border-bad/40 text-bad bg-bad/10",
    cyan: "border-cyan/35 text-cyan bg-cyan/10",
  } as const;
  return (
    <span title={title} className={cn("inline-flex h-[18px] shrink-0 items-center rounded border px-1.5 text-[10.5px] font-medium leading-none whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" };

export function Button({ variant = "secondary", size = "sm", className, children, type = "button", ...rest }: ButtonProps) {
  const variants = {
    primary: "bg-accent text-[#1a0d02] border-accent hover:bg-accent-2 hover:border-accent-2 font-semibold",
    secondary: "bg-panel-2 text-ink border-line-strong hover:bg-panel-3",
    ghost: "bg-transparent text-ink-dim border-transparent hover:bg-panel-2 hover:text-ink",
    danger: "bg-bad/10 text-bad border-bad/40 hover:bg-bad/20",
  } as const;
  const sizes = { sm: "h-7 px-2.5 text-[12px] gap-1.5", md: "h-9 px-3.5 text-[13px] gap-2" } as const;
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        active ? "border-accent/60 bg-accent/12 text-accent" : "border-line-strong bg-panel-2 text-ink-dim hover:text-ink hover:bg-panel-3",
      )}
    >
      {children}
      {count !== undefined && <span className={cn("font-mono text-[10px]", active ? "text-accent/80" : "text-ink-faint")}>{count}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">{children}</h3>
      {right}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-line bg-panel", className)}>{children}</div>;
}

export function Metric({ label, value, sub, valueClass }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-panel px-3 py-2.5">
      <div className="truncate text-[11px] text-ink-faint">{label}</div>
      <div className={cn("mt-0.5 truncate font-mono text-[17px] font-medium text-ink tabular-nums", valueClass)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-ink-dim">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-panel-3/70", className)} />;
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-1 text-ink-faint">{icon}</div>}
      <div className="text-[13.5px] font-medium text-ink">{title}</div>
      {children && <div className="max-w-md text-[12.5px] leading-relaxed text-ink-dim">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Placeholder shown while an agent is producing the data a view needs. */
export function WorkingState({ title, detail, status }: { title: string; detail?: string; status?: AgentStatus }) {
  if (status === "error") {
    return (
      <EmptyState icon={<CircleX size={26} className="text-bad" />} title={`${title} failed`}>
        {detail ?? "The agent reported an error. See the pipeline log for details, or describe a change to re-run."}
      </EmptyState>
    );
  }
  return (
    <div className="flex h-full min-h-[280px] w-full flex-col gap-4 p-6">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-dim">
        {status === "running" ? <Spinner /> : <CircleDashed size={14} className="text-ink-faint" />}
        <span className="text-ink">{title}</span>
        <span className="text-ink-faint">{status === "running" ? "· agent working…" : "· waiting for upstream agents"}</span>
      </div>
      {detail && <div className="-mt-2 text-[12px] text-ink-faint">{detail}</div>}
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="min-h-[120px] flex-1" />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ScoreRing({ score, size = 112, stroke = 9 }: { score: number | undefined; size?: number; stroke?: number }) {
  const s = typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-panel-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - s / 100)}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[26px] leading-none font-semibold tabular-nums" style={{ color }}>
          {score === undefined ? "—" : Math.round(s)}
        </span>
        <span className="mt-1 text-[10px] tracking-wider text-ink-faint uppercase">score</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface BoundaryProps {
  children: ReactNode;
  label?: string;
  resetKey?: unknown;
}

interface BoundaryState {
  error: Error | null;
  key: unknown;
}

/** Keeps a crashing view (e.g. a 3D renderer hitting bad geometry) from taking down the whole app. */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, key: undefined };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    if (props.resetKey !== state.key) return { key: props.resetKey, error: null };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Protoforge] ${this.props.label ?? "view"} crashed`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState icon={<TriangleExclamationPoint size={26} className="text-warn" />} title={`${this.props.label ?? "This view"} could not render`} action={<Button onClick={() => this.setState({ error: null })}>Try again</Button>}>
          <span className="font-mono text-[11.5px] break-all text-ink-faint">{this.state.error.message}</span>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}
