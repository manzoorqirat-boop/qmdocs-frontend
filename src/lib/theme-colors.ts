// Canonical color source for anything that can't just use a Tailwind
// semantic class (bg-success, text-danger, etc.): recharts `fill`/`stroke`
// props, inline styles that alpha-blend a hex string (`${color}22`), and
// the hash-based palettes that pick a color deterministically from a
// label. Every value here MIRRORS the corresponding custom property in
// src/index.css — if you change one, change the other.
//
// Before this file existed, four different files each hardcoded their own
// copy of these palettes, and they'd drifted apart — e.g. the audit event
// LOGIN was teal in one file and orange in another. One source now.

export const TONE_HEX = {
  success: '#15803d',
  warning: '#b45309',
  danger: '#c0362c',
  info: '#2563a8',
  violet: '#7c3aed',
  default: '#5b6b7a',
} as const;
export type Tone = keyof typeof TONE_HEX;

// Envelope / change-request LIFECYCLE status -> tone, for places that need
// the raw hex directly (chart fills, colored text). Distinct from
// components/status-badge.tsx's own STATUS_TONE, which covers a broader,
// lowercase-keyed status vocabulary (user status, "locked", "reviewed",
// etc.) and renders via <Badge> — already routed through the same
// Tailwind/CSS-token classes, so it has no raw hex to duplicate here.
export const ENVELOPE_STATUS_TONE: Record<string, Tone> = {
  Draft: 'default',
  Sent: 'warning',
  Pending: 'warning',
  Completed: 'success',
  Approved: 'success',
  Declined: 'danger',
  Rejected: 'danger',
  Voided: 'default',
  ReturnedToAuthor: 'violet',
  Withdrawn: 'default',
};
export function envelopeStatusHex(status: string | null | undefined): string {
  return TONE_HEX[ENVELOPE_STATUS_TONE[status || ''] || 'default'];
}

// Role colors — a real qualitative palette; roles must stay visually
// distinguishable from each other, not reducible to the tones above.
export const ROLE_HEX: Record<string, string> = {
  Author: '#f2811b',
  Reviewer: '#b9770d',
  Approver: '#0a8f5b',
  'Site Admin': '#0d9488',
  'IT Admin': '#dc2626',
  Administrator: '#6d28d9',
};

// Change-request action colors.
export const ACTION_HEX: Record<string, string> = {
  CREATE: TONE_HEX.success,
  UPDATE: TONE_HEX.warning,
  DEACTIVATE: TONE_HEX.danger,
  REACTIVATE: TONE_HEX.info,
};

// Audit event → tone. Every event previously had its own one-off hex,
// duplicated (and drifted) across constants.ts, dashboard.tsx, and
// audit-trail-tab.tsx. Grouped into the shared tone set instead.
export const AUDIT_EVENT_TONE: Record<string, Tone> = {
  LOGIN: 'success',
  LOGIN_FAILED: 'danger',
  ENVELOPE_CREATED: 'violet',
  ENVELOPE_SIGNED: 'success',
  ENVELOPE_DECLINED: 'danger',
  ENVELOPE_VOIDED: 'default',
  ENVELOPE_DELEGATED: 'warning',
  ENVELOPE_REASSIGNED: 'info',
  ENVELOPE_PUSHED_BACK: 'warning',
  ENVELOPE_RESENT: 'info',
  ENVELOPE_SIGNATURE_VOIDED: 'danger',
  ENVELOPE_DOWNLOADED: 'info',
  ENVELOPE_PRINTED: 'info',
  ENVELOPE_ARCHIVED: 'success',
  CREATE_USER: 'success',
  PASSWORD_CHANGED: 'warning',
  CHANGE_USER_STATUS: 'warning',
  CHANGE_USER_ROLE: 'violet',
  ACCOUNT_LOCKED: 'danger',
  ACCOUNT_UNLOCKED: 'success',
  FORCE_LOGOUT_TRIGGERED: 'danger',
  FORCE_LOGOUT_APPLIED: 'danger',
  SESSION_EXPIRED: 'default',
  UPDATE_ROLE_PRIVILEGES: 'violet',
  CREATE_DEPARTMENT: 'success',
  UPDATE_DEPARTMENT: 'warning',
  DEACTIVATE_DEPARTMENT: 'default',
  SETTINGS_CHANGED: 'violet',
  AI_AUDIT_ANALYSIS: 'success',
  AI_COMPLIANCE_CHECK: 'success',
  SIGNATURE_IMAGE_UPDATED: 'success',
  SIGNATURE_IMAGE_REMOVED: 'warning',
};
export function auditEventHex(event: string): string {
  return TONE_HEX[AUDIT_EVENT_TONE[event] || 'default'];
}

// Precomputed event -> hex, for call sites doing a plain bracket lookup
// (`AUDIT_EVENT_COLOR[event]`) rather than calling auditEventHex(). Same
// single source (AUDIT_EVENT_TONE) either way.
export const AUDIT_EVENT_COLOR: Record<string, string> = Object.fromEntries(
  Object.keys(AUDIT_EVENT_TONE).map((event) => [event, auditEventHex(event)]),
);

// Qualitative chart series palette — pie/bar/line charts, cycled by index.
export const CHART_PALETTE = ['#f2811b', '#b9770d', '#7c3aed', '#0a8f5b', '#d23b3b', '#0891b2'];

// Deterministic per-label palette — custom signatory capacities (HOD, SAP
// SME, etc.) and PDF-placement recipient boxes get a stable color derived
// from their label, so the same label renders the same color everywhere.
export const LABEL_PALETTE = ['#7c3aed', '#0e7490', '#b45309', '#be185d', '#4d7c0f', '#6d28d9', '#0369a1', '#a21caf'];
export function colorForLabel(label: string): string {
  let h = 0;
  for (let i = 0; i < (label || '').length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return LABEL_PALETTE[h % LABEL_PALETTE.length];
}

// Special-purpose single-concept accent — effective-date stamps and
// external-signer indicators. Previously #8b5cf6 in some places and
// #7c3aed in others for what is visually the same "violet" concept.
export const VIOLET_HEX = TONE_HEX.violet;
// Darker violet for text set directly on a violet-soft background, where
// the base violet doesn't have enough contrast.
export const VIOLET_INK_HEX = '#5b21b6';
