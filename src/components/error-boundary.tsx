import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  label?: string;
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Catches render errors in its child tree and shows a readable message
// instead of letting the whole UI collapse. Wraps the envelope wizard
// steps so a crash in PdfSignaturePlacer or SignaturePad surfaces an error
// message INSIDE the dialog, rather than the dialog silently collapsing
// and showing the page behind it.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label || '', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || String(this.state.error || 'Unknown error');
      const stack = this.state.error?.stack || '';
      return (
        <div className="rounded-md border border-danger/30 bg-danger-soft p-4 text-danger">
          <div className="mb-1.5 flex items-center gap-1.5 text-[14px] font-bold">
            <AlertTriangle size={16} /> Something went wrong{this.props.label ? ` — ${this.props.label}` : ''}
          </div>
          <div className="mb-2.5 text-[13px] text-ink">{msg}</div>
          {stack && (
            <details className="text-[11px] text-ink-soft">
              <summary className="mb-1 cursor-pointer">Technical details</summary>
              <pre className="max-h-[200px] overflow-auto rounded bg-paper p-2 whitespace-pre-wrap break-words">{stack}</pre>
            </details>
          )}
          <button
            onClick={this.reset}
            className="mt-2.5 rounded-md border border-danger px-3 py-1.5 text-[13px] text-danger"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
