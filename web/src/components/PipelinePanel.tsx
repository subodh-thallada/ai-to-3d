import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronDown, ChevronRight, X } from "lucide-react";
import type { AgentRun, LogEvent, Project } from "@protoforge/shared";
import { cn, elapsedMs, fmtClock, fmtDuration, fmtTokens } from "../lib/format";
import { useNow } from "../lib/hooks";
import { STAGE_ORDER } from "../lib/metrics";
import { AgentStatusIcon } from "./ui";

interface TreeNode {
  agent: AgentRun;
  children: TreeNode[];
}

function buildTree(agents: AgentRun[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  agents.forEach((a) => byId.set(a.id, { agent: a, children: [] }));
  const roots: TreeNode[] = [];
  agents.forEach((a) => {
    const node = byId.get(a.id)!;
    const parent = a.parentId ? byId.get(a.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  });
  const rank = (a: AgentRun) => {
    const i = STAGE_ORDER.indexOf(a.stage);
    return i < 0 ? STAGE_ORDER.length : i;
  };
  // stable sort by pipeline stage; preserve server order within a stage
  const indexed = roots.map((n, i) => ({ n, i }));
  indexed.sort((x, y) => rank(x.n.agent) - rank(y.n.agent) || x.i - y.i);
  return indexed.map((x) => x.n);
}

function shortModel(model?: string): string | undefined {
  if (!model) return undefined;
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

const AgentRow = memo(function AgentRow({
  node,
  depth,
  now,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  now: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const a = node.agent;
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const dur = a.startedAt ? elapsedMs(a.startedAt, a.status === "running" ? undefined : a.endedAt, now) : undefined;
  const tokens = (a.tokensIn ?? 0) + (a.tokensOut ?? 0);
  const isSel = selected === a.id;
  const detail = a.error || a.summary;
  const doneKids = node.children.filter((c) => c.agent.status === "done").length;

  return (
    <li>
      <div
        className={cn(
          "group relative flex cursor-pointer items-start gap-2 rounded-md py-1.5 pr-2 transition-colors",
          isSel ? "bg-accent/10" : "hover:bg-panel-2",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onSelect(isSel ? null : a.id)}
        role="button"
        tabIndex={0}
        aria-pressed={isSel}
        title={a.role}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(isSel ? null : a.id);
          }
        }}
      >
        {depth > 0 && <span className="absolute top-0 bottom-0 border-l border-line" style={{ left: depth * 14 - 3 }} aria-hidden />}
        {node.children.length > 0 ? (
          <button
            type="button"
            className="mt-[1px] -ml-0.5 rounded text-ink-faint outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-accent"
            aria-label={open ? "Collapse sub-agents" : "Expand sub-agents"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[12px] shrink-0" />
        )}
        <span className="mt-[1px] shrink-0">
          <AgentStatusIcon status={a.status} size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn("truncate text-[12.5px]", a.status === "pending" ? "text-ink-dim" : "text-ink")}>{a.name}</span>
            {node.children.length > 0 && (
              <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                {doneKids}/{node.children.length}
              </span>
            )}
            <span className={cn("ml-auto shrink-0 font-mono text-[10.5px] tabular-nums", a.status === "running" ? "text-accent" : "text-ink-faint")}>
              {dur !== undefined ? fmtDuration(dur) : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-ink-faint">
            {a.model && <span className="truncate">{shortModel(a.model)}</span>}
            {tokens > 0 && (
              <span className="shrink-0" title={`${a.tokensIn ?? 0} in · ${a.tokensOut ?? 0} out`}>
                {fmtTokens(a.tokensIn)}↓ {fmtTokens(a.tokensOut)}↑
              </span>
            )}
          </div>
          {detail && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((x) => !x);
              }}
              className={cn(
                "mt-0.5 block w-full rounded text-left text-[11.5px] leading-snug outline-none focus-visible:ring-1 focus-visible:ring-accent",
                a.error ? "text-bad" : "text-ink-dim",
                expanded ? "" : "line-clamp-2",
              )}
            >
              {detail}
            </button>
          )}
        </div>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <AgentRow key={c.agent.id} node={c} depth={depth + 1} now={now} selected={selected} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
});

const LEVEL_CLS: Record<LogEvent["level"], string> = {
  info: "text-ink-dim",
  warn: "text-warn",
  error: "text-bad",
};

function LogFeed({ logs, agents, filter, onClearFilter }: { logs: LogEvent[]; agents: AgentRun[]; filter: string | null; onClearFilter: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const names = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);
  const filterIds = useMemo(() => {
    if (!filter) return null;
    const ids = new Set([filter]);
    agents.forEach((a) => a.parentId === filter && ids.add(a.id));
    return ids;
  }, [filter, agents]);
  const visible = useMemo(() => (filterIds ? logs.filter((l) => l.agentId && filterIds.has(l.agentId)) : logs), [logs, filterIds]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [visible, stick]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-y border-line px-3">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">Log</span>
        <div className="flex min-w-0 items-center gap-2">
          {filter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="inline-flex max-w-[160px] items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 text-[10.5px] text-accent outline-none focus-visible:ring-1 focus-visible:ring-accent"
              title="Clear agent filter"
            >
              <span className="truncate">{names.get(filter) ?? filter}</span>
              <X size={10} className="shrink-0" />
            </button>
          )}
          <span className="font-mono text-[10px] text-ink-faint">{visible.length}</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="absolute inset-0 overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-[1.55]" aria-live="polite">
          {visible.length === 0 ? (
            <div className="py-6 text-center font-sans text-[11.5px] text-ink-faint">{filter ? "No log lines for this agent yet." : "Waiting for agent output…"}</div>
          ) : (
            visible.map((l, i) => (
              <div key={i} className={cn("break-words", LEVEL_CLS[l.level] ?? "text-ink-dim")}>
                <span className="text-ink-faint/80">{fmtClock(l.ts)} </span>
                {l.agentId && names.get(l.agentId) && <span className="text-cyan/80">[{names.get(l.agentId)}] </span>}
                <span className={l.level === "info" ? "text-ink-dim" : undefined}>{l.message}</span>
              </div>
            ))
          )}
        </div>
        {!stick && visible.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setStick(true);
              const el = scroller.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="absolute right-3 bottom-2 inline-flex h-6 items-center gap-1 rounded-full border border-line-strong bg-panel-3 px-2 text-[10.5px] text-ink shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <ArrowDown size={11} /> Latest
          </button>
        )}
      </div>
    </div>
  );
}

