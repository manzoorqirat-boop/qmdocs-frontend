import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// The wizard, delegate modal, and view modal need the FULL user directory
// (for the recipient picker), not a page of it — calling getUsers() with no
// params returns the whole array, same as the legacy app's single fetch.
export function useAllUsers() {
  return useQuery({
    queryKey: ['users', 'all'],
    queryFn: async () => {
      const data = await api.getUsers();
      return Array.isArray(data) ? data : data.items || [];
    },
    staleTime: 60_000,
  });
}

export const usersKeys = {
  all: ['users'] as const,
  stats: ['users', 'stats'] as const,
};

// Global Total/Active/Inactive counts, computed from the full user list.
// Previously issued three separate calls with page/limit/status params and
// read `.total` off each response — the backend ignores all of those
// params and always returns the full flat array regardless, so each call
// silently fetched everyone anyway, and `.total` was always undefined on
// that array. All three stats were always 0. One fetch, counted here.
export function useUserStats() {
  return useQuery({
    queryKey: usersKeys.stats,
    queryFn: async () => {
      const data = await api.getUsers();
      const all = Array.isArray(data) ? data : data.items || [];
      const active = all.filter((u) => u.status === 'Active').length;
      return { total: all.length, active, inactive: all.length - active };
    },
  });
}

function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: usersKeys.all });
  };
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.createUser(body),
    onSuccess: invalidate,
  });
}

export function useUpdateUserStatus() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, status, adminPassword }: { id: string; status: string; adminPassword: string }) =>
      api.updateUserStatus(id, status, adminPassword),
    onSuccess: invalidate,
  });
}

export function useUpdateUserRoles() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({
      id,
      activeRole,
      roles,
      adminPassword,
    }: {
      id: string;
      activeRole: string;
      roles: string[];
      adminPassword: string;
    }) => api.updateUserRoles(id, activeRole, roles, adminPassword),
    onSuccess: invalidate,
  });
}

export function useUpdateUserProfile() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.updateUserProfile(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateUserAssignment() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.updateUserAssignment(id, body),
    onSuccess: invalidate,
  });
}

export function useUnlockUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, adminPassword }: { id: string; adminPassword: string }) => api.unlockUser(id, adminPassword),
    onSuccess: invalidate,
  });
}

export function useForceLogoutUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, adminPassword }: { id: string; adminPassword: string }) => api.forceLogoutUser(id, adminPassword),
    onSuccess: invalidate,
  });
}
