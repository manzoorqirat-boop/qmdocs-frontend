// Central API client — every call goes through here, same as the legacy
// api.js. Ported 1:1: same error envelope handling, same active-site query
// param trick (never a custom header, so requests never trigger a CORS
// preflight), same 401/sessionInvalid distinction between "your session
// ended" and "wrong e-signature password" (the latter must NOT log you out).
import { getToken, getActiveSite, clearSession } from '@/lib/session';
import type {
  LoginApiResponse,
  UserDirectoryEntry,
  UsersPage,
  Site,
  Department,
  EnvelopeSummary,
  EnvelopeDetail,
  EnvelopeCounts,
  AuditPage,
  AuditFacets,
  ChangeRequestSummary,
  PrivilegeSet,
  PendingChangeResponse,
} from '@/types/api';

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiRequestError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.data = data;
  }
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? (body as BodyInit) : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401) {
    const d = await res.json().catch(() => ({}) as Record<string, unknown>);
    // Only a genuine session/token failure (flagged by the auth middleware)
    // forces a logout. Operation-level 401s — e.g. a wrong e-signature
    // password on sign/decline/void/delegate/reassign/pushback — are normal
    // validation errors and must NOT end the session.
    if (d.sessionInvalid) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.alert((d.error as string) || 'Session ended');
        window.__eresAllowUnload = true;
        window.location.reload();
      }
      throw new ApiRequestError((d.error as string) || 'Session ended', 401, d);
    }
    throw new ApiRequestError((d.error as string) || 'Authorization failed', 401, d);
  }

  // 204 has no body; .json() on an empty response rejects.
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiRequestError(
      (data as { error?: string }).error || `Request failed (${res.status})`,
      res.status,
      data,
    );
  }
  return data as T;
}

function qs(params: Record<string, unknown> = {}): string {
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(filtered as [string, string][]).toString();
}

