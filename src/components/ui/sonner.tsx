import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

// Icon chips echo the same colored-chip language the sidebar nav uses
// (features/../sidebar.tsx's NAV_ICON_STYLE) — one consistent "colorful
// chip" identity across the app rather than toasts looking like a
// different, plainer component.
const ICON_STYLE: Record<string, { bg: string; fg: string }> = {
  success: { bg: '#dcfce7', fg: '#16a34a' },
  error: { bg: '#fee2e2', fg: '#dc2626' },
  warning: { bg: '#fef3c7', fg: '#d97706' },
  info: { bg: '#ede9fe', fg: '#7c3aed' },
};
function chip(type: keyof typeof ICON_STYLE, Icon: React.ComponentType<{ size?: number }>) {
  const s = ICON_STYLE[type];
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: s.bg, color: s.fg }}>
      <Icon size={15} />
    </span>
  );
}

// Mounted once at the app root (both the authenticated shell and the
// standalone external-signing page get their own instance — see main.tsx),
// same as the legacy <ToastHost/>. Capped at 5 visible, top-right, matches
// the legacy toast stack's position and cap.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      visibleToasts={5}
      icons={{
        success: chip('success', CheckCircle2),
        error: chip('error', XCircle),
        warning: chip('warning', AlertTriangle),
        info: chip('info', Info),
      }}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'font-sans! border-0! border-l-4! bg-paper-raised! text-ink! shadow-modal! rounded-xl! py-3.5! pl-3.5! pr-4! gap-3!',
          title: 'text-[13.5px]! font-semibold!',
          description: 'text-[12.5px]! text-slate!',
          icon: 'm-0!',
          success: 'border-l-success!',
          error: 'border-l-danger!',
          warning: 'border-l-warning!',
          info: 'border-l-violet!',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };