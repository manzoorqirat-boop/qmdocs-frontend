// Types mirror the .NET backend's actual response projections (verified
// against Eres.Api/Endpoints/*.cs — Summarise/Detail/Directory methods —
// not inferred from the frontend alone). Field names are camelCase on the
// wire (System.Text.Json default); enums serialize as their string name.

export type Role =
  | 'Administrator'
  | 'IT Admin'
  | 'Site Admin'
  | 'Approver'
  | 'Reviewer'
  | 'Author';

export interface AccessGrant {
  siteId: string;
  department: string;
}

export interface PrivilegeSet {
  role: string;
  description: string;
  color: string;
  sections: string[];
  canCreateEnvelope: boolean;
  canSign: boolean;
  canApprove: boolean;
  canVoidEnvelope: boolean;
  canDelegate: boolean;
  canPushback: boolean;
  canViewAudit: boolean;
  canViewReports: boolean;
  canViewAllDepartments: boolean;
  canViewUsers: boolean;
  canManageUsers: boolean;
  canManageItAdmins: boolean;
  canManageDepartments: boolean;
  canViewSettings: boolean;
  canEditSettings: boolean;
  canManagePrivileges: boolean;
}

export interface LoginResponse {
  token: string;
  sessionTimeoutMinutes: number;
  username: string;
  fullName: string;
  role: string;
  roles: string[];
  department: string;
  siteId?: string | null;
  siteName?: string;
  siteCode?: string;
  additionalAccess: AccessGrant[];
  mustChangePassword: boolean;
  privileges: PrivilegeSet;
  sid: string;
}

/** Persisted in sessionStorage — a trimmed view of LoginResponse, no token. */
export interface SessionUser {
  username: string;
  fullName: string;
  role: string;
  roles?: string[];
  department: string;
  siteId?: string | null;
  siteName?: string;
  siteCode?: string;
  additionalAccess: AccessGrant[];
  mustChangePassword: boolean;
  privileges: Partial<PrivilegeSet>;
  sessionTimeoutMinutes: number;
}

export interface PasswordExpiredResponse {
  token: string;
  username: string;
  fullName: string;
  role: string;
  department: string;
  mustChangePassword: true;
  reason: 'PASSWORD_EXPIRED';
}

export interface RequiresSessionDecisionResponse {
  requiresSessionDecision: true;
  error: string;
  message: string;
}

export interface LoggedOutEverywhereResponse {
  loggedOut: true;
  message: string;
}

export type LoginApiResponse =
  | LoginResponse
  | PasswordExpiredResponse
  | RequiresSessionDecisionResponse
  | LoggedOutEverywhereResponse;

// ── Users ────────────────────────────────────────────────────────────────

export interface UserDirectoryEntry {
  isLocked: boolean;
  id: string;
  username: string;
  employeeId: string;
  fullName: string;
  designation: string;
  email: string;
  role: string;
  roles: string[];
  siteId: string | null;
  siteName: string;
  department: string;
  status: 'Active' | 'Inactive' | 'Locked' | string;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  passwordLastChanged: string;
  adManaged: boolean;
  createdAt: string;
  additionalAccess: { siteId: string; department: string }[];
}

export interface UsersPage {
  items: UserDirectoryEntry[];
  total: number;
  pages: number;
}

// ── Sites / Departments ─────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  code: string;
  address: string;
  description: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
  pendingRequest: boolean;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  siteIds: string[];
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
  pendingRequest: boolean;
}

// ── Envelopes ────────────────────────────────────────────────────────────

export type EnvelopeStatus =
  | 'Draft'
  | 'InProgress'
  | 'Completed'
  | 'Declined'
  | 'Voided'
  | string;

export type RecipientRole = 'Author' | 'Reviewer' | 'Approver' | string;
export type RecipientStatus = 'Pending' | 'Signed' | 'Declined' | 'Voided' | string;

export interface EnvelopeRecipientSummary {
  username: string;
  fullName: string;
  email: string;
  stepLabel: string;
  role: RecipientRole;
  routingOrder: number;
  status: RecipientStatus;
  isExternal: boolean;
  actionAt: string | null;
}

export interface EnvelopeSummary {
  id: string;
  title: string;
  createdBy: string;
  status: EnvelopeStatus;
  routingType: string;
  round: number;
  ownerDepartment: string;
  ownerSiteId: string;
  createdAt: string;
  completedAt: string | null;
  recipients: EnvelopeRecipientSummary[];
}

export interface EnvelopeRecipientDetail extends EnvelopeRecipientSummary {
  department: string;
  designation: string;
  signingMeaning: string | null;
  comment: string | null;
  delegatedFrom: string | null;
}

