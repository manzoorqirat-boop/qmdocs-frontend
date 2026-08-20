// Reusable signature input — TYPED-ONLY. The Draw and Saved-Image signature
// modes were removed from all NEW-document input paths (client request):
// every new signature is a typed signature using the signer's registered
// account name (non-editable, so it stays an attributable Part 11
// identity). Historical envelopes signed with 'drawn' or 'image' still
// render correctly elsewhere — only the ability to CREATE drawn/image
// signatures is gone. The value is always just `signerName`; the prop
// stays because callers pass onChange and expect it invoked.
import { useEffect } from 'react';

interface SignaturePadProps {
  onChange: (value: string) => void;
  signerName?: string;
}

export function SignaturePad({ onChange, signerName = '' }: SignaturePadProps) {
  useEffect(() => {
    onChange(signerName);
  }, [signerName, onChange]);

  return (
    <div>
      <div
        className="mb-2.5 flex h-9 cursor-not-allowed items-center rounded-md border border-line-strong bg-paper px-3 text-sm text-slate"
        aria-readonly="true"
        title="Your signature uses your registered account name and cannot be changed"
      >
        {signerName || '—'}
      </div>
      <div className="mb-2 text-[11px] text-slate">
        Your typed signature uses your registered name and cannot be edited.
      </div>
      <div className="flex h-[70px] items-center justify-center overflow-hidden rounded-md border border-dashed border-line-strong bg-white">
        {signerName ? (
          <span className="text-[30px] text-ink" style={{ fontFamily: '"Brush Script MT", "Lucida Handwriting", cursive' }}>
            {signerName}
          </span>
        ) : (
          <span className="text-[12px] text-slate">Preview will appear here</span>
        )}
      </div>
    </div>
  );
}
