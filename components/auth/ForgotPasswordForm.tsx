'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Link from 'next/link';

interface ForgotPasswordFormProps {
  locale: string;
}

export function ForgotPasswordForm({ locale }: ForgotPasswordFormProps) {
  const t = useTranslations('auth.forgotPassword');
  const tLogin = useTranslations('auth.login');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/${locale}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 bg-[var(--card-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[var(--amber-400)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="font-sora font-medium text-[var(--text-heading)] mb-2">
          {t('successMessage', { email })}
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
        id="email"
        label={tLogin('email')}
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        autoComplete="email"
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
