import { Suspense, lazy } from 'react';
import { RouterProvider, useRouter } from './router/router';
import WaveGridSpinner from './components/ui/shared/WaveGridSpinner';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const ImportRoute = lazy(() => import('./pages/ImportRoute'));
const EditorPage = lazy(() => import('./pages/EditorPage'));

function AppRoutes() {
  const { path } = useRouter();

  let Component = LandingPage;
  if (path === '/import' || path.startsWith('/import/')) {
    Component = ImportRoute;
  } else if (path === '/editor' || path.startsWith('/editor/')) {
    Component = EditorPage;
  } else if (path === '/') {
    Component = LandingPage;
  }

  return (
    <Suspense
      fallback={
        <div className='zoomable-loading-overlay' style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          <WaveGridSpinner />
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AppRoutes />
    </RouterProvider>
  );
}
