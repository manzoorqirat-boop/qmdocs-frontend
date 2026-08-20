import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Mounted once at the app root (both the authenticated shell and the
// standalone external-signing page get their own instance — see main.tsx),
// same as the legacy <ToastHost/>. Capped at 5 visible, top-right, matches
// the legacy toast stack's position and cap.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      visibleToasts={5}
      toastOptions={{
        classNames: {
          toast:
            'font-sans! border! border-line! bg-paper-raised! text-ink! shadow-popover! rounded-md!',
          title: 'text-[13px]! font-medium!',
          description: 'text-slate!',
          success: 'data-[type=success]:border-success/30!',
          error: 'data-[type=error]:border-danger/30!',
          warning: 'data-[type=warning]:border-warning/30!',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
