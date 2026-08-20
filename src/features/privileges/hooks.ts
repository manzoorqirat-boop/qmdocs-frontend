import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PrivilegeSet } from '@/types/api';

// Known system roles show first, in this order; anything else (a custom
// role) sorts alphabetically after. Site Admin is retired — existing
// holders keep it, but it's excluded from anywhere a role gets chosen or
// configured, same as the backend excludes it from new assignment.
const SYSTEM_ORDER = ['Author', 'Reviewer', 'Approver', 'IT Admin', 'Administrator'];
const EXCLUDED_ROLES = ['Site Admin'];

export function sortRoles<T extends { role: string }>(rows: T[]): T[] {
  return rows
    .filter((r) => !EXCLUDED_ROLES.includes(r.role))
    .slice()
    .sort((a, b) => {
      const ia = SYSTEM_ORDER.indexOf(a.role);
      const ib = SYSTEM_ORDER.indexOf(b.role);
      if (ia === -1 && ib === -1) return a.role.localeCompare(b.role);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
}

export function useRolePrivileges() {
  return useQuery({
    queryKey: ['role-privileges'],
    queryFn: () => api.getRolePrivileges() as Promise<PrivilegeSet[]>,
  });
}

// Just the assignable role NAMES, sorted — for a role-picker dropdown
// (Users page, multi-role dialog) that doesn't need the full privilege
// matrix. Live from the same source the matrix uses, so a newly-created
// custom role shows up here immediately, not just in the matrix itself.
export function useAssignableRoles() {
  const { data, ...rest } = useRolePrivileges();
  return { roles: sortRoles(data || []).map((r) => r.role), ...rest };
}

export function useSaveRolePrivileges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { role: string; sections?: string[]; privileges?: Record<string, boolean>; adminPassword: string }) =>
      api.saveRolePrivileges(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-privileges'] }),
  });
}

export function useCreateRolePrivilege() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      role: string;
      description?: string;
      color?: string;
      sections?: string[];
      privileges?: Record<string, boolean>;
      adminPassword: string;
    }) => api.createRolePrivilege(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-privileges'] }),
  });
}
