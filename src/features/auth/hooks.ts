// Auth is a sequence of one-shot mutations, not cached query data, so these
// are thin useMutation wrappers rather than a "resource" hook family. The
// actual session state (who's logged in) lives in sessionStorage + the
// SessionProvider context — see session-context.tsx — not in the Query cache.
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useLoginMutation() {
  return useMutation({
    mutationFn: ({
      username,
      password,
      sessionDecision,
    }: {
      username: string;
      password: string;
      sessionDecision?: string;
    }) => api.login(username, password, sessionDecision),
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (username: string) => api.forgotPassword(username),
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: ({ username, otp, newPassword }: { username: string; otp: string; newPassword: string }) =>
      api.resetPassword(username, otp, newPassword),
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (body: { username: string; currentPassword: string; newPassword: string }) =>
      api.changePassword(body),
  });
}

export function useSelectRoleMutation() {
  return useMutation({
    mutationFn: (role: string) => api.selectRole(role),
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => api.logout(),
  });
}
