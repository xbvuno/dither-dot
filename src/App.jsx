import { Suspense, lazy, useState, useEffect } from 'react';
import { RouterProvider, useRouter } from './router/router';
import WaveGridSpinner from './components/ui/shared/WaveGridSpinner';
import useImageStore from './stores/media/imageStore';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));

function AppRoutes() {
  const { path, navigate } = useRouter();
  const [appReady, setAppReady] = useState(() => path === '/');

  useEffect(() => {
    if (path === '/') {
      navigate('/editor', { replace: true });
      return;
    }
    if (useImageStore.getState().engineReady) {
      setAppReady(true);
      return;
    }
    const unsub = useImageStore.subscribe((state) => {
      if (state.engineReady) {
        setAppReady(true);
      }
    });
    return () => unsub();
  }, [path]);

  let Component = LandingPage;
  if (path === '/editor' || path.startsWith('/editor/') || path === '/import' || path.startsWith('/import/')) {
    Component = EditorPage;
  } else if (path === '/') {
    Component = LandingPage;
  }

  return (
    <>
      <Suspense
        fallback={
          <div className='static-loader-container'>
            <WaveGridSpinner />
          </div>
        }
      >
        <Component />
      </Suspense>
      {!appReady && (
        <div
          className='static-loader-container'
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
          }}
        >
          <WaveGridSpinner />
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AppRoutes />
    </RouterProvider>
  );
}
