import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EnvelopeSummary, EnvelopeCounts, EnvelopeAuditResponse } from '@/types/api';

export const envelopesKeys = {
  all: ['envelopes'] as const,
  detail: (id: string) => ['envelopes', id] as const,
  counts: ['envelopes', 'counts'] as const,
  pending: (username: string) => ['envelopes', 'pending', username] as const,
  document: (envId: string, docIndex: number) => ['envelopes', envId, 'document', docIndex] as const,
  audit: (envId: string) => ['envelopes', envId, 'audit'] as const,
};

export function useEnvelopes() {
  return useQuery({
    queryKey: envelopesKeys.all,
    queryFn: () => api.getEnvelopes({}) as Promise<EnvelopeSummary[]>,
  });
}

export function useEnvelopeCounts() {
  return useQuery({
    queryKey: envelopesKeys.counts,
    queryFn: () => api.getEnvelopeCounts() as Promise<EnvelopeCounts>,
  });
}

export function usePendingEnvelopes(username: string | undefined) {
  return useQuery({
    queryKey: envelopesKeys.pending(username || ''),
    queryFn: () => api.getPendingEnvelopes(username!),
    enabled: !!username,
  });
}

export function useEnvelopeDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: envelopesKeys.detail(id),
    queryFn: () => api.getEnvelope(id),
    enabled,
  });
}

export function useEnvelopeDocument(envId: string, docIndex: number, enabled: boolean) {
  return useQuery({
    queryKey: envelopesKeys.document(envId, docIndex),
    queryFn: () => api.getEnvelopeDocument(envId, docIndex),
    enabled,
  });
}

export function useEnvelopeAudit(envelopeId: string) {
  return useQuery({
    queryKey: envelopesKeys.audit(envelopeId),
    queryFn: () => api.getEnvelopeAudit(envelopeId) as Promise<EnvelopeAuditResponse>,
  });
}

function useInvalidateEnvelopes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: envelopesKeys.all });
}

export function useCreateEnvelope() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: (formData: FormData) => api.createEnvelope(formData),
    onSuccess: invalidate,
  });
}
export function useSignEnvelope() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.signEnvelope(id, body),
    onSuccess: invalidate,
  });
}
export function useDeclineEnvelope() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.declineEnvelope(id, body),
    onSuccess: invalidate,
  });
}
export function usePushbackEnvelope() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.pushbackEnvelope(id, body),
    onSuccess: invalidate,
  });
}
export function useVoidEnvelope() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.voidEnvelope(id, body),
    onSuccess: invalidate,
  });
}
export function useDelegateEnvelope() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.delegateEnvelope(id, body),
    onSuccess: invalidate,
  });
}
export function useReassignSignatory() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.reassignSignatory(id, body),
    onSuccess: invalidate,
  });
}
export function useResendEnvelope() {
  const invalidate = useInvalidateEnvelopes();
  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) => api.resendEnvelope(id, formData),
    onSuccess: invalidate,
  });
}
export function useCheckDocNumbers() {
  return useMutation({
    mutationFn: (numbers: string[]) => api.checkDocNumbers(numbers),
  });
}
