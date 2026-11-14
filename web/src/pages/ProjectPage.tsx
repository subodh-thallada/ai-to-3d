import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Boxes,
  CircuitBoard,
  ClipboardCheck,
  CodeXml,
  FileSearch,
  History,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  TriangleExclamationPoint,
  Wrench,
} from "lucide-react";
import type { LogEvent, Project, StageId } from "@protoforge/shared";
import { refineProject, useProjectStream } from "../api";
import { PipelinePanel } from "../components/PipelinePanel";
import { CadWorkspace, ElectronicsWorkspace } from "../components/lazy3d";
import { AgentStatusIcon, Badge, Button, EmptyState, Skeleton, Spinner, StatusPill, WorkingState } from "../components/ui";
import { cn, fmtDateTime, fmtRelative } from "../lib/format";
import { stageStatus } from "../lib/metrics";
import { OverviewTab } from "./project/OverviewTab";
import { FirmwareTab } from "./project/FirmwareTab";
import { BomTab } from "./project/BomTab";
import { AssemblyTab } from "./project/AssemblyTab";
import { ReviewTab } from "./project/ReviewTab";

type TabId = "overview" | "cad" | "electronics" | "firmware" | "bom" | "assembly" | "review";

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Boxes;
  stage: StageId;
  has: (p: Project) => boolean;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, stage: "architect", has: (p) => !!p.brief },
  { id: "cad", label: "3D CAD", icon: Boxes, stage: "cad", has: (p) => !!p.cad && Array.isArray(p.cad.parts) && p.cad.parts.length > 0 },
  { id: "electronics", label: "Electronics", icon: CircuitBoard, stage: "electronics", has: (p) => p.electronics !== undefined },
  { id: "firmware", label: "Firmware", icon: CodeXml, stage: "firmware", has: (p) => p.firmware !== undefined },
  { id: "bom", label: "BOM", icon: Package, stage: "sourcing", has: (p) => Array.isArray(p.bom) && p.bom.length > 0 },
  { id: "assembly", label: "Assembly", icon: Wrench, stage: "assembly", has: (p) => Array.isArray(p.assembly) && p.assembly.length > 0 },
  { id: "review", label: "Review", icon: ClipboardCheck, stage: "review", has: (p) => !!p.review },
];

const FULL_BLEED: TabId[] = ["cad", "electronics", "assembly"];
const RAIL_KEY = "protoforge.rail.collapsed";