async function fetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (res.status === 401) {
    clearSession();
    window.__eresAllowUnload = true;
    window.location.reload();
    throw new Error('Session ended');
  }
  if (!res.ok) {
    let msg = 'Could not retrieve the signed document';
    try {
      const d = await res.json();
      msg = d.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}

export const api = {
  // ── Auth ───────────────────────────────────────────────
  login: (username: string, password: string, sessionDecision?: string) =>
    request<LoginApiResponse>('POST', '/api/login', { username, password, sessionDecision }),
  forgotPassword: (username: string) =>
    request<{ message: string }>('POST', '/api/forgot-password', { username }),
  resetPassword: (username: string, otp: string, newPassword: string) =>
    request<{ message: string }>('POST', '/api/reset-password', { username, otp, newPassword }),
  logout: () => request<{ message: string }>('POST', '/api/logout'),
  sessionPing: () => request<{ ok?: boolean }>('GET', '/api/session/ping'),
  changePassword: (body: { username: string; currentPassword: string; newPassword: string }) =>
    request<LoginApiResponse>('PUT', '/api/change-password', body),

  // ── Users ──────────────────────────────────────────────
  getUsers: (params?: Record<string, unknown>) =>
    request<UserDirectoryEntry[] | UsersPage>('GET', `/api/users${qs(params)}`),
  // Sitewise Active User List as a controlled, server-generated PDF (logo
  // header, page numbers, who/when footer — same pattern as signed-document
  // downloads). Wasn't wrapped in the legacy api object; a raw fetch lived
  // inline in Users.jsx instead. Centralized here for consistency.
  exportActiveUsersPdf: () => fetchBlob('/api/users/export/active-pdf'),
  createUser: (body: Record<string, unknown>) => request('POST', '/api/users', body),
  updateUserStatus: (id: string, status: string, adminPassword: string) =>
    request('PUT', `/api/users/${id}/status`, { newStatus: status, adminPassword }),
  updateUserRole: (id: string, role: string, adminPassword: string) =>
    request('PUT', `/api/users/${id}/role`, { newRole: role, adminPassword }),
  updateUserRoles: (id: string, activeRole: string, roles: string[], adminPassword: string) =>
    request('PUT', `/api/users/${id}/role`, { newRole: activeRole, roles, adminPassword }),
  updateUserProfile: (id: string, body: Record<string, unknown>) =>
    request('PUT', `/api/users/${id}/profile`, body),
  selectRole: (role: string) =>
    request<{ role: string; roles: string[]; privileges: PrivilegeSet }>('POST', '/api/select-role', { role }),
  updateUserAssignment: (id: string, body: Record<string, unknown>) =>
    request('PUT', `/api/users/${id}/assignment`, body),
  unlockUser: (id: string, adminPassword: string) =>
    request('PUT', `/api/users/${id}/unlock`, { adminPassword }),
  forceLogoutUser: (id: string, adminPassword: string) =>
    request('POST', `/api/users/${id}/force-logout`, { adminPassword }),

  // ── My signature image ─────────────────────────────────
  getMySignatureImage: () => request<{ signatureImage: string | null }>('GET', '/api/users/me/signature-image'),
  setMySignatureImage: (signatureImage: string) =>
    request('POST', '/api/users/me/signature-image', { signatureImage }),
  deleteMySignatureImage: () => request('DELETE', '/api/users/me/signature-image'),

  // ── Audit ──────────────────────────────────────────────
  getAudit: (params: Record<string, unknown> = {}) =>
    request<AuditPage>('GET', `/api/audit${qs(params)}`),
  getAuditFacets: (params: Record<string, unknown> = {}) =>
    request<AuditFacets>('GET', `/api/audit/facets${qs(params)}`),
  getEnvelopeAudit: (envelopeId: string) =>
    request<import('@/types/api').EnvelopeAuditResponse>('GET', `/api/audit/envelope/${envelopeId}`),
  getAuditHistory: (params: Record<string, unknown> = {}) =>
    request<import('@/types/api').ChangeHistoryResponse>('GET', `/api/audit/history${qs(params)}`),

  // ── Departments ────────────────────────────────────────
  getDepartments: (siteId?: string) =>
    request<Department[]>('GET', siteId ? `/api/departments?siteId=${siteId}` : '/api/departments'),
  createDepartment: (body: Record<string, unknown>) =>
    request<Department | PendingChangeResponse>('POST', '/api/departments', body),
  updateDepartment: (id: string, body: Record<string, unknown>) =>
    request<Department | PendingChangeResponse>('PUT', `/api/departments/${id}`, body),
  deactivateDepartment: (id: string) =>
    request<{ site?: Department; department?: Department } | PendingChangeResponse>(
      'POST',
      `/api/departments/${id}/deactivate`,
    ),

  // ── Sites ────────────────────────────────────────────
  getSites: () => request<Site[]>('GET', '/api/sites'),
  createSite: (body: Record<string, unknown>) => request<Site | PendingChangeResponse>('POST', '/api/sites', body),
  updateSite: (id: string, body: Record<string, unknown>) =>
    request<Site | PendingChangeResponse>('PUT', `/api/sites/${id}`, body),
  deactivateSite: (id: string) =>
    request<{ site?: Site } | PendingChangeResponse>('POST', `/api/sites/${id}/deactivate`),

  // ── Envelopes / Signatures ─────────────────────────────
  getEnvelopes: (params?: Record<string, unknown>) => {
    const as = getActiveSite();
    const merged: Record<string, unknown> = { ...(params || {}) };
    if (as) merged.activeSite = as;
    return request<EnvelopeSummary[]>('GET', `/api/envelopes${qs(merged)}`);
  },
  getEnvelopeCounts: (params?: Record<string, unknown>) => {
    const as = getActiveSite();
    const merged: Record<string, unknown> = { ...(params || {}), counts: 1 };
    if (as) merged.activeSite = as;
    return request<EnvelopeCounts>('GET', `/api/envelopes${qs(merged)}`);
  },
  getPendingEnvelopes: (username: string) =>
    request<EnvelopeSummary[]>('GET', `/api/envelopes/pending/${username}`),
  checkDocNumbers: (numbers: string[]) =>
    request<{ duplicates: string[] }>('POST', '/api/envelopes/check-doc-numbers', { numbers }),
  createEnvelope: (formData: FormData) => {
    try {
      const as = getActiveSite();
      if (as) formData.append('activeSite', as);
    } catch {
      /* ignore */
    }
    return request<EnvelopeDetail>('POST', '/api/envelopes', formData, true);
  },
  getEnvelope: (id: string) => request<EnvelopeDetail>('GET', `/api/envelopes/${id}`),
  signEnvelope: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/sign`, body),
  declineEnvelope: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/decline`, body),
  voidEnvelope: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/void`, body),
  delegateEnvelope: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/delegate`, body),
  reassignSignatory: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/reassign`, body),
  pushbackEnvelope: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/pushback`, body),
  resendEnvelope: (id: string, formData: FormData) =>
    request('POST', `/api/envelopes/${id}/resend`, formData, true),

  // ── External vendor signing ─────────────────────────────
  addExternalSigner: (id: string, body: Record<string, unknown>) =>
    request<{ emailSent: boolean }>('POST', `/api/envelopes/${id}/external/add`, body),
  getExternalSigners: (id: string) =>
    request<import('@/types/api').ExternalSignersResponse>('GET', `/api/envelopes/${id}/external`),
  releaseExternalSigner: (id: string, tokenId: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/external/${tokenId}/release`, body),
  revokeExternalLink: (id: string, tokenId: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/external/${tokenId}/revoke`, body),
  regenerateExternalLink: (id: string, tokenId: string, body: Record<string, unknown>) =>
    request('POST', `/api/envelopes/${id}/external/${tokenId}/regenerate`, body),

  getEnvelopeDocument: (envId: string, docIndex: number) =>
    request<import('@/types/api').EnvelopeDocumentContent>('GET', `/api/envelopes/${envId}/document/${docIndex}`),

  // Fetch the signed PDF as a blob with auth. The server stamps a who/when
  // footer and writes an audit entry — this is a controlled action, not a
  // static file fetch.
  fetchSignedBlob: (envId: string, docIndex: number, mode: 'download' | 'print' = 'download') =>
    fetchBlob(`/api/envelopes/${envId}/document/${docIndex}/signed?mode=${mode}`),

  downloadSignedDocument: async (envId: string, docIndex: number, filename = 'signed-document.pdf') => {
    const blob = await api.fetchSignedBlob(envId, docIndex, 'download');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  printSignedDocument: async (envId: string, docIndex: number) => {
    const blob = await api.fetchSignedBlob(envId, docIndex, 'print');
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      URL.revokeObjectURL(url);
      throw new Error('Allow pop-ups to print the document.');
    }
    win.addEventListener('load', () => {
      win.focus();
      win.print();
    });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  // ── Settings ───────────────────────────────────────────
  getSettings: () => request<{ key: string; value: string; updatedBy?: string; updatedAt?: string }[]>('GET', '/api/settings'),
  saveSettings: (body: Record<string, unknown>) => request<{ message: string; updated: string[] }>('POST', '/api/settings', body),
  // The reminder schedule has its OWN dedicated endpoints — it is NOT part
  // of the generic settings key/value list (there is no "reminderConfig"
  // key server-side; it's three separate keys assembled into this shape).
  // Body/response use `sendHour` as a plain 0–23 integer, not a "HH:MM"
  // string — the backend only supports hour-granularity scheduling.
  getReminderConfig: () =>
    request<{ enabled: boolean; sendHour: number; repeatEveryDays: number; lastRun: string | null }>('GET', '/api/settings/reminder-config'),
  saveReminderConfig: (body: { enabled: boolean; sendHour: number; repeatEveryDays: number }) =>
    request('PUT', '/api/settings/reminder-config', body),
  runRemindersNow: () => request<{ result?: { sent?: number } }>('POST', '/api/settings/reminder-config/run-now'),
  testEmail: (to: string) => request<{ message: string }>('POST', '/api/email/test', { to }),
  getDesignations: () => request<{ designations: string[] }>('GET', '/api/designations'),
  saveDesignations: (list: string[]) => request<{ designations: string[] }>('PUT', '/api/designations', { designations: list }),
  getMasterData: () =>
    request<{ signingMeanings?: Record<string, string>; printDownloadDepartment?: string; printDownloadDepartments?: string[] }>(
      'GET',
      '/api/master-data',
    ),
  getCompanyLogo: () => request<{ companyLogo: string }>('GET', '/api/company-logo'),
  saveCompanyLogo: (body: Record<string, unknown>) => request('POST', '/api/company-logo', body),

  // ── Maker-checker change requests ──────────────────────
  getChangeRequests: (status?: string) =>
    request<ChangeRequestSummary[]>('GET', `/api/change-requests${status ? '?status=' + status : ''}`),
  getMyChangeRequests: () => request<ChangeRequestSummary[]>('GET', '/api/change-requests?mine=1'),
  getChangeRequest: (id: string) => request<ChangeRequestSummary>('GET', `/api/change-requests/${id}`),
  approveChangeRequest: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/change-requests/${id}/approve`, body),
  rejectChangeRequest: (id: string, body: Record<string, unknown>) =>
    request('POST', `/api/change-requests/${id}/reject`, body),
  withdrawChangeRequest: (id: string) => request('DELETE', `/api/change-requests/${id}`),

  // ── Role privileges ────────────────────────────────────
  getRolePrivileges: () => request<import('@/types/api').PrivilegeSet[]>('GET', '/api/role-privileges'),
  saveRolePrivileges: (payload: import('@/types/api').PrivilegeSet[]) =>
    request<{ message?: string }>('POST', '/api/role-privileges', payload),

  // ── Entra/SSO: intentionally absent — see MIGRATION_STATUS.md and the
  // backend cleanup (EntraAuthEndpoints.cs was removed as unused Azure code).
};
