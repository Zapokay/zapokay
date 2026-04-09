'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Link from 'next/link';

interface LoginFormProps {
  locale: string;
}

export function LoginForm({ locale }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(`/${locale}/dashboard`);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?locale=${locale}` },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setMagicSent(true);
  }

  if (magicSent) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 bg-[var(--card-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[var(--amber-400)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="font-sora font-medium text-[var(--text-heading)] mb-1">{t('magicLinkSent')}</p>
        <p className="text-sm text-[var(--text-muted)]">{email}</p>
      </div>
    );
  }

  return (
    <div>
      {mode === 'password' ? (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
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
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-[var(--error-text)] bg-[var(--error-bg)] rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" loading={loading} className="w-full" size="lg" variant="secondary">
            {t('submit')}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleMagicLink} className="space-y-4">
          <Input
            id="email-magic"
            label={t('email')}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          {error && <p className="text-sm text-[var(--error-text)] bg-[var(--error-bg)] rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" loading={loading} className="w-full" size="lg" variant="secondary">
            {t('magicLink')}
          </Button>
        </form>
      )}

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--card-border)]" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[var(--page-bg)] px-3 text-xs text-[var(--text-muted)]">{t('orDivider')}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
        className="w-full px-5 py-2.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] bg-transparent hover:bg-[var(--card-bg)] transition-colors text-sm font-medium"
      >
        {mode === 'password' ? t('magicLink') : t('submit')}
      </button>

      <p className="text-center text-sm text-[var(--text-muted)] mt-6">
        {t('noAccount')}{' '}
        <Link href={`/${locale}/signup`} className="text-[var(--text-body)] font-medium hover:text-[var(--text-heading)] underline underline-offset-2">
          {t('signUp')}
        </Link>
      </p>
    </div>
  );
}
