import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Site } from '@/types/api';

export const sitesKeys = {
  all: ['sites'] as const,
};

export function useSites() {
  return useQuery({
    queryKey: sitesKeys.all,
    queryFn: () => api.getSites(),
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Site>) => api.createSite(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sitesKeys.all }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Site> }) => api.updateSite(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sitesKeys.all }),
  });
}

export function useDeactivateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deactivateSite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sitesKeys.all }),
  });
}
