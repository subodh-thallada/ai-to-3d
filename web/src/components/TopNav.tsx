import { NavLink, Link, useLocation } from "react-router-dom";
import { Database, HardDrive, Unplug } from "lucide-react";
import { cn } from "../lib/format";
import { useHealth } from "../lib/hooks";
import { Logo } from "./ui";

function NavItem({ to, children, matchPrefix }: { to: string; children: React.ReactNode; matchPrefix?: string }) {
  const { pathname } = useLocation();
  const extraActive = matchPrefix ? pathname.startsWith(matchPrefix) : false;
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "relative flex h-11 items-center px-3 text-[12.5px] outline-none transition-colors focus-visible:text-ink focus-visible:underline",
          isActive || extraActive ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-accent" : "text-ink-dim hover:text-ink",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function StorageBadge() {
  const { health, error, loading } = useHealth();
  if (loading && !health) {
    return <span className="h-5 w-24 animate-pulse rounded-full bg-panel-3" aria-hidden />;
  }
  if (error && !health) {
    return (
      <span title={error} className="inline-flex h-5 items-center gap-1.5 rounded-full border border-bad/40 bg-bad/10 px-2 text-[11px] text-bad">
        <Unplug size={11} /> Server offline
      </span>
    );
  }
  if (!health) return null;
  const mongo = health.storage === "mongodb";
  return (
    <span
      title={mongo ? "Projects are persisted in MongoDB" : `Projects are saved to a local JSON store${health.mongoError ? ` — MongoDB unavailable: ${health.mongoError}` : ""}`}
      className={cn(
        "inline-flex h-5 cursor-default items-center gap-1.5 rounded-full border px-2 text-[11px]",
        mongo ? "border-ok/35 bg-ok/10 text-ok" : "border-warn/35 bg-warn/10 text-warn",
      )}
    >
      {mongo ? <Database size={11} /> : <HardDrive size={11} />}
      {mongo ? "MongoDB" : "Local store"}
    </span>
  );
}

function ModelInfo() {
  const { health } = useHealth();
  if (!health) return null;
  return (
    <div className="hidden items-center gap-2 lg:flex" title={health.anthropic ? "Anthropic API key configured" : "ANTHROPIC_API_KEY is not set on the server"}>
      <span className={cn("h-1.5 w-1.5 rounded-full", health.anthropic ? "bg-ok" : "bg-bad")} />
      <span className="font-mono text-[10.5px] text-ink-faint">
        {health.models?.heavy}
        {health.models?.fast && health.models.fast !== health.models.heavy ? <span className="text-ink-faint/70"> · {health.models.fast}</span> : null}
      </span>
    </div>
  );
}

export function TopNav() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
      <Link to="/" className="mr-3 flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/60" aria-label="Protoforge home">
        <Logo size={20} />
        <span className="text-[13.5px] font-semibold tracking-tight text-ink">Protoforge</span>
      </Link>
      <nav className="flex items-center" aria-label="Primary">
        <NavItem to="/" matchPrefix="/p/">
          Studio
        </NavItem>
        <NavItem to="/landscape">Landscape</NavItem>
        <NavItem to="/library">Component library</NavItem>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <ModelInfo />
        <StorageBadge />
      </div>
    </header>
  );
}
