import { Suspense, lazy } from 'react';
import WaveGridSpinner from './components/ui/shared/WaveGridSpinner';
import useImageStore from './stores/media/imageStore';

const EditorPage = lazy(() => import('./pages/EditorPage'));

export default function App() {
  const engineReady = useImageStore((s) => s.engineReady);

  return (
    <>
      <Suspense
        fallback={
          <div className='static-loader-container'>
            <WaveGridSpinner />
          </div>
        }
      >
        <EditorPage />
      </Suspense>
      {!engineReady && (
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

