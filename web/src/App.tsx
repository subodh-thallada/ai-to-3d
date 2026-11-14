import { lazy, Suspense } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { TopNav } from "./components/TopNav";
import { EmptyState, ErrorBoundary, Spinner } from "./components/ui";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";

const LandscapePage = lazy(() => import("./pages/LandscapePage"));
const ComponentLibraryPage = lazy(() => import("./cad").then((m) => ({ default: m.ComponentLibraryPage })));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-ink-dim">
      <Spinner /> Loading…
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon={<Compass size={28} />}
      title="Page not found"
      action={
        <Link
          to="/"
          className="inline-flex h-8 items-center rounded-md border border-accent bg-accent px-3 text-[12.5px] font-semibold text-[#1a0d02] outline-none hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Back to Studio
        </Link>
      }
    >
      There is nothing at this address.
    </EmptyState>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <div className="flex h-full min-w-[1024px] flex-col bg-bg text-[13px] text-ink">
      <TopNav />
      <main className="relative min-h-0 flex-1">
        <ErrorBoundary label="This page" resetKey={location.pathname}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/p/:id" element={<ProjectPage />} />
              <Route path="/landscape" element={<LandscapePage />} />
              <Route
                path="/library"
                element={
                  <div className="h-full overflow-auto">
                    <ComponentLibraryPage />
                  </div>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
