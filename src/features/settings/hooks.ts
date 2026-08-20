import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { hydrateMasterData } from '@/features/signatures/constants';

export function useSettingsList() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { adminUsername: string; adminPassword: string; settings: Record<string, unknown> }) => api.saveSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useReminderConfig() {
  return useQuery({
    queryKey: ['settings', 'reminder-config'],
    queryFn: () => api.getReminderConfig(),
  });
}

export function useSaveReminderConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { enabled: boolean; sendHour: number; repeatEveryDays: number }) => api.saveReminderConfig(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'reminder-config'] }),
  });
}

export function useRunRemindersNow() {
  return useMutation({ mutationFn: () => api.runRemindersNow() });
}

export function useTestEmail() {
  return useMutation({ mutationFn: (to: string) => api.testEmail(to) });
}

export function useCompanyLogoAdmin() {
  return useQuery({
    queryKey: ['company-logo'],
    queryFn: () => api.getCompanyLogo(),
  });
}

export function useSaveCompanyLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { adminUsername: string; adminPassword: string; companyLogo: string }) => api.saveCompanyLogo(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-logo'] }),
  });
}

export function useMySignatureImage() {
  return useQuery({
    queryKey: ['users', 'me', 'signature-image'],
    queryFn: () => api.getMySignatureImage(),
  });
}
export function useSetMySignatureImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dataUri: string) => api.setMySignatureImage(dataUri),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', 'me', 'signature-image'] }),
  });
}
export function useDeleteMySignatureImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteMySignatureImage(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', 'me', 'signature-image'] }),
  });
}

export function useSaveDesignations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (list: string[]) => api.saveDesignations(list),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: ['designations'],
    queryFn: () => api.getDesignations(),
    staleTime: 5 * 60_000,
  });
}

// Hydrates the mutable SIGNING_MEANING / PRINT_DOWNLOAD_DEPARTMENTS module
// state in features/signatures/constants.ts — same pattern as the legacy
// app (admin-configurable business text, fetched once and shared across
// the wizard/view/sign screens without threading it through every prop).
export function useMasterDataHydration() {
  return useQuery({
    queryKey: ['master-data'],
    queryFn: async () => {
      const md = await api.getMasterData();
      hydrateMasterData(md as Parameters<typeof hydrateMasterData>[0]);
      return md;
    },
    staleTime: Infinity,
  });
}
