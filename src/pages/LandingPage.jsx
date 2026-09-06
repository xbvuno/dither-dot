import { useEffect } from 'react';
import { useRouter } from '../router/router';
import usePageStore, { PAGE } from '../stores/ui/pageStore';

export default function LandingPage() {
  const { navigate } = useRouter();

  useEffect(() => {
    usePageStore.getState().setPage(PAGE.IMPORT);
    navigate('/editor', { replace: true });
  }, [navigate]);

  return (
    <div style={{ display: 'none' }} aria-hidden='true'>
      <h1>DITHER-DOT — Browser Image &amp; GIF Dithering Studio</h1>
      <p>
        A fast, open-source dithering studio for images and GIFs running entirely in your browser with WebGL &amp; WebAssembly.
      </p>
      <a href='/editor'>Redirecting to Editor...</a>
    </div>
  );
}