export interface EnvelopeDocument {
  id: string;
  ordinal: number;
  documentTitle: string;
  fileName: string;
  documentNumber: string;
  fileHash: string;
  hasSignedFile: boolean;
}

export interface VoidedSignature {
  recipientUsername: string;
  signerFullName: string;
  stepLabel: string;
  signingMeaning: string;
  signedAt: string;
}

export interface RevisionRound {
  round: number;
  pushedBackBy: string;
  pushedBackByName: string;
  pushedBackByStep: string;
  reason: string;
  pushedBackAt: string;
  voidedSignatures: VoidedSignature[];
}

export interface EnvelopeDetail {
  id: string;
  title: string;
  message: string;
  createdBy: string;
  status: EnvelopeStatus;
  routingType: string;
  round: number;
  ownerDepartment: string;
  ownerSiteId: string;
  createdAt: string;
  completedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  documents: EnvelopeDocument[];
  recipients: EnvelopeRecipientDetail[];
  revisionHistory: RevisionRound[];
}

export interface EnvelopeCounts {
  total: number;
  sent: number;
  completed: number;
  declined: number;
  voided: number;
  returnedToAuthor: number;
  awaitingMe: number;
}

// ── Audit ────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  username: string;
  event: string;
  record: string;
  envelopeId: string | null;
  oldValue: string | null;
  newValue: string | null;
  department: string | null;
  siteId: string | null;
  ipAddress: string | null;
  timestamp: string;
}

/** Per-envelope audit entries omit `record`/`department` — narrower than the general feed. */
export interface EnvelopeAuditEntry {
  id: string;
  username: string;
  event: string;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  timestamp: string;
}

export interface EnvelopeAuditResponse {
  envelopeId: string;
  title: string;
  entries: EnvelopeAuditEntry[];
}

export interface AuditPage {
  total: number;
  page: number;
  pageSize: number;
  entries: AuditEntry[];
}

export interface AuditFacets {
  events: string[];
  usernames: string[];
}

export interface ChangeHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE' | string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields: string[] | null;
  changedBy: string;
  changedByRole: string;
  timestamp: string;
}

export interface ChangeHistoryResponse {
  total: number;
  page: number;
  pageSize: number;
  entries: ChangeHistoryEntry[];
}

// ── Change requests (maker-checker) ─────────────────────────────────────

export type ChangeRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn' | string;

export interface ChangeRequestSummary {
  id: string;
  entityType: string;
  action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | string;
  targetId: string | null;
  targetLabel: string;
  payload: string;
  before: string | null;
  status: ChangeRequestStatus;
  requestedBy: string;
  requestedByRole: string;
  requestReason: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedByRole: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  signatureMeaning: string | null;
}

// ── Generic API envelope ────────────────────────────────────────────────

export interface ApiError {
  error: string;
  sessionInvalid?: boolean;
}

export interface PendingChangeResponse {
  pending: true;
  message: string;
  changeRequestId: string;
}

/** Signature stamp data as the document-content endpoint sends it. */
export interface AppliedSignatureWire {
  recipientUsername: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  stepLabel?: string;
  signerRole?: string;
  signerFullName?: string;
  signerDesignation?: string;
  signerDepartment?: string;
  signedAt?: string;
}

export interface EnvelopeDocumentContent {
  fileData: string; // base64
  signatureFields: { recipientUsername: string; page: number; x: number; y: number; width: number; height: number }[];
  appliedSignatures: AppliedSignatureWire[];
  effectiveDateFields: { page: number; x: number; y: number; width: number; height: number }[];
  appliedEffectiveDates: { page: number; x: number; y: number; width: number; height: number; effectiveDate: string }[];
  appliedAnnotations: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    kind: 'tick' | 'cross' | 'text';
    text?: string;
    byUsername?: string;
    byFullName?: string;
    stepLabel?: string;
  }[];
}

// ── External vendor signing ─────────────────────────────────────────────

export type ExternalTokenStatus = 'Issued' | 'Opened' | 'Verified' | 'Released' | 'Signed' | 'Revoked' | 'Expired' | string;

export interface ExternalSignerRow {
  email: string;
  stepLabel: string;
  status?: ExternalTokenStatus;
  releasedBy?: string | null;
  identity?: { fullName?: string; organization?: string } | null;
  token?: { id: string; status: ExternalTokenStatus; expiresAt?: string } | null;
}

export interface ExternalSignersResponse {
  recipients: ExternalSignerRow[];
}
