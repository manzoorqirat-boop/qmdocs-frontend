import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { UsersPage } from '@/types/api';

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
  list: (params: Record<string, unknown>) => ['users', 'list', params] as const,
  stats: ['users', 'stats'] as const,
};

export function useUsersPage(params: { page: number; limit: number; search?: string; role?: string }) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => api.getUsers(params) as Promise<UsersPage>,
    placeholderData: (prev) => prev,
  });
}

// Global Total/Active/Inactive counts via cheap count-only calls (limit: 1),
// independent of the current page/filters — same trick the legacy page used.
export function useUserStats() {
  return useQuery({
    queryKey: usersKeys.stats,
    queryFn: async () => {
      const [all, active, inactive] = await Promise.all([
        api.getUsers({ page: 1, limit: 1 }) as Promise<UsersPage>,
        api.getUsers({ page: 1, limit: 1, status: 'Active' }) as Promise<UsersPage>,
        api.getUsers({ page: 1, limit: 1, status: 'Inactive' }) as Promise<UsersPage>,
      ]);
      return { total: all.total || 0, active: active.total || 0, inactive: inactive.total || 0 };
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
