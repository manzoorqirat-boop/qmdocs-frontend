import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { router } from './router';
import { queryClient } from '@/lib/query-client';
import { SessionProvider } from '@/features/auth/session-context';

// A lazy-loaded route chunk can start 404ing right after a redeploy: the
// already-open tab's index.html still references the OLD content-hashed
// filenames, which the new build no longer has on disk (this is exactly
// what server.js's 404 fix now surfaces cleanly instead of masking as a
// bad MIME type). Vite's documented fix for this failure is a one-time
// reload to fetch the current index.html and correct chunk references —
// without it, anyone with the app open when a deploy goes out sees a
// permanent error screen instead of picking up the new version.
const STALE_CHUNK_KEY = 'eres-reloaded-for-stale-chunk';
window.addEventListener('vite:preloadError', () => {
  // Guarded so a genuine, persistent failure (e.g. no network) reloads
  // once and then stops, rather than looping forever.
  if (!sessionStorage.getItem(STALE_CHUNK_KEY)) {
    sessionStorage.setItem(STALE_CHUNK_KEY, '1');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Reaching this point means the current shell loaded successfully, so
// clear the guard — a stale-chunk event after a LATER deploy should still
// get its own one-time reload, not be silently swallowed because an
// earlier session already used up the flag.
sessionStorage.removeItem(STALE_CHUNK_KEY);
