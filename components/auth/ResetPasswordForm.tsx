'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Link from 'next/link';

interface ResetPasswordFormProps {
  locale: string;
}

export function ResetPasswordForm({ locale }: ResetPasswordFormProps) {
  const t = useTranslations('auth.resetPassword');
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) { setError(t('passwordMin')); return; }
    if (password !== confirm) { setError(t('passwordMismatch')); return; }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) { setError(error.message); return; }

    setDone(true);
    setTimeout(() => router.push(`/${locale}/login`), 3000);
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 bg-[var(--card-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[var(--amber-400)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-sora font-medium text-[var(--text-heading)] mb-2">
          {t('successMessage')}
        </p>
        <Link
          href={`/${locale}/login`}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] underline underline-offset-2 transition-colors"
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="password"
        label={t('newPassword')}
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        autoComplete="new-password"
      />
      <Input
        id="confirm"
        label={t('confirmPassword')}
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        required
        autoComplete="new-password"
      />
      {error && (
        <p className="text-sm text-[var(--error-text)] bg-[var(--error-bg)] rounded-lg px-3 py-2">{error}</p>
      )}
      <Button type="submit" loading={loading} className="w-full" size="lg" variant="secondary">
        {t('submit')}
      </Button>
      <p className="text-center text-sm text-[var(--text-muted)] mt-2">
        <Link
          href={`/${locale}/login`}
          className="text-[var(--text-body)] font-medium hover:text-[var(--text-heading)] underline underline-offset-2"
        >
          {t('backToLogin')}
        </Link>
      </p>
    </form>
  );
}
