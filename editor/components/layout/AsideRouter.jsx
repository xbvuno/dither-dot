import { Suspense, lazy } from "react";
import usePageStore, { PAGE } from "../../stores/ui/pageStore";
import WaveGridSpinner from "../ui/shared/WaveGridSpinner";

const ImportPage = lazy(() => import("../../pages/ImportPage"));
const PinnedPage = lazy(() => import("../../pages/PinnedPage"));
const ResizingPage = lazy(() => import("../../pages/ResizingPage"));
const AdjustmentsPage = lazy(() => import("../../pages/AdjustmentsPage"));
const DitherPage = lazy(() => import("../../pages/DitherPage"));
const ExportPage = lazy(() => import("../../pages/ExportPage"));
const PalettePage = lazy(() => import("../../pages/PalettePage"));
const SettingsPage = lazy(() => import("../../pages/SettingsPage"));

const PAGES = {
  [PAGE.IMPORT]: ImportPage,
  [PAGE.PINNED]: PinnedPage,
  [PAGE.RESIZING]: ResizingPage,
  [PAGE.ADJUSTMENTS]: AdjustmentsPage,
  [PAGE.DITHER]: DitherPage,
  [PAGE.EXPORT]: ExportPage,
  [PAGE.PALETTE]: PalettePage,
  [PAGE.SETTINGS]: SettingsPage,
};

export function AsideLoadingFallback({ label = "LOADING PANEL..." }) {
  return (
    <div className="aside-loading-container" role="status" aria-label={label}>
      <WaveGridSpinner />
      <span className="bv-label aside-loading-text">{label}</span>
    </div>
  );
}

// Preload aside components on idle for instant, prioritized rendering
if (typeof window !== "undefined") {
  const preloadPages = () => {
    import("../../pages/ResizingPage");
    import("../../pages/AdjustmentsPage");
    import("../../pages/DitherPage");
    import("../../pages/ExportPage");
    import("../../pages/PalettePage");
    import("../../pages/SettingsPage");
    import("../../pages/PinnedPage");
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preloadPages);
  } else {
    setTimeout(preloadPages, 200);
  }
}

export default function AsideRouter() {
  const currentPage = usePageStore(s => s.currentPage);
  const PageComponent = PAGES[currentPage];

  if (!PageComponent) return null;

  return (
    <Suspense fallback={<AsideLoadingFallback />}>
      <PageComponent />
    </Suspense>
  );
}