export function PipelinePanel({ project, logs }: { project: Project | null; logs: LogEvent[] }) {
  const agents = useMemo(() => project?.agents ?? [], [project?.agents]);
  const tree = useMemo(() => buildTree(agents), [agents]);
  const running = agents.some((a) => a.status === "running");
  const now = useNow(running, 1000);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (selected && !agents.some((a) => a.id === selected)) setSelected(null);
  }, [agents, selected]);

  const done = agents.filter((a) => a.status === "done" || a.status === "skipped").length;
  const totalTokens = agents.reduce((s, a) => s + (a.tokensIn ?? 0) + (a.tokensOut ?? 0), 0);
  const pct = agents.length ? Math.round((done / agents.length) * 100) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">Agents</span>
          <span className="font-mono text-[10.5px] text-ink-faint">
            {done}/{agents.length}
            {totalTokens > 0 && <span> · {fmtTokens(totalTokens)} tok</span>}
          </span>
        </div>
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-panel-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full transition-[width] duration-500", project?.status === "error" ? "bg-bad" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="max-h-[58%] min-h-[80px] shrink-0 overflow-y-auto px-1.5 pb-2">
        {tree.length === 0 ? (
          <div className="space-y-2 px-2 py-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-panel-3/60" />
            ))}
          </div>
        ) : (
          <ul>
            {tree.map((n) => (
              <AgentRow key={n.agent.id} node={n} depth={0} now={now} selected={selected} onSelect={setSelected} />
            ))}
          </ul>
        )}
      </div>
      <LogFeed logs={logs} agents={agents} filter={selected} onClearFilter={() => setSelected(null)} />
    </div>
  );
}
