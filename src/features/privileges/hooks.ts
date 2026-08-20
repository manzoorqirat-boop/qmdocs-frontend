import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PrivilegeSet } from '@/types/api';

export function useRolePrivileges() {
  return useQuery({
    queryKey: ['role-privileges'],
    queryFn: () => api.getRolePrivileges() as Promise<PrivilegeSet[]>,
  });
}

export function useSaveRolePrivileges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PrivilegeSet[]) => api.saveRolePrivileges(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-privileges'] }),
  });
}
