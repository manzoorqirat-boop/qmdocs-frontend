import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ChangeRequestSummary } from '@/types/api';

function useInvalidateChangeRequests() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['change-requests'] });
}

export function useChangeRequests(status?: string) {
  return useQuery({
    queryKey: ['change-requests', 'list', status],
    queryFn: () => api.getChangeRequests(status) as Promise<ChangeRequestSummary[]>,
  });
}
export function useMyChangeRequests() {
  return useQuery({
    queryKey: ['change-requests', 'mine'],
    queryFn: () => api.getMyChangeRequests() as Promise<ChangeRequestSummary[]>,
  });
}
export function useApproveChangeRequest() {
  const invalidate = useInvalidateChangeRequests();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { password: string; reason?: string } }) => api.approveChangeRequest(id, body),
    onSuccess: invalidate,
  });
}
export function useRejectChangeRequest() {
  const invalidate = useInvalidateChangeRequests();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reason: string } }) => api.rejectChangeRequest(id, body),
    onSuccess: invalidate,
  });
}
export function useWithdrawChangeRequest() {
  const invalidate = useInvalidateChangeRequests();
  return useMutation({
    mutationFn: (id: string) => api.withdrawChangeRequest(id),
    onSuccess: invalidate,
  });
}
