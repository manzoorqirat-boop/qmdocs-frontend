import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Department } from '@/types/api';

export const departmentsKeys = {
  all: ['departments'] as const,
};

export function useDepartments(siteId?: string) {
  return useQuery({
    queryKey: [...departmentsKeys.all, siteId],
    queryFn: () => api.getDepartments(siteId),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Department>) => api.createDepartment(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: departmentsKeys.all }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Department> }) => api.updateDepartment(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: departmentsKeys.all }),
  });
}

export function useDeactivateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deactivateDepartment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: departmentsKeys.all }),
  });
}
