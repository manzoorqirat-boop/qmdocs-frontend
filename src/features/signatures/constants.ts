// Shared constants for the envelope creation/signing workflow. Ported
// verbatim from the top of the legacy Signatures.jsx — same step colors,
// same signing-meaning defaults, same master-data hydration pattern.
import { ROLE_HEX, AUDIT_EVENT_TONE, AUDIT_EVENT_COLOR, ACTION_HEX, colorForLabel } from '@/lib/theme-colors';
export { ROLE_HEX as ROLE_COLORS, ACTION_HEX as CHANGE_ACTION_COLOR, AUDIT_EVENT_COLOR };

export const STEP_DEFS: Record<string, { color: string; allowedRoles: string[] }> = {
  Author: { color: '#0f6e5c', allowedRoles: ['Author'] },
  Reviewer: { color: '#b45309', allowedRoles: ['Reviewer'] },
  Approver: { color: '#15803d', allowedRoles: ['Approver'] },
};

// Custom steps are capacity-based, not role-gated: the Author picks the person.
export const ALL_ROLES_FOR_CUSTOM = ['Author', 'Reviewer', 'Approver', 'Site Admin', 'IT Admin', 'Administrator'];

// Custom signatory labels (HOD, SAP SME, Executed By (IT), etc.) get a
// deterministic color per label — from the shared label palette in
// theme-colors.ts — so they stay visually consistent across the wizard,
// placement, and view screens.
export function stepColor(label: string): string {
  if (STEP_DEFS[label]) return STEP_DEFS[label].color;
  return colorForLabel(label);
}

// Business master data — defaults below are overridden at runtime from
// /api/master-data (admin-configurable). Kept as module-level mutable
// state so the wizard, view, and sign modals all read the same hydrated
// values, exactly like the legacy module-scope `let`.
export const SIGNING_MEANING: Record<string, string> = {
  Author: 'By signing this document with an electronic signature using QMDOCS I am agreeing that I am authoring this document.',
  Reviewer: 'By signing this document with an electronic signature using QMDOCS I am agreeing that I have reviewed this document.',
  Approver: 'By signing this document with an electronic signature using QMDOCS I am agreeing that I have approved this document.',
};
export let PRINT_DOWNLOAD_DEPARTMENTS = ['Quality Assurance'];

export function hydrateMasterData(md: {
  signingMeanings?: Record<string, string>;
  printDownloadDepartments?: string[];
  printDownloadDepartment?: string;
}) {
  if (md?.signingMeanings) Object.assign(SIGNING_MEANING, md.signingMeanings);
  if (Array.isArray(md?.printDownloadDepartments) && md.printDownloadDepartments.length) {
    PRINT_DOWNLOAD_DEPARTMENTS = md.printDownloadDepartments;
  } else if (md?.printDownloadDepartment) {
    PRINT_DOWNLOAD_DEPARTMENTS = [md.printDownloadDepartment];
  }
}

export const EVENT_LABELS: Record<string, { tone: 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'default' }> = Object.fromEntries(
  Object.entries(AUDIT_EVENT_TONE).map(([event, tone]) => [event, { tone }]),
);

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
}
export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return (
    new Date(d).toLocaleString('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }) + ' IST'
  );
}
export function todayISO(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(),
  );
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function initials(name: string | null | undefined): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ── Audit trail display helpers ─────────────────────────────────────────
// Display-only clamp for pathological values: a few historical
// SETTINGS_CHANGED rows captured a full base64 company-logo data-URI in
// New Value, rendering as thousands of lines of gibberish. The STORED
// record is never touched (data-integrity requirement) — only the table
// display is truncated.
const DISPLAY_VALUE_LIMIT = 300;
export function clampAuditValue(v: string | null | undefined): string {
  if (!v || typeof v !== 'string') return v || '—';
  // The Part 11 signing-meaning boilerplate is stripped from THIS display
  // only — the useful facts (Signer, Dept, Type, Annotations) remain. The
  // stored record and the per-envelope trail/manifest are untouched.
  let out = v.replace(/^By signing this document with an electronic signature using QMDOCS[^|]*\|\s*/i, '');
  out = out.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, '[image data — not displayed]');
  if (out.length > DISPLAY_VALUE_LIMIT) {
    out = out.slice(0, DISPLAY_VALUE_LIMIT) + ` … [truncated for display — ${out.length.toLocaleString()} characters stored]`;
  }
  return out;
}

// AUDIT_EVENT_COLOR and CHANGE_ACTION_COLOR previously lived here as
// hardcoded hex maps that had drifted from the equivalent maps in
// dashboard.tsx and audit-trail-tab.tsx (e.g. LOGIN was teal here, orange
// there). Now sourced from src/lib/theme-colors.ts (AUDIT_EVENT_TONE +
// auditEventHex, CHANGE_ACTION_COLOR re-exported above) — one definition.
