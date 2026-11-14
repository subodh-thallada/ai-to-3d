import { useEffect, useState } from "react";
import { create } from "zustand";
import type { HealthInfo } from "@protoforge/shared";
import { getHealth } from "../api";

/** Current time, re-rendering every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}

interface HealthState {
  health: HealthInfo | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  health: null,
  error: null,
  loading: true,
  refresh: async () => {
    try {
      const h = await getHealth();
      set({ health: h, error: null, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },
}));

let healthTimer: ReturnType<typeof setInterval> | null = null;
let healthSubscribers = 0;

/** Shared /api/health state, refreshed every 30 s while any component uses it. */
export function useHealth(): HealthState {
  const state = useHealthStore();
  useEffect(() => {
    healthSubscribers += 1;
    if (healthSubscribers === 1) {
      void useHealthStore.getState().refresh();
      healthTimer = setInterval(() => void useHealthStore.getState().refresh(), 30000);
    }
    return () => {
      healthSubscribers -= 1;
      if (healthSubscribers === 0 && healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }
    };
  }, []);
  return state;
}

/** Run `handler` on window keydown unless the user is typing in a field or holding a modifier. */
export function useHotkeys(handler: (e: KeyboardEvent) => void, deps: unknown[]): void {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      handler(e);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
