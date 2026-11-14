import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  ChevronRight,
  CircuitBoard,
  ClipboardCheck,
  CodeXml,
  CornerDownLeft,
  FolderOpen,
  Layers,
  Package,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Trash,
  TriangleExclamationPoint,
  Wrench,
} from "lucide-react";
import type { ProjectSummary } from "@protoforge/shared";
import { createProject, deleteProject, listProjects } from "../api";
import { Badge, Button, EmptyState, Skeleton, Spinner, StatusPill } from "../components/ui";
import { cn, fmtNum, fmtRelative, fmtUsd } from "../lib/format";
import { useHealth } from "../lib/hooks";
import { scoreColor } from "../lib/metrics";

const EXAMPLES = [
  "Build a 5-inch FPV racing drone",
  "Build an iPhone",
  "Build a 6-DOF desktop robot arm",
  "Build a smart weather station",
  "Build a two-wheeled self-balancing robot",
  "Build a mechanical keyboard",
];

const PIPELINE = [
  { name: "Architect", icon: Sparkles, desc: "Product brief, subsystems, envelopes & interface coordinates" },
  { name: "CAD sub-agents", icon: Boxes, desc: "One agent per subsystem models custom parts and joints" },
  { name: "Sourcing", icon: Package, desc: "Real purchasable parts, part numbers, prices" },
  { name: "Electronics", icon: CircuitBoard, desc: "Netlist, pin-level wiring, power budget" },
  { name: "Firmware", icon: CodeXml, desc: "Buildable source, libraries, pin map" },
  { name: "Integration", icon: Layers, desc: "Cross-subsystem mates, links CAD ↔ BOM ↔ circuit" },
  { name: "Assembly", icon: Wrench, desc: "Ordered build steps tied to 3D parts" },
  { name: "Review", icon: ClipboardCheck, desc: "Deterministic checks + engineering reviewer" },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function PromptBox() {
  const navigate = useNavigate();
  const { health } = useHealth();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = useCallback(
    async (text?: string) => {
      const value = (text ?? prompt).trim();
      if (!value || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const { id } = await createProject(value);
        navigate(`/p/${encodeURIComponent(id)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSubmitting(false);
      }
    },
    [prompt, submitting, navigate],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div>
      <div className="rounded-xl border border-line-strong bg-panel transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
        <label htmlFor="prompt" className="sr-only">
          Describe the product to build
        </label>
        <textarea
          id="prompt"
          ref={ref}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          maxLength={4000}
          disabled={submitting}
          placeholder="Describe a product… e.g. “Build a 5-inch FPV racing drone with GPS rescue and a 6S battery”"
          className="block w-full resize-none rounded-t-xl bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
          <div className="flex items-center gap-2 text-[11.5px] text-ink-faint">
            <kbd className="rounded border border-line-strong bg-panel-2 px-1.5 font-mono text-[10.5px] text-ink-dim">{isMac ? "⌘" : "Ctrl"}</kbd>
            <span>+</span>
            <kbd className="inline-flex items-center rounded border border-line-strong bg-panel-2 px-1.5 py-[1px] text-ink-dim">
              <CornerDownLeft size={10} />
            </kbd>
            <span>to generate</span>
            {prompt.length > 3500 && <span className="font-mono text-warn">{fmtNum(prompt.length)}/4000</span>}
          </div>
          <Button variant="primary" size="md" onClick={() => void submit()} disabled={!prompt.trim() || submitting}>
            {submitting ? <Spinner className="text-[#1a0d02]" /> : <Sparkles size={14} />}
            {submitting ? "Starting pipeline…" : "Generate product"}
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-bad">
          <TriangleExclamationPoint size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {health && !health.anthropic && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
          <TriangleExclamationPoint size={14} className="mt-0.5 shrink-0" />
          <span>
            The server has no <code className="font-mono">ANTHROPIC_API_KEY</code> configured — agent runs will fail until it is set.
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={submitting}
            onClick={() => {
              setPrompt(ex);
              ref.current?.focus();
            }}
            onDoubleClick={() => void submit(ex)}
            title="Click to use · double-click to generate"
            className="h-7 rounded-full border border-line-strong bg-panel-2 px-3 text-[12px] text-ink-dim transition-colors outline-none hover:border-accent/50 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function PipelineStrip() {
  return (
    <section aria-labelledby="how-title">
      <h2 id="how-title" className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
        How it works
      </h2>
      <ol className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line 2xl:grid-cols-8">
        {PIPELINE.map((s, i) => (
          <li key={s.name} className="relative bg-panel px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
              <s.icon size={14} className="text-accent" />
              <span className="truncate text-[12.5px] font-medium text-ink">{s.name}</span>
              {i < PIPELINE.length - 1 && <ChevronRight size={13} className="ml-auto shrink-0 text-ink-faint" />}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-dim">{s.desc}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProjectCard({ p, onDelete }: { p: ProjectSummary; onDelete: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);

  const title = p.name || p.prompt;
  return (
    <div className="group relative flex min-h-[148px] flex-col rounded-lg border border-line bg-panel transition-colors hover:border-line-strong">
      <Link to={`/p/${encodeURIComponent(p.id)}`} className="flex flex-1 flex-col rounded-lg p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        <div className="flex items-start justify-between gap-2 pr-7">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink" title={title}>
              {title}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-dim">{p.tagline || (p.name ? p.prompt : "Generating product brief…")}</div>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <StatusPill status={p.status} />
          {p.category && <Badge>{p.category}</Badge>}
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-[11px]">
          <div>
            <div className="text-ink-faint">Parts</div>
            <div className="font-mono text-ink tabular-nums">{p.partCount !== undefined ? fmtNum(p.partCount) : "—"}</div>
          </div>
          <div>
            <div className="text-ink-faint">Cost</div>
            <div className="font-mono text-ink tabular-nums">{fmtUsd(p.costUsd, { whole: (p.costUsd ?? 0) >= 1000 })}</div>
          </div>
          <div>
            <div className="text-ink-faint">Score</div>
            <div className="font-mono tabular-nums" style={{ color: scoreColor(p.score) }}>
              {p.score !== undefined ? Math.round(p.score) : "—"}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[10.5px] text-ink-faint" title={new Date(p.createdAt).toLocaleString()}>
          {fmtRelative(p.updatedAt || p.createdAt)}
        </div>
      </Link>
      <button
        type="button"
        disabled={deleting}
        onClick={async () => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setDeleting(true);
          try {
            await onDelete(p.id);
          } finally {
            setDeleting(false);
            setConfirming(false);
          }
        }}
        aria-label={confirming ? `Confirm delete ${title}` : `Delete ${title}`}
        title={confirming ? "Click again to delete" : "Delete project"}
        className={cn(
          "absolute top-2.5 right-2.5 inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] outline-none transition focus-visible:ring-2 focus-visible:ring-accent/60",
          confirming ? "border-bad/50 bg-bad/15 text-bad opacity-100" : "border-transparent text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-panel-3 hover:text-bad",
        )}
      >
        {deleting ? <Spinner size={12} /> : <Trash size={12} />}
        {confirming && !deleting && "Delete?"}
      </button>
    </div>
  );
}

function RecentProjects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(Array.isArray(list) ? list : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep running projects fresh
  const anyRunning = projects?.some((p) => p.status === "running" || p.status === "queued") ?? false;
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  const onDelete = useCallback(async (id: string) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <section aria-labelledby="recent-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="recent-title" className="text-[11px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          Recent projects {projects && projects.length > 0 && <span className="ml-1 font-mono text-ink-faint/80">{projects.length}</span>}
        </h2>
        <Button variant="ghost" onClick={() => void load()} aria-label="Refresh projects">
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>
      {error && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-bad">
          <span className="flex items-center gap-2">
            <TriangleExclamationPoint size={14} /> {error}
          </span>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
      {loading && !projects ? (
        <div className="grid grid-cols-3 gap-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[148px] rounded-lg" />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 2xl:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} onDelete={onDelete} />
          ))}
        </div>
      ) : !error ? (
        <div className="rounded-lg border border-dashed border-line-strong">
          <EmptyState icon={<FolderOpen size={26} />} title="No projects yet" className="min-h-[180px]">
            Describe a product above — the agents will design it end to end and it will appear here.
          </EmptyState>
        </div>
      ) : null}
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-8 pt-14 pb-16">
        <section>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-2.5 py-1 text-[11px] text-ink-dim">
            <ScanSearch size={12} className="text-accent" /> Multi-agent hardware design studio
          </div>
          <h1 className="max-w-3xl text-[34px] leading-[1.15] font-semibold tracking-tight text-ink">
            Describe a product. Get the CAD, circuit, firmware and BOM.
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
            A pipeline of Claude agents architects the product, models every custom part around real purchasable components, wires the electronics pin by pin, writes the firmware, plans assembly and reviews the result.
          </p>
          <div className="mt-6 max-w-[880px]">
            <PromptBox />
          </div>
        </section>
        <PipelineStrip />
        <RecentProjects />
        <div className="flex items-center gap-4 border-t border-line pt-5 text-[12px] text-ink-faint">
          <Link to="/library" className="inline-flex items-center gap-1 rounded outline-none hover:text-ink focus-visible:text-ink">
            Browse the component library <ArrowRight size={12} />
          </Link>
          <Link to="/landscape" className="inline-flex items-center gap-1 rounded outline-none hover:text-ink focus-visible:text-ink">
            Industry landscape <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
