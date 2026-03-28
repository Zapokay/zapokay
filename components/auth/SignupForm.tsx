'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Link from 'next/link';

interface SignupFormProps {
  locale: string;
}

export function SignupForm({ locale }: SignupFormProps) {
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
      <div className="text-center py-6">
        <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-sora font-medium text-navy-900">{t('verifyEmail')}</p>
        <p className="text-sm text-navy-400 mt-1">{email}</p>
        <Link
          href={`/${locale}/login`}
          className="inline-block mt-6 text-sm text-navy-400 hover:text-navy-700 transition-colors underline underline-offset-2"
        >
          {locale === 'fr' ? 'Retour à la connexion' : 'Back to sign in'}
        </Link>
      </div>
    );
  }

  return (
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
      <p className="text-xs text-navy-400 -mt-2">{t('passwordHint')}</p>
      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Button type="submit" loading={loading} className="w-full" size="lg" variant="secondary">
        {t('submit')}
      </Button>
      <p className="text-center text-sm text-navy-400 mt-4">
        {t('hasAccount')}{' '}
        <Link href={`/${locale}/login`} className="text-navy-700 font-medium hover:text-navy-900 underline underline-offset-2">
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
