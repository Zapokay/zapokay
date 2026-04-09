'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Link from 'next/link';

interface SignupFormProps {
  locale: string;
  title?: string;
  subtitle?: string;
}

export function SignupForm({ locale, title, subtitle }: SignupFormProps) {
  const t = useTranslations('auth.signup');
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?locale=${locale}`,
      },
    });

    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center py-8">
        <svg style={{ color: 'var(--amber-400)' }} className="w-8 h-8 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="font-sora font-semibold text-[var(--text-heading)] text-lg mb-1">
          {locale === 'fr' ? 'Vérifiez votre courriel' : 'Check your email'}
        </p>
        <p className="text-sm text-[var(--text-muted)]">{t('verifyEmail')}</p>
        <p className="text-sm font-medium text-[var(--text-body)] mt-1">{email}</p>
        <Link
          href={`/${locale}/login`}
          className="inline-block mt-6 text-sm text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors underline underline-offset-2"
        >
          {locale === 'fr' ? 'Retour à la connexion' : 'Back to sign in'}
        </Link>
      </div>
    );
  }

  return (
    <>
      {title && <h1 className="font-sora text-2xl font-semibold text-[var(--text-heading)] mb-1">{title}</h1>}
      {subtitle && <p className="text-sm text-[var(--text-muted)] mb-8">{subtitle}</p>}
    <form onSubmit={handleSignup} className="space-y-4">
      <Input
        id="fullName"
        label={t('fullName')}
        type="text"
        value={fullName}
        onChange={e => setFullName(e.target.value)}
        placeholder="Marie Tremblay"
        required
        autoComplete="name"
      />
      <Input
        id="email"
        label={t('email')}
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        autoComplete="email"
      />
      <Input
        id="password"
        label={t('password')}
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
      />
      <p className="text-xs text-[var(--text-muted)] -mt-2">{t('passwordHint')}</p>
      {error && <p className="text-sm text-[var(--error-text)] bg-[var(--error-bg)] rounded-lg px-3 py-2">{error}</p>}
      <Button type="submit" loading={loading} className="w-full" size="lg" variant="secondary">
        {t('submit')}
      </Button>
      <p className="text-center text-sm text-[var(--text-muted)] mt-4">
        {t('hasAccount')}{' '}
        <Link href={`/${locale}/login`} className="text-[var(--text-body)] font-medium hover:text-[var(--text-heading)] underline underline-offset-2">
          {t('signIn')}
        </Link>
      </p>
    </form>
    </>
  );
}