function readRail(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

function writeRail(v: boolean) {
  try {
    localStorage.setItem(RAIL_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable — preference is per-session only */
  }
}

function RefineForm({ project, onStarted }: { project: Project; onStarted: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = project.status === "running" || project.status === "queued";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const instruction = text.trim();
    if (!instruction || busy || running) return;
    setBusy(true);
    setError(null);
    try {
      await refineProject(project.id, instruction);
      setText("");
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="relative flex w-[min(420px,36vw)] shrink-0 items-center gap-1.5">
      <label htmlFor="refine" className="sr-only">
        Describe a change
      </label>
      <input
        id="refine"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy || running}
        maxLength={2000}
        placeholder={running ? "Wait for the pipeline to finish to refine…" : "Describe a change… e.g. “use a 4S battery and add GPS”"}
        className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-panel-2 px-2.5 text-[12.5px] text-ink placeholder:text-ink-faint outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15 disabled:opacity-55"
      />
      <Button type="submit" variant="primary" className="h-8" disabled={!text.trim() || busy || running} title="Re-run the pipeline with this change">
        {busy ? <Spinner size={13} className="text-[#1a0d02]" /> : <Send size={13} />}
        Refine
      </Button>
      {error && (
        <div role="alert" className="absolute top-full right-0 z-20 mt-1 max-w-full rounded-md border border-bad/40 bg-panel px-2 py-1 text-[11.5px] text-bad shadow-lg">
          {error}
        </div>
      )}
    </form>
  );
}

function Header({ project, live, onRefineStarted }: { project: Project; live: { connected: boolean; mode: string }; onRefineStarted: () => void }) {
  const b = project.brief;
  const revisions = project.revisions ?? [];
  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-line bg-panel px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink" title={project.prompt}>
            {b?.name ?? project.prompt}
          </h1>
          <StatusPill status={project.status} />
          {b?.category && <Badge>{b.category}</Badge>}
          {revisions.length > 0 && (
            <Badge tone="cyan" title={revisions.map((r, i) => `Rev ${i + 1} · ${fmtDateTime(r.at)}: ${r.instruction}`).join("\n")}>
              <History size={10} className="mr-1" />
              {revisions.length} {revisions.length === 1 ? "revision" : "revisions"}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-ink-dim">
          <span className="truncate">{b ? b.tagline : <span className="text-ink-faint">“{project.prompt}”</span>}</span>
          <span className="shrink-0 text-ink-faint">·</span>
          <span className="shrink-0 text-ink-faint" title={fmtDateTime(project.createdAt)}>
            created {fmtRelative(project.createdAt)}
          </span>
          {(project.status === "running" || project.status === "queued") && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-faint" title={live.connected ? "Live updates via server-sent events" : "Live stream unavailable — polling every 3 s"}>
              <span className={cn("h-1.5 w-1.5 rounded-full", live.connected ? "bg-ok" : "bg-warn")} />
              {live.connected ? "live" : live.mode === "polling" ? "polling" : "connecting"}
            </span>
          )}
        </div>
      </div>
      <RefineForm project={project} onStarted={onRefineStarted} />
    </div>
  );
}

function TabBar({ project, active, onChange }: { project: Project; active: TabId; onChange: (t: TabId) => void }) {
  const finished = project.status === "done" || project.status === "error";
  return (
    <div role="tablist" aria-label="Project views" className="flex h-9 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-line bg-panel px-2">
      {TABS.map((t) => {
        const has = t.has(project);
        const st = stageStatus(project.agents, t.stage);
        const enabled = has || st === "running" || st === "error" || finished || t.id === "overview";
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={!enabled}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 px-3 text-[12.5px] whitespace-nowrap outline-none transition-colors focus-visible:bg-panel-2",
              isActive ? "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-accent" : "text-ink-dim hover:text-ink",
              !enabled && "cursor-not-allowed opacity-40 hover:text-ink-dim",
            )}
          >
            <t.icon size={13} className={isActive ? "text-accent" : undefined} />
            {t.label}
            {!has && st && st !== "done" && st !== "skipped" && (
              <span className="ml-0.5">
                <AgentStatusIcon status={st} size={11} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TabContent({ project, tab, onTab }: { project: Project; tab: TabId; onTab: (t: TabId) => void }) {
  const def = TABS.find((t) => t.id === tab)!;
  const st = stageStatus(project.agents, def.stage);
  const finished = project.status === "done" || project.status === "error";

  if (!def.has(project)) {
    if (finished && st !== "error") {
      const messages: Record<TabId, string> = {
        overview: "The architect did not produce a product brief.",
        cad: "No CAD geometry was generated for this project.",
        electronics: "This product has no electronics.",
        firmware: "This product has no firmware.",
        bom: "No bill of materials was produced.",
        assembly: "No assembly steps were produced.",
        review: "The engineering review did not run.",
      };
      return <EmptyState icon={<FileSearch size={26} />} title={`No ${def.label.toLowerCase()} data`}>{messages[tab]}</EmptyState>;
    }
    const agentErr = project.agents.find((a) => a.stage === def.stage && a.status === "error")?.error;
    return <WorkingState title={def.label} status={st ?? "pending"} detail={st === "error" ? agentErr : undefined} />;
  }

  switch (tab) {
    case "overview":
      return <OverviewTab project={project} onOpenTab={(t) => onTab(t as TabId)} />;
    case "cad":
      return <CadWorkspace model={project.cad!} bom={project.bom} electronics={project.electronics ?? null} className="h-full w-full" />;
    case "electronics":
      return project.electronics ? (
        <ElectronicsWorkspace electronics={project.electronics} bom={project.bom} firmware={project.firmware ?? null} className="h-full w-full" />
      ) : (
        <EmptyState icon={<CircuitBoard size={26} />} title="No electronics">
          The architect decided this product is purely mechanical, so no circuit was designed.
        </EmptyState>
      );
    case "firmware":
      return project.firmware ? (
        <FirmwareTab firmware={project.firmware} productName={project.brief?.name ?? "firmware"} />
      ) : (
        <EmptyState icon={<CodeXml size={26} />} title="No firmware">
          This product has no programmable electronics, so no firmware was written.
        </EmptyState>
      );
    case "bom":
      return <BomTab bom={project.bom!} cad={project.cad} productName={project.brief?.name ?? "bom"} />;
    case "assembly":
      return <AssemblyTab steps={project.assembly!} cad={project.cad} />;
    case "review":
      return <ReviewTab review={project.review!} />;
  }
}

function LoadingPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="ml-auto h-8 w-[360px]" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[300px] space-y-2 border-r border-line p-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-full" />
        </div>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  // Dev-only: /p/demo renders a local fixture project so every view can be checked without the server.
  const isDemo = import.meta.env.DEV && id === "demo";
  const stream = useProjectStream(isDemo ? undefined : id);
  const [demo, setDemo] = useState<{ project: Project; logs: LogEvent[] } | null>(null);
  useEffect(() => {
    if (!isDemo) return;
    let alive = true;
    void import("../lib/devFixtures").then((m) => alive && setDemo({ project: m.DEMO_PROJECT, logs: m.DEMO_LOGS }));
    return () => {
      alive = false;
    };
  }, [isDemo]);
  const project = isDemo ? (demo?.project ?? null) : stream.project;
  const logs = isDemo ? (demo?.logs ?? []) : stream.logs;
  const { notFound, error } = stream;
  const [params, setParams] = useSearchParams();
  const [railCollapsed, setRailCollapsed] = useState(readRail);

  const tabParam = params.get("tab") as TabId | null;
  const tab: TabId = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "overview";
  const setTab = useCallback(
    (t: TabId) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (t === "overview") next.delete("tab");
          else next.set("tab", t);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    if (project?.brief?.name) document.title = `${project.brief.name} · Protoforge`;
    else document.title = "Protoforge — prompt to product";
    return () => {
      document.title = "Protoforge — prompt to product";
    };
  }, [project?.brief?.name]);

  const toggleRail = () =>
    setRailCollapsed((c) => {
      writeRail(!c);
      return !c;
    });

  const onRefineStarted = useCallback(() => {
    if (stream.project) stream.setProject({ ...stream.project, status: "running" });
    stream.reconnect();
  }, [stream]);

  const overallRunning = useMemo(() => project?.agents.filter((a) => a.status === "running").length ?? 0, [project?.agents]);

  if (notFound) {
    return (
      <EmptyState
        icon={<FileSearch size={28} />}
        title="Project not found"
        action={
          <Link to="/" className="inline-flex h-8 items-center rounded-md border border-line-strong bg-panel-2 px-3 text-[12.5px] text-ink outline-none hover:bg-panel-3 focus-visible:ring-2 focus-visible:ring-accent/60">
            Back to Studio
          </Link>
        }
      >
        It may have been deleted. Projects are listed on the Studio page.
      </EmptyState>
    );
  }

  if (!project) {
    if (error) {
      return (
        <EmptyState icon={<TriangleExclamationPoint size={28} className="text-bad" />} title="Could not load project" action={<Button onClick={stream.reconnect}>Retry</Button>}>
          {error}
        </EmptyState>
      );
    }
    return <LoadingPage />;
  }

  const fullBleed = FULL_BLEED.includes(tab);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header project={project} live={stream} onRefineStarted={onRefineStarted} />
      {project.status === "error" && project.error && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-bad/30 bg-bad/10 px-4 py-2 text-[12.5px] text-bad">
          <TriangleExclamationPoint size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">Pipeline failed: {project.error}</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn("flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-200", railCollapsed ? "w-10" : "w-[300px]")}
          aria-label="Agent pipeline"
        >
          <div className={cn("flex h-9 shrink-0 items-center border-b border-line", railCollapsed ? "justify-center" : "justify-between pr-1.5 pl-3")}>
            {!railCollapsed && (
              <span className="flex items-center gap-2 text-[12px] font-medium text-ink">
                Pipeline
                {overallRunning > 0 && <span className="font-mono text-[10.5px] text-accent">{overallRunning} running</span>}
              </span>
            )}
            <button
              type="button"
              onClick={toggleRail}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-faint outline-none hover:bg-panel-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label={railCollapsed ? "Expand pipeline panel" : "Collapse pipeline panel"}
              aria-expanded={!railCollapsed}
            >
              {railCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </div>
          {railCollapsed ? (
            <div className="flex flex-col items-center gap-2 py-3">
              {project.agents
                .filter((a) => !a.parentId)
                .map((a) => (
                  <span key={a.id} title={`${a.name} · ${a.status}`}>
                    <AgentStatusIcon status={a.status} size={13} />
                  </span>
                ))}
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <PipelinePanel project={project} logs={logs} />
            </div>
          )}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <TabBar project={project} active={tab} onChange={setTab} />
          <div role="tabpanel" className={cn("relative min-h-0 flex-1", fullBleed ? "overflow-hidden" : "overflow-y-auto")}>
            {fullBleed ? (
              <div className="absolute inset-0">
                <TabContent project={project} tab={tab} onTab={setTab} />
              </div>
            ) : (
              <TabContent project={project} tab={tab} onTab={setTab} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
