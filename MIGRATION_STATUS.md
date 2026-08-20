# ERES Frontend v2 — migration status

Source of truth for what's been ported from the legacy frontend
(`ESIGN-DOTNET-FRONTEND-main`) and what's still pending. Each legacy file is
the literal spec for its replacement — nothing is considered done until its
behavior has been checked line-by-line against the original, and every
checkpoint below has been verified with `npx tsc -b` (0 errors), `npx oxlint`
(0 errors), and `npm run build` (succeeds) before being marked done.

Stack: React 19.2 · TypeScript · Vite · Tailwind v4 · shadcn/ui (Radix) ·
TanStack Query + Router + Table · react-hook-form + zod · Recharts ·
ExcelJS (replaces vulnerable `xlsx`) · pdfjs-dist (self-hosted, lazy-loaded) ·
sonner

## Done

**Infra:** scaffold, design system (`src/index.css` — palette, IBM Plex
Sans/Mono latin-only), all shadcn/ui primitives, typed API client
(`lib/api.ts`, grounded against the actual C# DTOs — not guessed), session
storage + cross-tab guard, idle-session hook, auth gates
(PasswordChangeGate/RoleSelectGate/SiteSelectGate), Sidebar + AppShell,
TanStack Router route tree (real URLs, replaces the legacy history-trap
hack), route-level code splitting (every page + ExcelJS + pdfjs-dist are
separate lazy chunks — main bundle is 347KB/gzip 112KB regardless of app size).

**Pages:** Login, Sites, Departments, Users, Signatures (the big one), Dashboard,
AuditTrail, **Reports**.

**Signatures feature** (`src/features/signatures/`, `src/features/envelopes/`):
constants/types, `PdfSignaturePlacer` (901-line drag/drop/annotation engine),
`SignaturePad`, `UserSearchPicker`, `AuditTrailTab`, `ExternalSignersTab`,
`ViewEnvelopeModal`, `SignEnvelopeModal`, `VoidModal`, `DelegateModal`,
`ResendEnvelopeModal`, `CreateEnvelopeWizard` (4 steps), and the main
`SignaturesPage` wiring all of it together. This page alone was ~2,400 lines
in the legacy app — bigger than every other page combined — and got the
highest scrutiny of the whole migration (fresh re-reads of the legacy
source before writing the two most compliance-critical pieces, `Sign
EnvelopeModal` and `CreateEnvelopeWizard`, rather than relying on memory).

- [ ] `pages/Reports.jsx` (568 lines)
- [ ] `pages/Settings.jsx` (856 lines)
- [ ] `pages/ChangeRequests.jsx` (244 lines)
- [ ] `pages/Privileges.jsx` (218 lines)
- [ ] `pages/ExternalSignPage.jsx` (251 lines) — standalone route, no auth shell

## Real bugs found in the legacy app while porting (fixed, not reproduced)

Each of these was confirmed against the actual backend source
(`ESIGN-DOTNET-BACKEND-main`), not assumed — the legacy frontend and the
.NET backend drifted apart during the Node→.NET port, and each of the
following is a place the frontend was reading a shape the backend no longer
sends.

1. **Sites/Departments `pendingRequest`** — frontend read it as an object
   (`.action`, `.requestedBy`); backend sends a plain boolean. Cosmetic
   (`undefined ACTION` text), not a crash. Fixed: render "Pending QA approval".
2. **`AuditTrailTab` PDF export** — read `data.envelope.{title,createdBy,...}`;
   the endpoint returns `{envelopeId, title, entries}`, no nested `envelope`.
   `data.envelope` is `undefined`, so `env.title` **throws** — this button is
   currently broken in production. Fixed: pass the envelope the caller
   already has as a prop instead of trusting the endpoint for it.
3. **`ViewEnvelopeModal`/`SignEnvelopeModal` `envelope.documents[docIdx]`** —
   the *list* endpoint (`Summarise` projection) doesn't include `documents`
   or full recipient fields (department/designation/delegatedFrom/etc.) —
   only the single-envelope `Detail` endpoint does. Opening View on any
   envelope from the table **throws** the moment the Documents tab renders.
   Fixed: both modals fetch their own full detail via `useEnvelopeDetail(id)`.
4. **`ResendEnvelopeModal` message default** — minor, defaulted to empty
   instead of `envelope.message`. Fixed while re-reading for fidelity.
6. **Bottleneck Analysis chart never shows data.** `Reports.jsx` computes
   step-timing from `recipient.activatedAt`. Checked the domain model directly:
   `ActivatedAt` is a real, tracked field on the `Envelope` entity (`Envelope.cs`) —
   but it's never projected into either API response (`Summarise` or `Detail`).
   So `r.activatedAt` is always `undefined` on the wire, and the chart has always
   shown "no data" regardless of actual signing activity. **Not silently patched** —
   same category as the Document No gap: a backend projection is missing a field
   the domain model already tracks. Flagged with the exact fix needed
   (add `ActivatedAt` to both projections); the frontend renders the honest
   empty state until then.
5. **Stats tiles on the Signatures page** — `?counts=1` returns a flat
   `{total, sent, completed, declined, voided, returnedToAuthor, awaitingMe}`;
   the frontend reads a nonexistent nested `byStatus` map, so `byStatus` is
   always `{}` and the **Pending/Completed/Other tiles always show 0** in
   the shipped app (only Total and Awaiting Me — fetched separately — ever
   showed real numbers). Fixed: compute all three from the real flat fields,
   with a proper non-zero breakdown string for "Other" that the legacy
   version could never actually produce.

**Known gap, not a frontend bug — flagged, not silently patched:** the
envelope list endpoint doesn't return document numbers or counts (see bug
#3's root cause), so the Signatures table's "Document No" and doc-count
columns always show "—"/"0 doc(s)" — same as currently shipping. Fixing
this needs a backend change (a cheap `documentNumbers`/`documentCount`
addition to the `Summarise` projection), which is outside this frontend
migration's scope to make unasked. `docNumbersOf()`/`docCountOf()` in
`pages/signatures.tsx` are written so they'll pick the data up automatically
the day that field exists.

**Dead code found and NOT ported** (confirmed unused, not guessed):
`PdfSignaturePlacer`'s `renderSignatureGraphic`/`TypedSignature` functions,
`CreateEnvelopeWizard`'s `step1Valid()`, `Dasboard.jsx`'s `Delta` component —
all defined in the legacy file, never called anywhere.

## Deliberate deviations from the legacy app (not omissions)

- **Real routes via TanStack Router**, not the `pages[activePage]` object
  switch — route guards replace the history-trap hack, with correct
  browser-back semantics instead of fighting the browser.
- **`xlsx` → `exceljs`**: `xlsx` has two unfixed high-severity advisories
  (prototype pollution, ReDoS); `exceljs` is actively maintained.
- **pdfjs-dist self-hosted**, not pointed at a version-matched CDN URl by
  hand (the legacy app's approach was a version-mismatch footgun).
- **Fonts self-hosted** via npm (`@fontsource/*`, latin subset only) — no
  runtime dependency on a Google Fonts CDN in a validated system.
- Every hook/component is checked against React Compiler purity rules
  (`react(purity)`/`react(refs)`/`react(set-state-in-effect)`), not just
  TypeScript — several "reset X when Y changes" effects were converted to
  the React-documented render-time-adjustment pattern instead of a naive
  effect port, so the compiler can actually optimize these components.

## Dashboard (this checkpoint)

Full port: greeting, needs-attention hero, drag-to-reorder stat tiles and
sections (localStorage-persisted, same as legacy, desktop-only), department
scoping for IT Admin/Administrator, recent audit feed, department breakdown
bars, recent envelopes table, status pie chart (first real use of recharts —
lazy-loaded, its own build chunk, doesn't weigh down other pages).

**Real fix, not a bug this time — a genuine gap closed:** the legacy
Dashboard's stat tiles called `onNavigate(page, filter)`, a prop-drilled
callback with no equivalent in a URL-based router. Added proper
`validateSearch` on the `/app/signatures` route so Dashboard tiles now
deep-link as real URLs (`/app/signatures?status=Sent`) — bookmarkable,
back-button-correct, and the target page re-applies the filter via the
same render-time-adjustment pattern used throughout this migration (not a
raw effect).

**Note:** this page's own stat computation was already correct in the
legacy app (it derives pending/completed/other from the client-side
envelope list, not the broken `?counts=1&byStatus` endpoint) — bug #5 was
specific to `Signatures.jsx`, not this page.

**Compiler-purity fixes found while verifying (2 real, not cosmetic):** a
`useMemo` depended on a value (`audit`/`otherEnvelopes`) that was a fresh
array reference every render, defeating the memoization it was supposed to
provide — `oxlint` caught both via `exhaustive-deps` and
`preserve-manual-memoization`. Fixed by stabilizing the audit-entries
reference and removing an unnecessary manual memo boundary that was
fighting the compiler rather than helping it.

## Settings (this checkpoint) — the most backend-contract bugs found in one page

7. **Test email always reports failure, even on success.** `POST /api/email/test`
   returns `{message}` on success and a 502 with `{error}` on failure — but the
   legacy frontend checks `if (d.success)`, a field that doesn't exist in either
   response. Success silently falls into the failure branch and shows "Failed to
   send test email" even though the email sent. Fixed by using the API client's
   existing throw-on-non-2xx behavior and reading `.message`.
8. **Pending Signature Reminders never actually loads or saves correctly.**
   Checked the backend directly: the reminder schedule has its own dedicated
   `GET/PUT /api/settings/reminder-config` endpoints — it is NOT part of the
   generic settings key/value list at all (there's no `reminderConfig` key
   server-side; it's three separate keys: `reminderEnabled`, `reminderSendHour`,
   `reminderRepeatEveryDays`). The legacy frontend never calls the dedicated GET —
   it tries to read `settings.reminderConfig` from the generic list, which is
   always `undefined`, so the toggle always shows OFF regardless of the real
   state. Worse: on save, it PUTs `{enabled, sendTimeHHMM: "09:00", repeatEveryDays}`,
   but the backend's `ReminderConfigRequest` record expects `{Enabled, SendHour,
   RepeatEveryDays}` — `sendTimeHHMM` doesn't bind to anything, so `SendHour`
   silently deserializes to its default (0) on every save, resetting the send
   time to midnight regardless of what the admin picked. Fixed by using the real
   dedicated endpoint and the real `sendHour` (0–23 integer) field — the UI is
   now an hour-select rather than a misleading HH:MM picker implying
   minute-level precision the backend has never supported.

Both are real, currently-shipping defects — not stylistic choices. Confirmed
against the backend source before fixing either.

## React Compiler note

`SaveBtn` (the per-section save button, used 6 times) was initially defined
*inside* `SettingsPage`'s render body — the classic "component defined inside
a component" mistake, caught by `oxlint`'s `static-components` rule. This
recreates a new component type on every render, which silently breaks
reconciliation (state resets, remounts) and stops the compiler from
optimizing the parent entirely. Hoisted to module scope taking explicit
props instead of closing over page state.

## ChangeRequests + Privileges (this checkpoint)

9. **Change request diffs never showed real field names.** Checked the backend
   `ChangeRequest` entity directly: `payload`/`before` are raw JSON *strings*
   (`payloadJson`/`beforeJson` in the constructor), not nested objects. The
   legacy `DiffView` does `Object.keys(cr.before)` directly on the string —
   which iterates character indices ("0", "1", "2"...), not field names. Every
   before/after diff in the Change Requests approval queue has rendered as
   garbage. Fixed with a defensive `JSON.parse`.
10. **"Manage IT Admins" toggle in the Privilege Matrix always shows OFF.**
    Checked the backend's `PrivilegeSet` record directly: the property is
    `CanManageItAdmins` (lowercase "t") → `canManageItAdmins` on the wire. The
    legacy frontend used `canManageITAdmins` (capital ITA) — a key that never
    matches, so the toggle always reads as unset regardless of the real stored
    value. Fixed with the exact correct casing.

Both confirmed against backend source before fixing, same as every other
finding this migration — not guessed from the frontend's behavior alone.

## ExternalSignPage (final page) — the most severe bug of the whole migration

Re-verified the entire `/api/public/external/*` contract against the backend
before writing this page, given it's the standalone, no-auth-shell external
vendor signing surface.

11. **Every external vendor signature submission has been failing.** The
    backend's `ExternalSubmitRequest` record requires `SigningMeaning`
    (hard `400 Bad Request` if blank) and expects a field called
    `SignatureData`. The legacy frontend's `submit()` call sends neither
    correctly — it never sends `signingMeaning` at all, and sends
    `signatureName` instead of `signatureData`. Every external signer who
    reached the final "Sign & submit" step got a 400 error. This is the
    most severe bug found in this entire migration — a complete failure of
    a core compliance workflow, not a display glitch. Fixed by sending
    `signatureData` (the typed name, same convention as the internal
    SignaturePad) and constructing a `signingMeaning` from the recipient's
    step label, in the same attestation phrasing style used elsewhere
    (`SIGNING_MEANING` in `features/signatures/constants.ts`).
12. **The document preview never rendered for external signers.** The
    `/document/{token}` endpoint streams a raw binary PDF
    (`Results.File(...)`, `Content-Type: application/pdf`), not JSON — but
    the legacy app's single `pub()` helper always calls `.json()`
    unconditionally on every response, silently swallowing the parse
    failure and returning `{}`. `doc.fileData` was always `undefined`, so
    the `<embed>` never rendered — the vendor was asked to sign a document
    they were never shown a preview of in-page. Fixed with a dedicated
    Blob fetch + object URL for this one endpoint, isolated from the
    generic JSON helper.

**Minor, non-blocking gap noted, not fixed:** `RequestOtpAsync` on the
backend takes no request-body parameter at all — the "Your name (optional,
for the email greeting)" field the vendor fills in is sent but silently
ignored server-side; the email is never personalized with it. Kept the
field in the UI (matching the legacy form) since removing it wasn't asked
for and it's harmless, just currently inert.

---

# Migration complete

All 14 pages ported: Login, Sites, Departments, Users, Signatures,
Dashboard, AuditTrail, Reports, Settings, ChangeRequests, Privileges,
ExternalSignPage, plus the auth gates (RoleSelect/SiteSelect/PasswordChange)
and the app shell. Every checkpoint verified with `tsc -b` (0 errors),
`oxlint` (0 errors), and `npm run build` (succeeds) before being marked done.

**12 real, currently-shipping bugs found and fixed** — every one confirmed
against the actual backend source before being touched, never assumed from
the frontend's behavior alone. Summary, roughly by severity:

- **Complete workflow failure:** external vendor signature submission
  always 400s (#11); document preview never renders for external signers (#12)
- **Data silently wrong/lost on save:** reminder schedule always resets to
  midnight and never loads its real state (#8)
- **Feature always shows empty/zero despite real data existing:** Signatures
  page stats always show 0 for Pending/Completed/Other (#5); Bottleneck
  Analysis never has data because a tracked field is never sent (#6);
  Privilege Matrix "Manage IT Admins" toggle never reflects real state (#10)
- **Feature displays wrong/garbled data:** change-request diffs render
  character indices instead of field names (#9)
- **Action reports the wrong result:** test-email always reports failure
  even on success (#7)
- **Would crash on use:** View/Sign envelope modals throw when opening any
  envelope from the list (#3); audit-trail PDF export throws (#2)
- **Cosmetic:** pending-QA-approval badge shows "undefined" (#1); minor
  field default (#4)

Plus dead code identified and correctly omitted rather than blindly ported
(3 instances), and the architectural/tooling decisions documented above
(routing, ExcelJS, self-hosted fonts/PDF.js, React Compiler purity
throughout).

---

# Color-token consolidation (post-migration cleanup)

All hardcoded hex colors scattered across 9 files were consolidated into a
single canonical source: `src/lib/theme-colors.ts`, mirrored as real CSS
custom properties in `src/index.css` (so Tailwind generates matching
utility classes — `text-violet`, `bg-violet-soft`, etc.).

**Real inconsistencies this caught and fixed, not just tidied:**
- The `LOGIN` audit event was **teal** in `constants.ts`'s color map but
  **orange** in `dashboard.tsx`'s — same event, different color depending
  on which screen showed it. Now one tone (`success`) everywhere.
- `ENVELOPE_CREATED` was `info` (blue) in one map and `violet` in another,
  within the *same file*. Resolved to `violet` (2 of 3 sources agreed).
- Three different hex values (`#7c3aed`, `#7c4dc4`, `#8b5cf6`) were all
  being used for what is visually the same "violet/external/effective-date"
  concept across different files. Now one `--color-violet` token.
- `audit-trail-tab.tsx` and `theme-colors.ts` each had their own separate
  `TONE_HEX` map with identical values — a duplicate that would've silently
  drifted apart the next time either one was edited in isolation, exactly
  like the LOGIN color did. Now one definition.

**What moved where:**
- `src/lib/theme-colors.ts` (new) — canonical hex for anything that can't
  use a plain Tailwind class: recharts fills, alpha-blended inline styles
  (`${color}22`), and the hash-based palettes that pick a color
  deterministically from a label (custom signatory capacities, PDF
  recipient boxes).
- `src/index.css` — matching CSS custom properties added to `@theme`:
  `--color-violet`(+soft), `--color-role-*` (6 roles), `--chart-1..6`,
  `--label-1..8`. Generates `text-violet`/`bg-violet-soft`/etc. Tailwind
  utilities automatically.
- `constants.ts` re-exports the old names (`ROLE_COLORS`,
  `CHANGE_ACTION_COLOR`, `AUDIT_EVENT_COLOR`) from `theme-colors.ts` for
  backward compatibility, so no consuming file's imports had to change.

**Left as intentional one-offs, not consolidated:** a couple of
single-use, tool-internal shades inside `PdfSignaturePlacer`'s annotation
editor (a hover-state gray, a warm-brown "handwritten comment" text color)
— these don't repeat anywhere else and aren't tied to any semantic
meaning, so folding them into an unrelated token would reduce clarity
rather than improve it.

Verified with `tsc -b` (0 errors), `oxlint` (0 errors, no new warnings),
and `npm run build` (succeeds).

---

# Layout/section restructuring — separate, larger conversation

You confirmed you want actual page layouts and section arrangement
changed (not just the color pass above). That's a distinct scope of work
from anything done so far — every page in this migration deliberately
kept the legacy app's information architecture (same sections, same
field order, same flows) and only changed the visual system. Restructuring
*where things sit and how they're grouped* needs direction on what's
actually being solved per page before touching 14 already-built pages —
noted as the next thing to scope out with the user.

---

# Layout restructuring (started)

Two pages restructured so far — picked as the clearest, most justified
cases: both were a single long vertical scroll of many unrelated sections,
which is the specific anti-pattern sectioned/tabbed navigation exists to
fix (same reasoning Slack, GitHub, and Linear settings pages use).

**Settings** — was 9 stacked admin cards + Change Password, one continuous
scroll. Restructured into a sidebar-navigated layout: a left nav lists
every section (Company Logo, System Settings, Email/SMTP, Document Master
Data, QA/Checker Department, Print/Download Departments, Maker-Checker,
Signature Reminders, Designation Master, Change Password), and the content
area shows only the selected one. Non-admins see only "Change Password" in
the nav, matching who could already reach it. No card's internal content,
logic, or validation changed — only how you get to each one.

**Reports** — was 10 KPI tiles, a drill-down table, two side-by-side
charts, a bar chart, a bottleneck chart+table, and a full register table,
all stacked in one scroll. Restructured into 4 tabs: **Overview** (KPI
tiles + drill-down), **Trends** (envelope trend line chart, status pie
chart, most-active-senders bar chart), **Bottlenecks** (the bottleneck
analysis chart + step-timing table), **Register** (the sortable envelope
list). The date-range/site filter and Export button stay above the tabs,
since they apply to all four views.

Both verified with `tsc -b` (0 errors), `oxlint` (0 new warnings), and
`npm run build` (succeeds).

**Not yet restructured — Dashboard, Signatures list, Users, AuditTrail,
and the rest.** These are weaker candidates for the same "too many
sections in one scroll" fix (Dashboard's grid is already reasonably
organized; list pages like Signatures/Users/AuditTrail are a filter bar +
one table, which doesn't really benefit from tabbing). If there's a
specific problem with how any of these are laid out, that's worth naming
so the next pass targets it instead of restructuring pages that don't
have a clear issue.


---

# Terminology rename pass

Five renames requested, applied consistently as **display-layer text only**
— internal code identifiers, hook names, and the API contract are
unchanged, since "Envelope"/"Voided"/"Pushback" are literally what the
.NET backend's endpoints and status enum values are named
(`/api/envelopes`, status `"Voided"`). Renaming internal types to match
would create a confusing mismatch with the wire format for zero
user-visible benefit — stated as the interpretation before starting.

1. **Sidebar nav "Signatures" → "Start e-Sign"**.
2. **"Envelope" → "Document" everywhere it's shown to a user** — page/dialog
   titles, buttons, toasts, empty states, table headers, Excel export
   labels, chart titles, tile labels, natural-language prose. ~15 files.
3. **"Void"/"Voided" → "Cancel"/"Cancelled"**. The real work here wasn't
   find-replace: `statusLabel()` in `status-badge.tsx` now maps
   `voided` → "Cancelled" centrally, but several places were rendering the
   *raw* status string directly instead of going through it (Reports'
   drill-down table, the register table, both status filter dropdowns, the
   Dashboard/Reports pie chart legends) — those needed individual fixes or
   they'd have kept showing "Voided". One real bug caught in the process:
   Reports' pie chart looks up slice *color* by the raw status name, so
   relabeling `name` in place would have silently broken the color coding —
   fixed by keeping the raw value and display label as separate fields.
4. **"Push back" → "Return"** — button text, dialog titles, reason labels,
   warning copy, the Privilege Matrix's "Push Back to Author" permission
   label, and the Reports "Pushback Rate" KPI/export label.

Verified with `tsc -b` (0 errors), `oxlint` (0 errors, 22 baseline
warnings unchanged), and `npm run build` (succeeds).

---

# Dashboard — enterprise-level redesign

Rebuilt, not just restyled. Same underlying data logic preserved exactly
(scoping, stat computation, department/status aggregation) — the change is
structural and compositional.

**Removed: drag-to-customize.** Per-user draggable tile/section reordering
with localStorage persistence is a consumer/prosumer pattern, not an
enterprise one — enterprise dashboards are standardized per role so
everyone on a team sees the same layout and support/training doesn't have
to account for N different arrangements. Removed ~80 lines of drag state
and layout-persistence logic entirely in favor of one fixed, deliberately
composed layout.

**New structure:**
- Compact header — scope label + a live "as of HH:MM IST" timestamp
  instead of a large decorative greeting; this is what someone actually
  checks before trusting the numbers below.
- **Launchpad row** — Start e-Sign / Reports / Audit Trail / (Users, if
  admin) as one-click actions. Enterprise dashboards function as an entry
  point to the app, not just a read-only report.
- Awaiting-me alert restyled from a big gradient hero card to a slim,
  restrained action banner — still prominent, less "consumer app."
- KPI row: same four tiles, but the Total tile now carries a **real**
  week-over-week delta (created this week vs. the week before), computed
  from the `createdAt` timestamps already being fetched — not a fabricated
  trend indicator. No other tile gets one, since there's no historical
  snapshot to compute a genuine delta for status counts; adding fake
  trend arrows everywhere "for symmetry" would be worse than having none.
- **Primary content + right rail**, the standard enterprise-dashboard
  split, replacing the old symmetric 2×2 card grid: Recent Documents
  (now 8 rows, wider) on the left; Status distribution, Department
  Overview (or personal stats), and a condensed Recent Activity feed
  stacked in a narrower right column.

**Compiler-purity note:** the week-delta calculation needs `Date.now()`.
Calling it directly in the render body is flagged by the React Compiler's
purity check even though it's harmless in a client-only SPA (no
hydration-mismatch risk) — the useMemo variant was flagged too, for the
same reason. Fixed properly with a `useState(() => Date.now())` lazy
initializer, which React explicitly documents as the safe place for
one-time impure reads, rather than suppressing or ignoring the warning.

Verified with `tsc -b` (0 errors), `oxlint` (0 errors, 22 baseline
warnings unchanged), and `npm run build` (succeeds).

---

# Railway/GitHub deployment readiness (caught before first deploy)

The project had no way to actually run in production. `npm run build`
worked fine, but there was no `start` script and no production server —
Railway's Nixpacks auto-detect runs `npm run build` then `npm start`, and
`vite preview` (the only thing that would otherwise be available) isn't
built for production traffic (Vite's own docs say so explicitly). Fixed:

- **`server.js`** (new) — small dependency-free Node static server: SPA
  fallback to `index.html` for any non-asset path (needed for both the
  `/app/*` client routes and the standalone `/external/sign/:token`
  route), the same security headers the legacy app's server used, correct
  cache headers (`immutable` on hashed assets, `no-cache` on
  `index.html`), reads `PORT` from the environment. **Actually run and
  curl-tested** against the real build output — root, a hashed JS asset,
  and both SPA-fallback routes all verified to return the right status,
  content-type, and headers — not just written and assumed correct.
- **`"start": "node server.js"`** added to `package.json`.
- **`README.md`** replaced (it was still the unedited Vite scaffold
  default) with real setup/build/deploy docs, including the Railway +
  GitHub checklist and environment variables needed on both services.

**The one gotcha worth repeating outside the README too:** `VITE_API_URL`
is baked into the JS bundle at **build time**, not read at runtime (Vite's
`import.meta.env.*` behavior). It has to be set on the Railway frontend
service *before* the first build, and the service needs a redeploy — not
just a restart — if it's ever changed. Setting it only as a runtime
variable, or setting it after the first deploy without rebuilding, will
silently ship a build that calls the wrong API origin.

Backend repo (separate, already covered earlier in this conversation —
Azure cleanup, Postgres-only DB config, Dockerfile) has a real
`.gitignore` (`bin/`, `obj/`, dev-secrets file excluded) and no committed
secrets — `Jwt:Secret` and the email password are empty in
`appsettings.json`, meant to be supplied as Railway environment variables
(`Jwt__Secret`, etc.), and the committed Postgres connection string is a
local-dev placeholder (`Password=CHANGE_ME`), not a real credential.
