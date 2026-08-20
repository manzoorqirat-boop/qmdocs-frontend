import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface IdleSessionWarningProps {
  open: boolean;
  secondsLeft: number;
  onStaySignedIn: () => void;
  onSignOut: () => void;
}

export function IdleSessionWarning({ open, secondsLeft, onStaySignedIn, onSignOut }: IdleSessionWarningProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="text-center">
        <AlertDialogHeader className="items-center">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-danger uppercase">
            <AlertTriangle size={13} /> Session expiring
          </div>
          <AlertDialogTitle>You will be signed out in {secondsLeft}s</AlertDialogTitle>
          <AlertDialogDescription>
            No activity has been detected. For security, inactive sessions are signed out
            automatically. Any unsaved work will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="justify-center sm:justify-center">
          <AlertDialogCancel onClick={onSignOut}>Sign out now</AlertDialogCancel>
          <AlertDialogAction onClick={onStaySignedIn} autoFocus>
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
