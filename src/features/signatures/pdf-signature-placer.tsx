import { useEffect, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from '@/lib/pdfjs';
import { toast } from '@/lib/toast';
import { CHART_PALETTE, VIOLET_HEX, VIOLET_INK_HEX, ROLE_HEX, TONE_HEX } from '@/lib/theme-colors';
import type {
  FileSource,
  PlacementRecipient,
  SignatureBox,
  AppliedSignature,
  EffectiveDateField,
  AppliedEffectiveDate,
  Annotation,
} from '@/features/signatures/types';

const IST_TZ = 'Asia/Kolkata';
function istParts(d: string | number | Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(d));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return { day: g('day'), month: g('month'), year: g('year'), hour: g('hour'), minute: g('minute'), second: g('second') };
}
function fmtDateTime(d: string | undefined) {
  if (!d) return '';
  const p = istParts(d);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second} IST`;
}
function fmtDateOnly(d: string | undefined) {
  if (!d) return '';
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const p = istParts(d);
  return `${p.day}-${M[Number(p.month) - 1]}-${p.year}`;
}

// Minimum stamp size (as % of page). The signature block adapts to the box:
// at full size it shows role, name, date, username, department + graphic;
// as the box shrinks, lowest-priority lines are dropped and the font scales
// down. These floors are set low so a signature can fit into tight document
// spaces; the server-side flatten renderer mirrors the same tiers so the
// downloaded PDF matches this preview.
const MIN_SIG_W = 12;
const MIN_SIG_H = 5;
const MIN_EFFDATE_W = 10;
const MIN_EFFDATE_H = 4;

interface DragState {
  page: number;
  startX: number;
  startY: number;
  nowX: number;
  nowY: number;
}

interface PdfSignaturePlacerProps {
  fileSource: FileSource | null;
  recipients?: PlacementRecipient[];
  activeRecipient?: string;
  boxes?: SignatureBox[];
  onBoxesChange?: (boxes: SignatureBox[]) => void;
  mode?: 'place' | 'preview';
  highlightUsername?: string;
  appliedSignatures?: AppliedSignature[];
  effectiveDateFields?: EffectiveDateField[];
  appliedEffectiveDates?: AppliedEffectiveDate[];
  /** Pass to display signer annotations; also pass onAnnotationsChange to
   * enable placing/removing (used for the CURRENT signer only — applied
   * historical annotations always render read-only). */
  annotations?: Annotation[];
  onAnnotationsChange?: ((next: Annotation[]) => void) | null;
}

// Continuous scroll: all pages render stacked vertically, no Prev/Next
// paging. Each page has its own canvas + overlay. Box coordinates are
// page-relative percentages.
export function PdfSignaturePlacer({
  fileSource,
  recipients = [],
  activeRecipient,
  boxes = [],
  onBoxesChange,
  mode = 'place',
  highlightUsername = '',
  appliedSignatures = [],
  effectiveDateFields = [],
  appliedEffectiveDates = [],
  annotations = [],
  onAnnotationsChange = null,
}: PdfSignaturePlacerProps) {
  const [annTool, setAnnTool] = useState<'tick' | 'cross' | 'text' | null>(null);
  const annotating = typeof onAnnotationsChange === 'function';

  const [pendingText, setPendingText] = useState<{ page: number; x: number; y: number } | null>(null);

  function overlapsSignatureArea(a: { page: number; x: number; y: number; width: number; height: number }) {
    const reserved = [...boxes, ...appliedSignatures, ...effectiveDateFields, ...appliedEffectiveDates].filter(
      (r) => (r.page || 1) === (a.page || 1),
    );
    return reserved.some((r) => a.x < r.x + r.width && a.x + a.width > r.x && a.y < r.y + r.height && a.y + a.height > r.y);
  }

  function annotationRect(page: number, xPct: number, yPct: number, kind: 'tick' | 'cross' | 'text') {
    const isText = kind === 'text';
    const w = isText ? 24 : 4;
    const h = isText ? 6 : 3;
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      page,
      x: round(Math.min(100 - w, Math.max(0, xPct - w / 2))),
      y: round(Math.min(100 - h, Math.max(0, yPct - h / 2))),
      width: w,
      height: h,
      kind,
    };
  }

  function placeAnnotation(page: number, xPct: number, yPct: number) {
    if (!annotating || !annTool) return;
    const a = annotationRect(page, xPct, yPct, annTool);
    if (overlapsSignatureArea(a)) {
      toast.warn('This spot overlaps a signature box — please place the mark outside signature areas.');
      return;
    }
    if (annTool === 'text') {
      setPendingText({ page, x: a.x, y: a.y });
      return;
    }
    onAnnotationsChange?.([...annotations, { ...a, text: '' }]);
  }

  function commitPendingText(value: string) {
    const text = (value || '').trim();
    const p = pendingText;
    setPendingText(null);
    if (!p || !text) return;
    onAnnotationsChange?.([...annotations, { page: p.page, x: p.x, y: p.y, width: 24, height: 6, kind: 'text', text }]);
  }
  function removeAnnotation(a: Annotation) {
    if (!annotating) return;
    onAnnotationsChange?.(annotations.filter((x) => x !== a));
  }
  function updateAnnotation(a: Annotation, next: Annotation) {
    if (!annotating) return;
    if (overlapsSignatureArea(next)) return;
    onAnnotationsChange?.(annotations.map((x) => (x === a ? next : x)));
  }

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderError, setRenderError] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);

  // Depend on the *content* of the source, not the wrapper object's
  // identity — parents often pass a fresh `{ type, data }` literal on every
  // render (e.g. every keystroke in the sign dialog). Keying the load on
  // the object reference tore the whole PDF down and re-rasterized it on
  // each such render, which showed up as the preview visibly "vibrating"
  // while signing.
  const srcType = fileSource?.type || null;
  const srcData = fileSource?.type === 'base64' ? fileSource.data : null;
  const srcFile = fileSource?.type === 'file' ? fileSource.file : null;

  useEffect(() => {
    if (!srcType) return;
    let cancelled = false;
    (async () => {
      try {
        setRenderError('');
        setPdf(null);
        setPageCount(0);
        const pdfjsLib = await loadPdfjs();
        let task;
        if (srcType === 'file' && srcFile) {
          const buf = await srcFile.arrayBuffer();
          task = pdfjsLib.getDocument({ data: buf });
        } else if (srcType === 'base64' && srcData) {
          const bin = atob(srcData);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          task = pdfjsLib.getDocument({ data: arr });
        } else {
          throw new Error('Unknown fileSource type');
        }
        const doc = await task.promise;
        if (cancelled) return;
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to render PDF';
          setRenderError(
            message.includes('fake worker')
              ? 'PDF preview could not load (worker blocked). Reload the page; contact your administrator if it persists.'
              : message,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [srcType, srcData, srcFile]);

  function colorFor(username: string) {
    if (username === '__EFFDATE__') return VIOLET_HEX;
    const palette = CHART_PALETTE;
    const idx = Math.abs((username || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length;
    return palette[idx];
  }

  function pointerPctInPage(e: React.MouseEvent | React.TouchEvent, pageEl: HTMLElement) {
    const rect = pageEl.getBoundingClientRect();
    const t = 'touches' in e ? e.touches[0] || (e as unknown as { clientX: number; clientY: number }) : e;
    return {
      x: ((t.clientX - rect.left) / rect.width) * 100,
      y: ((t.clientY - rect.top) / rect.height) * 100,
    };
  }
  function onDown(e: React.MouseEvent | React.TouchEvent, pageNum: number, pageEl: HTMLElement) {
    if (mode !== 'place' || !activeRecipient) return;
    e.preventDefault();
    const p = pointerPctInPage(e, pageEl);
    setDrag({ page: pageNum, startX: p.x, startY: p.y, nowX: p.x, nowY: p.y });
  }
  function onMove(e: React.MouseEvent | React.TouchEvent, pageNum: number, pageEl: HTMLElement) {
    if (mode !== 'place' || !drag || drag.page !== pageNum) return;
    e.preventDefault();
    const p = pointerPctInPage(e, pageEl);
    setDrag((d) => (d ? { ...d, nowX: p.x, nowY: p.y } : d));
  }
  function onUp() {
    if (mode !== 'place' || !drag) {
      setDrag(null);
      return;
    }
    const { page, startX, startY, nowX, nowY } = drag;
    let x = Math.min(startX, nowX);
    let y = Math.min(startY, nowY);
    let w = Math.abs(nowX - startX);
    let h = Math.abs(nowY - startY);
    setDrag(null);
    if (w < 1 && h < 1) return;

    const isEffDate = activeRecipient === '__EFFDATE__';
    const MIN_W = isEffDate ? MIN_EFFDATE_W : MIN_SIG_W;
    const MIN_H = isEffDate ? MIN_EFFDATE_H : MIN_SIG_H;
    if (w < MIN_W) w = MIN_W;
    if (h < MIN_H) h = MIN_H;
    if (x + w > 100) x = Math.max(0, 100 - w);
    if (y + h > 100) y = Math.max(0, 100 - h);

    const round = (n: number) => Math.round(n * 10) / 10;
    const newBox: SignatureBox = {
      recipientUsername: activeRecipient!,
      page,
      x: round(x),
      y: round(y),
      width: round(w),
      height: round(h),
    };

    // Overlap prevention: signature/effective-date boxes may not overlap
    // each other on the same page — overlapping stamps render on top of
    // one another in the signed PDF and become unreadable. The box being
    // replaced (same recipient / the single eff-date box) is excluded so
    // re-placing your own box still works.
    const rectsOverlap = (a: SignatureBox, b: SignatureBox) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const survivors = isEffDate
      ? boxes.filter((b) => !(b.recipientUsername === '__EFFDATE__' && b.page === page))
      : boxes.filter((b) => !(b.recipientUsername === activeRecipient && b.page === page));
    const clash = survivors.find((b) => b.page === page && rectsOverlap(newBox, b));
    if (clash) {
      const who = clash.recipientUsername === '__EFFDATE__' ? 'the Effective Date box' : `${clash.recipientUsername}'s box`;
      setRenderError(`That position overlaps ${who} on page ${page}. Place the box in a clear area — boxes may not overlap.`);
      setTimeout(() => setRenderError(''), 4000);
      return;
    }

    onBoxesChange?.([...survivors, newBox]);
  }
  function removeBox(b: SignatureBox) {
    if (mode !== 'place') return;
    onBoxesChange?.(boxes.filter((x) => x !== b));
  }

  return (
    <div className="w-full">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-[13px] text-slate">
          {pageCount > 0 ? `${pageCount} page${pageCount > 1 ? 's' : ''} · scroll to view all` : 'Loading document…'}
        </div>
        {annotating && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-slate">Add to document:</span>
            {(
              [
                { id: 'tick', label: '✓ Tick', color: TONE_HEX.success },
                { id: 'cross', label: '✗ Cross', color: TONE_HEX.danger },
                { id: 'text', label: 'T  Comment', color: TONE_HEX.warning },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAnnTool(annTool === t.id ? null : t.id)}
                className="rounded-md border px-2 py-1 text-[12px] font-semibold"
                style={
                  annTool === t.id
                    ? { background: t.color, color: '#fff', borderColor: t.color }
                    : { color: t.color, borderColor: 'var(--color-line)' }
                }
              >
                {t.label}
              </button>
            ))}
            {annTool && <span className="text-[11px] text-slate">click on the page to place · click a mark to remove</span>}
          </div>
        )}
        {mode === 'place' && (
          <div className="text-[12px] text-slate">
            {activeRecipient ? (
              activeRecipient === '__EFFDATE__' ? (
                <>
                  Drag a rectangle for <strong style={{ color: colorFor('__EFFDATE__') }}>Effective Date box</strong>
                </>
              ) : (
                <>
                  Drag a rectangle for <strong style={{ color: colorFor(activeRecipient) }}>{activeRecipient}</strong>
                </>
              )
            ) : (
              'Pick a recipient on the right to place their signature'
            )}
          </div>
        )}
      </div>

      {renderError && (
        <div className="mb-2 rounded-md bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{renderError}</div>
      )}

      <div className="flex max-h-[70vh] flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-md border border-line bg-paper p-3">
        {pageCount === 0 && !renderError && <div className="py-8 text-center text-[13px] text-slate">Rendering PDF…</div>}
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
          <PdfPage
            key={pageNum}
            pdf={pdf}
            pageNum={pageNum}
            mode={mode}
            activeRecipient={activeRecipient}
            colorFor={colorFor}
            recipients={recipients}
            boxes={boxes.filter((b) => b.page === pageNum)}
            removeBox={removeBox}
            appliedSignatures={appliedSignatures.filter((s) => s.page === pageNum)}
            effectiveDateFields={effectiveDateFields.filter((f) => f.page === pageNum)}
            appliedEffectiveDates={appliedEffectiveDates.filter((f) => f.page === pageNum)}
            annotations={annotations.filter((a) => (a.page || 1) === pageNum)}
            annTool={annotating ? annTool : null}
            placeAnnotation={placeAnnotation}
            pendingText={pendingText && pendingText.page === pageNum ? pendingText : null}
            commitPendingText={commitPendingText}
            cancelPendingText={() => setPendingText(null)}
            removeAnnotation={annotating ? removeAnnotation : undefined}
            updateAnnotation={annotating ? updateAnnotation : undefined}
            highlightUsername={highlightUsername}
            drag={drag && drag.page === pageNum ? drag : null}
            onDown={onDown}
            onMove={onMove}
            onUp={onUp}
          />
        ))}
      </div>

      {mode === 'place' && (
        <div className="mt-2 text-[12px] text-slate">
          Scroll through all pages. Click an existing box to delete it. Each recipient gets one box per page; one
          Effective Date box per page.
        </div>
      )}
    </div>
  );
}

