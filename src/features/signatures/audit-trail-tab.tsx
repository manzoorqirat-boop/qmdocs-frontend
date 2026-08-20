import { Printer, Download, Send, PenLine, X, ArrowLeftRight, Archive, ArrowLeft, Loader2 } from 'lucide-react';
import { useEnvelopeAudit } from '@/features/envelopes/hooks';
import { formatDateTime, EVENT_LABELS } from '@/features/signatures/constants';
import { TONE_HEX } from '@/lib/theme-colors';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import type { EnvelopeSummary, EnvelopeDetail } from '@/types/api';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  ENVELOPE_CREATED: <Send size={12} />,
  ENVELOPE_SIGNED: <PenLine size={12} />,
  ENVELOPE_DECLINED: <X size={12} />,
  ENVELOPE_VOIDED: <X size={12} />,
  ENVELOPE_DELEGATED: <ArrowLeftRight size={12} />,
  ENVELOPE_REASSIGNED: <ArrowLeftRight size={12} />,
  ENVELOPE_PUSHED_BACK: <ArrowLeft size={12} />,
  ENVELOPE_RESENT: <Send size={12} />,
  ENVELOPE_SIGNATURE_VOIDED: <X size={12} />,
  ENVELOPE_DOWNLOADED: <Download size={12} />,
  ENVELOPE_PRINTED: <Printer size={12} />,
  ENVELOPE_ARCHIVED: <Archive size={12} />,
};

function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface AuditTrailTabProps {
  envelopeId: string;
  /** Used only for the exported report's header metadata — the audit
   * endpoint itself doesn't return the full envelope. */
  envelope?: EnvelopeSummary | EnvelopeDetail;
}

export function AuditTrailTab({ envelopeId, envelope }: AuditTrailTabProps) {
  const { data, isLoading, error } = useEnvelopeAudit(envelopeId);

  function buildAuditHtml() {
    if (!data) return '';
    const rows = data.entries
      .map(
        (e, i) => `<tr>
      <td class="num">${i + 1}</td><td>${esc(formatDateTime(e.timestamp))}</td>
      <td><span class="evt">${esc((e.event || '').replace(/_/g, ' '))}</span></td>
      <td>${esc(e.username)}</td>
      <td class="detail">${e.oldValue ? '<div><b>Before:</b> ' + esc(e.oldValue) + '</div>' : ''}${e.newValue ? '<div><b>After:</b> ' + esc(e.newValue) + '</div>' : ''}</td>
    </tr>`,
      )
      .join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Audit Trail</title>
<style>*{box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;color:#1c2230;margin:32px}h1{font-size:19px;margin:0 0 4px}.sub{color:#6b7280;font-size:12px;margin-bottom:18px}.meta{border:1px solid #d8dce3;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.meta b{color:#374151}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;text-align:left;padding:7px 8px;border-bottom:2px solid #d1d5db;font-size:10px;text-transform:uppercase;letter-spacing:.04em}td{padding:7px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}td.num{color:#9ca3af;width:30px}td.detail{font-size:10px;color:#4b5563}.evt{font-weight:600;color:#1d4ed8}.foot{margin-top:22px;padding-top:10px;border-top:1px solid #d8dce3;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}@media print{body{margin:14mm}.noprint{display:none}}.noprint{margin-bottom:16px}.btn{padding:8px 16px;font-size:13px;border:1px solid #1d4ed8;border-radius:6px;background:#1d4ed8;color:#fff;cursor:pointer;margin-right:8px}.btn.ghost{background:#fff;color:#1d4ed8}</style>
</head><body>
<div class="noprint"><button class="btn" onclick="window.print()">Print / Save as PDF</button><button class="btn ghost" onclick="window.close()">Close</button></div>
<h1>Audit Trail Report</h1><div class="sub">QMDocs · Immutable record</div>
<div class="meta">
  <div><b>Document:</b> ${esc(envelope?.title || data.title)}</div><div><b>ID:</b> ${esc(data.envelopeId)}</div>
  <div><b>Sender:</b> ${esc(envelope?.createdBy || '—')}</div><div><b>Dept:</b> ${esc(envelope?.ownerDepartment || '—')}</div>
  <div><b>Status:</b> ${esc(envelope?.status || '—')}</div><div><b>Created:</b> ${esc(envelope?.createdAt ? formatDateTime(envelope.createdAt) : '—')}</div>
  <div><b>Generated:</b> ${esc(formatDateTime(new Date().toISOString()))}</div><div><b>Events:</b> ${data.entries.length}</div>
</div>
<table><thead><tr><th>#</th><th>Timestamp</th><th>Event</th><th>User</th><th>Details</th></tr></thead>
<tbody>${rows || '<tr><td colspan=5 style="text-align:center;padding:20px;color:#9ca3af">No events</td></tr>'}</tbody></table>
<div class="foot"><span>QMDocs</span><span>${esc(envelope?.title || data.title)}</span></div>
</body></html>`;
  }

  function openWindow(autoprint: boolean) {
    if (!data) return;
    const win = window.open('', '_blank');
    if (!win) {
      toast.warn('Allow pop-ups to export.');
      return;
    }
    win.document.open();
    win.document.write(buildAuditHtml());
    win.document.close();
    if (autoprint) win.onload = () => { win.focus(); win.print(); };
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-slate">
        <Loader2 size={16} className="animate-spin" /> Loading audit trail…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md bg-danger-soft p-3 text-danger">
        {error instanceof Error ? error.message : 'Could not load audit trail.'}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-ink">{data.entries.length} events · immutable trail</div>
          <div className="mt-0.5 text-[11px] text-slate">Read-only · chronological</div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => openWindow(true)}>
            <Printer size={13} /> Print
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openWindow(false)}>
            <Download size={13} /> Save as PDF
          </Button>
        </div>
      </div>

      {data.entries.length === 0 ? (
        <div className="py-6 text-center text-slate">No audit events recorded yet.</div>
      ) : (
        <div className="relative pl-7">
          <div className="absolute top-2 bottom-2 left-[11px] w-0.5 bg-line" />
          {data.entries.map((e, i) => {
            const tone = EVENT_LABELS[e.event]?.tone || 'default';
            const color = TONE_HEX[tone];
            const icon = EVENT_ICONS[e.event] || <span className="text-[10px]">·</span>;
            return (
              <div key={e.id || i} className="relative mb-3.5">
                <div
                  className="absolute -left-[23px] top-1 flex size-[22px] items-center justify-center rounded-full text-white shadow-[0_0_0_3px_var(--color-paper-raised)]"
                  style={{ background: color }}
                >
                  {icon}
                </div>
                <div className="rounded-md border border-line bg-paper px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold" style={{ color }}>
                      {e.event.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[11px] text-slate">{formatDateTime(e.timestamp)}</div>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-soft">
                    by <strong className="text-ink">{e.username}</strong>
                  </div>
                  {(e.oldValue || e.newValue) && (
                    <div className="mt-1.5 border-t border-dashed border-line pt-1.5">
                      {e.oldValue && (
                        <div className="mb-0.5 text-[11px] text-slate">
                          <strong>Before:</strong> {e.oldValue}
                        </div>
                      )}
                      {e.newValue && (
                        <div className="text-[11px] leading-relaxed text-ink">
                          <strong>After:</strong> {e.newValue}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
