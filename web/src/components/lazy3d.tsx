import { lazy, Suspense, type ComponentProps } from "react";
import type * as CadModule from "../cad";
import type * as ElectronicsModule from "../electronics";
import { ErrorBoundary, Spinner } from "./ui";

/* The 3D and electronics modules are heavy (three.js, CSG); load them on demand and isolate their failures. */

const CadViewerLazy = lazy(() => import("../cad").then((m) => ({ default: m.CadViewer })));
const CadWorkspaceLazy = lazy(() => import("../cad").then((m) => ({ default: m.CadWorkspace })));
const ElectronicsWorkspaceLazy = lazy(() => import("../electronics").then((m) => ({ default: m.ElectronicsWorkspace })));

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-[12px] text-ink-faint">
      <Spinner size={13} /> {label}
    </div>
  );
}

export function CadViewer(props: ComponentProps<typeof CadModule.CadViewer>) {
  return (
    <ErrorBoundary label="3D viewer">
      <Suspense fallback={<Loading label="Loading 3D viewer…" />}>
        <CadViewerLazy {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function CadWorkspace(props: ComponentProps<typeof CadModule.CadWorkspace>) {
  return (
    <ErrorBoundary label="3D CAD workspace">
      <Suspense fallback={<Loading label="Loading CAD workspace…" />}>
        <CadWorkspaceLazy {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function ElectronicsWorkspace(props: ComponentProps<typeof ElectronicsModule.ElectronicsWorkspace>) {
  return (
    <ErrorBoundary label="Electronics workspace">
      <Suspense fallback={<Loading label="Loading electronics workspace…" />}>
        <ElectronicsWorkspaceLazy {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
