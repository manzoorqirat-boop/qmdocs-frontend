// Thin wrapper around sonner that keeps the exact call-site API the legacy
// app used everywhere (`toast.success/error/warn/info(message)`), so every
// ported page can import { toast } and just work. Errors linger longer than
// other kinds by default — people need to actually read them, not just
// notice them (same rule the legacy Toast.jsx used).
import { toast as sonnerToast } from 'sonner';

const DURATIONS = {
  success: 4200,
  error: 6500,
  warn: 4200,
  info: 4200,
} as const;

export const toast = {
  success(message: string, duration?: number) {
    return sonnerToast.success(message, { duration: duration ?? DURATIONS.success });
  },
  error(message: string, duration?: number) {
    return sonnerToast.error(message, { duration: duration ?? DURATIONS.error });
  },
  warn(message: string, duration?: number) {
    return sonnerToast.warning(message, { duration: duration ?? DURATIONS.warn });
  },
  info(message: string, duration?: number) {
    return sonnerToast.message(message, { duration: duration ?? DURATIONS.info });
  },
};