// ── PdfPage — one page: canvas + overlay ──────────────────────────────────
interface PdfPageProps {
  pdf: PDFDocumentProxy | null;
  pageNum: number;
  mode: 'place' | 'preview';
  activeRecipient?: string;
  colorFor: (u: string) => string;
  recipients: PlacementRecipient[];
  boxes: SignatureBox[];
  removeBox: (b: SignatureBox) => void;
  appliedSignatures: AppliedSignature[];
  effectiveDateFields: EffectiveDateField[];
  appliedEffectiveDates: AppliedEffectiveDate[];
  annotations: Annotation[];
  annTool: 'tick' | 'cross' | 'text' | null;
  placeAnnotation: (page: number, x: number, y: number) => void;
  pendingText: { page: number; x: number; y: number } | null;
  commitPendingText: (value: string) => void;
  cancelPendingText: () => void;
  removeAnnotation?: (a: Annotation) => void;
  updateAnnotation?: (a: Annotation, next: Annotation) => void;
  highlightUsername: string;
  drag: DragState | null;
  onDown: (e: React.MouseEvent | React.TouchEvent, pageNum: number, pageEl: HTMLElement) => void;
  onMove: (e: React.MouseEvent | React.TouchEvent, pageNum: number, pageEl: HTMLElement) => void;
  onUp: () => void;
}

