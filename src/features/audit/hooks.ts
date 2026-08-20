import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuditPage, AuditFacets, ChangeHistoryResponse } from '@/types/api';

export function useAudit(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => api.getAudit(params) as Promise<AuditPage>,
  });
}

export function useAuditFacets(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['audit', 'facets', params],
    queryFn: () => api.getAuditFacets(params) as Promise<AuditFacets>,
  });
}

export function useAuditHistory(params: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    queryKey: ['audit', 'history', params],
    queryFn: () => api.getAuditHistory(params) as Promise<ChangeHistoryResponse>,
    enabled,
  });
}
