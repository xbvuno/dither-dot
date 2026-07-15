import { Suspense, lazy } from "react";
import usePageStore, { PAGE } from "../stores/pageStore";

const ImportPage = lazy(() => import("../pages/ImportPage"));
const ResizingPage = lazy(() => import("../pages/ResizingPage"));
const AdjustmentsPage = lazy(() => import("../pages/AdjustmentsPage"));
const DitherPage = lazy(() => import("../pages/DitherPage"));
const ExportPage = lazy(() => import("../pages/ExportPage"));
const PalettePage = lazy(() => import("../pages/PalettePage"));

const PAGES = {
  [PAGE.IMPORT]: ImportPage,
  [PAGE.RESIZING]: ResizingPage,
  [PAGE.ADJUSTMENTS]: AdjustmentsPage,
  [PAGE.DITHER]: DitherPage,
  [PAGE.EXPORT]: ExportPage,
  [PAGE.PALETTE]: PalettePage,
};

export default function AsideRouter() {
  const currentPage = usePageStore(s => s.currentPage);
  const PageComponent = PAGES[currentPage];

  if (!PageComponent) return null;

  return (
    <Suspense fallback={null}>
      <PageComponent />
    </Suspense>
  );
}