function PdfPage({
  pdf,
  pageNum,
  mode,
  activeRecipient,
  colorFor,
  recipients,
  boxes,
  removeBox,
  appliedSignatures,
  effectiveDateFields,
  appliedEffectiveDates,
  annotations,
  annTool,
  placeAnnotation,
  pendingText,
  commitPendingText,
  cancelPendingText,
  removeAnnotation,
  updateAnnotation,
  highlightUsername,
  drag,
  onDown,
  onMove,
  onUp,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      try {
        setPageError('');
        const page = await pdf.getPage(pageNum);
        const wrapW = wrapRef.current?.parentElement?.clientWidth || 700;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, (wrapW - 4) / base.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // @ts-expect-error — pdfjs-dist's render() type wants a `canvas` field
        // that older/newer minor versions disagree on; canvasContext+viewport
        // is the documented and correct call.
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendered(true);
      } catch (err) {
        if (!cancelled) setPageError(err instanceof Error ? err.message : `Could not render page ${pageNum}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNum]);

  const appliedSigUsers = new Set(appliedSignatures.map((s) => s.recipientUsername));
  const hasAppliedEffDate = appliedEffectiveDates.length > 0;

  let liveBox: { x: number; y: number; width: number; height: number } | null = null;
  if (drag) {
    liveBox = {
      x: Math.min(drag.startX, drag.nowX),
      y: Math.min(drag.startY, drag.nowY),
      width: Math.abs(drag.nowX - drag.startX),
      height: Math.abs(drag.nowY - drag.startY),
    };
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="absolute top-1 left-1 z-10 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-white pointer-events-none">
        Page {pageNum}
      </div>

      <div
        className="relative w-full overflow-hidden rounded bg-white shadow-sm"
        style={{
          touchAction: mode === 'place' ? 'none' : 'auto',
          cursor: annTool ? 'copy' : mode === 'place' && activeRecipient ? 'crosshair' : 'default',
        }}
        onClick={(e) => {
          if (!annTool) return;
          const r = e.currentTarget.getBoundingClientRect();
          placeAnnotation(pageNum, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
        }}
        onMouseDown={(e) => onDown(e, pageNum, e.currentTarget)}
        onMouseMove={(e) => onMove(e, pageNum, e.currentTarget)}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={(e) => onDown(e, pageNum, e.currentTarget)}
        onTouchMove={(e) => onMove(e, pageNum, e.currentTarget)}
        onTouchEnd={onUp}
      >
        <canvas ref={canvasRef} className="block h-auto w-full" />
        {!rendered && !pageError && <div className="p-5 text-[12px] text-slate">Rendering page {pageNum}…</div>}
        {pageError && (
          <div className="bg-danger-soft p-4 text-[12px] text-danger">
            Page {pageNum} failed to render: {pageError}
          </div>
        )}

        {mode === 'place' &&
          boxes.map((b, i) => {
            const isEff = b.recipientUsername === '__EFFDATE__';
            const r = recipients.find((rr) => rr.username === b.recipientUsername);
            const label = isEff ? 'Effective Date' : r ? `${b.recipientUsername} (${r.stepLabel || r.role})` : b.recipientUsername;
            const color = colorFor(b.recipientUsername);
            return (
              <div
                key={`place-${i}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeBox(b);
                }}
                title={`Click to remove ${label}`}
                className="absolute flex cursor-pointer items-center justify-center rounded text-[11px] font-semibold"
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  width: `${b.width}%`,
                  height: `${b.height}%`,
                  border: `2px solid ${color}`,
                  background: `${color}1f`,
                  color,
                }}
              >
                {label}
              </div>
            );
          })}

        {mode === 'preview' && appliedSignatures.map((s, i) => (
          <SignatureStamp key={`sig-${i}`} stamp={s} />
        ))}

        {mode === 'preview' &&
          recipients.flatMap((r, ri) => {
            const fieldsForUser = boxes.filter((b) => b.recipientUsername === r.username);
            return fieldsForUser
              .filter(() => !appliedSigUsers.has(r.username))
              .map((f, fi) => {
                const color = colorFor(r.username);
                const hi = r.username === highlightUsername;
                return (
                  <div
                    key={`unsigned-${ri}-${fi}`}
                    className="pointer-events-none absolute flex items-center justify-center rounded text-[11px] font-semibold"
                    style={{
                      left: `${f.x}%`,
                      top: `${f.y}%`,
                      width: `${f.width}%`,
                      height: `${f.height}%`,
                      border: `${hi ? 3 : 2}px dashed ${color}`,
                      background: `${color}10`,
                      color,
                    }}
                  >
                    Awaiting: {r.username} ({r.stepLabel || r.role})
                  </div>
                );
              });
          })}

        {mode === 'preview' && appliedEffectiveDates.map((e, i) => <EffectiveDateStamp key={`effdate-${i}`} stamp={e} />)}

        {mode === 'preview' &&
          !hasAppliedEffDate &&
          effectiveDateFields.map((f, i) => (
            <div
              key={`effdate-empty-${i}`}
              className="pointer-events-none absolute flex items-center justify-center rounded border-2 border-dashed text-[11px] font-semibold"
              style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%`, height: `${f.height}%`, borderColor: VIOLET_HEX, background: `${VIOLET_HEX}10`, color: VIOLET_HEX }}
            >
              Effective Date (awaiting approval)
            </div>
          ))}

        {pendingText && (
          <input
            autoFocus
            placeholder="Type comment… (Enter to save, Esc to cancel)"
            className="absolute z-40 min-w-[180px] rounded border-[1.5px] border-dashed border-seal bg-white/95 px-2 py-1 text-[13px] text-ink outline-none"
            style={{ left: `${pendingText.x}%`, top: `${pendingText.y}%`, width: '26%' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPendingText((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') cancelPendingText();
            }}
            onBlur={(e) => commitPendingText(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {annotations.map((a, i) => {
          const editable = !!updateAnnotation && !a.byUsername;
          return (
            <AnnotationMarker
              key={`ann-${i}`}
              a={a}
              editable={editable}
              onChange={(next) => editable && updateAnnotation?.(a, next)}
              onRemove={() => removeAnnotation?.(a)}
            />
          );
        })}

        {liveBox && activeRecipient && (
          <div
            className="pointer-events-none absolute border-2 border-dashed"
            style={{
              left: `${liveBox.x}%`,
              top: `${liveBox.y}%`,
              width: `${liveBox.width}%`,
              height: `${liveBox.height}%`,
              borderColor: colorFor(activeRecipient),
              background: `${colorFor(activeRecipient)}25`,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── SignatureStamp — measures its own box and adapts font size / line
// count so details never clip, even on small boxes. ─────────────────────
function SignatureStamp({ stamp }: { stamp: AppliedSignature }) {
  const stepLabel = stamp.stepLabel || stamp.signerRole || 'Signer';
  const accent = ROLE_HEX[stepLabel] || TONE_HEX.default;

  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const name = stamp.signerFullName || stamp.recipientUsername || '';

  const allLines = [
    { key: 'role', text: stepLabel, bold: true, color: accent, priority: 1 },
    { key: 'name', text: name, bold: true, color: 'var(--color-ink)', priority: 1 },
    { key: 'desig', text: stamp.signerDesignation || '', bold: false, color: 'var(--color-ink)', priority: 2 },
    { key: 'date', text: fmtDateTime(stamp.signedAt), bold: false, color: 'var(--color-slate)', priority: 2 },
    { key: 'user', text: stamp.recipientUsername || '', bold: false, color: 'var(--color-slate)', priority: 3 },
    { key: 'dept', text: stamp.signerDepartment || '', bold: false, color: 'var(--color-slate)', priority: 4 },
  ].filter((l) => l.text);

  const panelW = w;
  const panelH = h;
  const padX = panelW * 0.08;
  const padY = panelH * 0.1;
  const availW = Math.max(1, panelW - padX * 2);
  const availH = Math.max(1, panelH - padY * 2);

  const MIN_FS = 4.6;
  const MAX_FS = 11;
  const LH = 1.22;
  const CHAR_W = 0.52;

  function fitFor(lines: typeof allLines) {
    if (!lines.length || availW <= 0) return { fs: MIN_FS, ok: false };
    const longest = lines.reduce((m, l) => Math.max(m, l.text.length), 1);
    const fsByWidth = availW / (longest * CHAR_W);
    const fsByHeight = availH / (lines.length * LH);
    const fs = Math.min(MAX_FS, fsByWidth, fsByHeight);
    return { fs, ok: fs >= MIN_FS };
  }

  let lines = allLines.slice();
  let fit = fitFor(lines);
  while (!fit.ok && lines.length > 2) {
    const dropIdx = lines.reduce((wi, l, i, a) => (l.priority >= a[wi].priority ? i : wi), 0);
    lines = lines.filter((_, i) => i !== dropIdx);
    fit = fitFor(lines);
  }
  const fs = Math.max(MIN_FS, Math.min(MAX_FS, fit.fs));

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute flex flex-col overflow-hidden"
      style={{ left: `${stamp.x}%`, top: `${stamp.y}%`, width: `${stamp.width}%`, height: `${stamp.height}%`, lineHeight: LH }}
    >
      {/* Faint QMDOCS watermark, matching the flattened server-side PDF. */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none" className="block">
          <text
            x="50"
            y="13"
            textAnchor="middle"
            textLength="94"
            lengthAdjust="spacingAndGlyphs"
            style={{ fontWeight: 700, fontSize: '11px', fill: 'var(--color-slate)', opacity: 0.13, letterSpacing: '0.04em' }}
          >
            QMDOCS
          </text>
        </svg>
      </div>
      <div
        className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden"
        style={{ padding: `${padY}px ${padX}px`, fontSize: `${fs}px` }}
      >
        {lines.map((l) => (
          <div key={l.key} className="w-full overflow-hidden text-clip whitespace-nowrap" style={{ color: l.color, fontWeight: l.bold ? 700 : 400 }}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function EffectiveDateStamp({ stamp }: { stamp: AppliedEffectiveDate }) {
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center rounded font-bold"
      style={{
        left: `${stamp.x}%`,
        top: `${stamp.y}%`,
        width: `${stamp.width}%`,
        height: `${stamp.height}%`,
        border: `1.5px solid ${VIOLET_HEX}`,
        background: 'rgba(243,238,253,0.96)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        color: VIOLET_INK_HEX,
        fontSize: 'min(1vw, 11px)',
        letterSpacing: 0.5,
      }}
    >
      {fmtDateOnly(stamp.effectiveDate)}
    </div>
  );
}

// ── AnnotationMarker — signer's tick/cross/comment mark. Draggable +
// resizable (corner handle) while not yet saved; read-only with
// attribution once applied historically. ─────────────────────────────────
function AnnotationMarker({
  a,
  editable,
  onChange,
  onRemove,
}: {
  a: Annotation;
  editable: boolean;
  onChange: (next: Annotation) => void;
  onRemove: () => void;
}) {
  const isText = a.kind === 'text';
  const who = a.byUsername ? `${a.byFullName || a.byUsername}${a.stepLabel ? ` (${a.stepLabel})` : ''}` : 'you (not yet saved)';
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  const startMove = useCallback(
    (e: React.MouseEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const parent = ref.current?.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const startPX = e.clientX;
      const startPY = e.clientY;
      const ox = a.x;
      const oy = a.y;
      const move = (ev: MouseEvent) => {
        const dx = ((ev.clientX - startPX) / rect.width) * 100;
        const dy = ((ev.clientY - startPY) / rect.height) * 100;
        onChange({
          ...a,
          x: Math.max(0, Math.min(100 - a.width, +(ox + dx).toFixed(1))),
          y: Math.max(0, Math.min(100 - a.height, +(oy + dy).toFixed(1))),
        });
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [a, editable, onChange],
  );

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const parent = ref.current?.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const startPX = e.clientX;
      const startPY = e.clientY;
      const ow = a.width;
      const oh = a.height;
      const minW = isText ? 10 : 2.5;
      const minH = isText ? 4 : 2;
      const move = (ev: MouseEvent) => {
        const dw = ((ev.clientX - startPX) / rect.width) * 100;
        const dh = ((ev.clientY - startPY) / rect.height) * 100;
        onChange({
          ...a,
          width: Math.max(minW, Math.min(100 - a.x, +(ow + dw).toFixed(1))),
          height: Math.max(minH, Math.min(100 - a.y, +(oh + dh).toFixed(1))),
        });
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [a, editable, isText, onChange],
  );

  return (
    <div
      ref={ref}
      title={isText ? `${a.text} — ${who}` : `${a.kind === 'tick' ? 'Tick' : 'Cross'} mark — ${who}`}
      onMouseDown={startMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="absolute z-[4] rounded"
      style={{
        left: `${a.x}%`,
        top: `${a.y}%`,
        width: `${a.width}%`,
        height: `${a.height}%`,
        display: 'flex',
        alignItems: isText ? 'flex-start' : 'center',
        justifyContent: isText ? 'flex-start' : 'center',
        background: 'transparent',
        border: editable && hover ? '1px dashed var(--color-line-strong)' : 'none',
        color: 'var(--color-ink)',
        fontWeight: isText ? 500 : 700,
        padding: isText ? '2px 4px' : 0,
        cursor: editable ? 'move' : 'default',
        pointerEvents: 'auto',
        lineHeight: 1.25,
      }}
    >
      {isText ? (
        <span className="whitespace-pre-wrap text-[10px] font-medium" style={{ color: '#4a3b10' }}>
          {a.text}
        </span>
      ) : (
        <span className="select-none" style={{ fontSize: '2.2vh' }}>
          {a.kind === 'tick' ? '\u2713' : '\u2717'}
        </span>
      )}

      {editable && (
        <>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove"
            className="absolute -top-2.5 -right-2.5 flex size-4 items-center justify-center rounded-full bg-danger text-[11px] leading-none text-white shadow"
          >
            ×
          </button>
          <div
            onMouseDown={startResize}
            title="Drag to resize"
            className="absolute -right-1.5 -bottom-1.5 size-3 rounded-sm border-[1.5px] border-white shadow"
            style={{ background: 'var(--color-ink)', cursor: 'nwse-resize' }}
          />
        </>
      )}
    </div>
  );
}
