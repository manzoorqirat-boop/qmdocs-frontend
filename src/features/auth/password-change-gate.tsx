import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { useChangePasswordMutation } from '@/features/auth/hooks';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LoginResponse } from '@/types/api';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function PasswordChangeGate() {
  const { user, refreshSession, logout } = useSession();
  const mutation = useChangePasswordMutation();
  const [message, setMessage] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setMessage('');
    if (values.newPassword !== values.confirmPassword) {
      setMessage('New password and confirmation do not match.');
      return;
    }
    try {
      const data = await mutation.mutateAsync({
        username: user!.username,
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      refreshSession(data as LoginResponse);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not change password.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-md p-7">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-seal uppercase">
              <KeyRound size={13} /> Password update required
            </div>
            <h1 className="mb-1.5 text-xl font-semibold text-ink">Change your password to continue</h1>
            <p className="text-[13px] leading-relaxed text-slate">
              Your account is marked for a mandatory password change. Once you set a new password,
              you'll stay signed in with a fresh session.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoFocus
              {...register('currentPassword', { required: true })}
              aria-invalid={!!errors.currentPassword}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              {...register('newPassword', { required: true })}
              aria-invalid={!!errors.newPassword}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              {...register('confirmPassword', { required: true })}
              aria-invalid={!!errors.confirmPassword}
            />
          </div>

          <p className="text-[12px] leading-relaxed text-slate">
            Passwords must meet the active security policy. If the current password was
            system-seeded, enter that value in the first field.
          </p>

          {message && (
            <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {message}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={() => logout()} disabled={mutation.isPending}>
              Sign out
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
