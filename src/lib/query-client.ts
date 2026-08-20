import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '@/lib/api';

// Sensible defaults for an internal, data-dense, mostly-authenticated app:
// short staleTime so switching between screens doesn't show visibly stale
// data, but not zero — the same list is often revisited within a session
// (e.g. flipping between Envelope filters). Session-invalid 401s already
// force a full reload in the api client itself, so retrying a request that
// just got a 401 is pointless — never retry auth failures.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
