import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Public, pre-auth endpoint — the superadmin-configured company logo shown
// on the login screen. Fails silently (no logo) rather than erroring the
// whole login page if it's unset or unreachable.
export function useCompanyLogo() {
  return useQuery({
    queryKey: ['company-logo'],
    queryFn: () => api.getCompanyLogo(),
    retry: false,
    staleTime: 5 * 60_000,
  });
}
