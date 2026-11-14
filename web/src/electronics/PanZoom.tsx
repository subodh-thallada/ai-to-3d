import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, Plus } from "lucide-react";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface View {
  x: number;
  y: number;
  k: number;
}

/**
 * SVG canvas with drag-to-pan, wheel zoom (around the cursor) and a fit button.
 * Fills its parent. Children are rendered in content coordinates.
 */
export function PanZoom({
  bounds,
  children,
  defs,
  onBackgroundClick,
  overlay,
  background = "transparent",
  maxFitScale = 2.2,
}: {
  bounds: Bounds;
  children: ReactNode;
  defs?: ReactNode;
  onBackgroundClick?: () => void;
  overlay?: ReactNode;
  background?: string;
  maxFitScale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const fittedKey = useRef("");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h || bounds.w <= 0 || bounds.h <= 0) return;
    const pad = 24;
    const k = Math.max(0.05, Math.min(maxFitScale, (size.w - pad * 2) / bounds.w, (size.h - pad * 2) / bounds.h));
    setView({ k, x: (size.w - bounds.w * k) / 2 - bounds.x * k, y: (size.h - bounds.h * k) / 2 - bounds.y * k });
  }, [size.w, size.h, bounds.x, bounds.y, bounds.w, bounds.h, maxFitScale]);

  useEffect(() => {
    const key = `${bounds.x}|${bounds.y}|${bounds.w}|${bounds.h}|${size.w > 0 && size.h > 0}`;
    if (size.w > 0 && size.h > 0 && fittedKey.current !== key) {
      fittedKey.current = key;
      fit();
    }
  }, [fit, bounds.x, bounds.y, bounds.w, bounds.h, size.w, size.h]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => {
        const k = Math.min(30, Math.max(0.05, v.k * factor));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (f: number) =>
    setView((v) => {
      const mx = size.w / 2;
      const my = size.h / 2;
      const k = Math.min(30, Math.max(0.05, v.k * f));
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden select-none" style={{ background, touchAction: "none" }}>
      <svg
        width={size.w}
        height={size.h}
        className="absolute inset-0 block"
        style={{ cursor: drag.current?.active ? "grabbing" : "grab" }}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, active: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.sx;
          const dy = e.clientY - d.sy;
          if (!d.active && Math.hypot(dx, dy) > 4) {
            d.active = true;
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          }
          if (d.active) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (d?.active) {
            suppressClick.current = true;
            try {
              (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
            } catch {
              /* pointer already released */
            }
          }
          drag.current = null;
        }}
        onPointerCancel={() => (drag.current = null)}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).getAttribute?.("data-bg") === "1") onBackgroundClick?.();
        }}
      >
        {defs ? <defs>{defs}</defs> : null}
        <rect data-bg="1" x={0} y={0} width={size.w} height={size.h} fill="transparent" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>{children}</g>
      </svg>
      {overlay}
      <div className="absolute right-2 bottom-2 flex items-center gap-px rounded-md border border-line bg-panel/90 p-0.5 backdrop-blur">
        <button type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.25)} className="grid h-6 w-6 place-items-center rounded text-ink-dim hover:bg-panel-3 hover:text-ink">
          <Minus size={13} />
        </button>
        <span className="w-10 text-center font-mono text-[10px] text-ink-faint">{Math.round(view.k * 100)}%</span>
        <button type="button" title="Zoom in" onClick={() => zoomBy(1.25)} className="grid h-6 w-6 place-items-center rounded text-ink-dim hover:bg-panel-3 hover:text-ink">
          <Plus size={13} />
        </button>
        <button type="button" title="Fit to view" onClick={fit} className="grid h-6 w-6 place-items-center rounded text-ink-dim hover:bg-panel-3 hover:text-ink">
          <Maximize size={12} />
        </button>
      </div>
    </div>
  );
}

/** Floating tooltip positioned relative to the nearest positioned ancestor. */
export function Tip({ x, y, children, containerW }: { x: number; y: number; children: ReactNode; containerW?: number }) {
  const flip = containerW !== undefined && x > containerW - 300;
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[300px] rounded-md border border-line-strong bg-panel/95 px-2.5 py-2 text-[11px] leading-snug text-ink shadow-xl shadow-black/40 backdrop-blur"
      style={{ left: flip ? undefined : x + 14, right: flip && containerW !== undefined ? containerW - x + 14 : undefined, top: y + 14 }}
    >
      {children}
    </div>
  );
}
