import { SignupForm } from '@/components/auth/SignupForm';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function SignupPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('auth.signup');
  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const otherLabel = locale === 'fr' ? 'EN' : 'FR';

  return (
    <main className="min-h-screen flex">
      {/* Left panel — hidden on mobile, 45% on desktop */}
      <div className="hidden lg:flex lg:w-[45%] flex-col bg-[var(--auth-left-bg)] p-12">
        <div style={{ '--wordmark-color': 'var(--auth-left-heading)' } as React.CSSProperties}>
          <ZapLogo size="lg" />
        </div>
        <div className="flex-1 flex flex-col justify-center max-w-sm">
          <h2 className="font-sora text-3xl font-bold text-[var(--auth-left-heading)] leading-snug mb-10">
            {t('leftTagline')}
          </h2>
          <ul className="space-y-5">
            {(['leftFeature1', 'leftFeature2', 'leftFeature3'] as const).map(key => (
              <li key={key} className="flex items-start gap-3 text-[var(--auth-left-text)] text-sm">
                <svg className="w-5 h-5 text-[var(--amber-400)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel — full width on mobile, 55% on desktop */}
      <div className="flex-1 min-h-screen flex flex-col bg-[var(--page-bg)]">
        <div className="flex justify-end p-6">
          <Link
            href={`/${otherLocale}/signup`}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors"
          >
            {otherLabel}
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="w-full max-w-md">
            <h1 className="font-sora text-2xl font-semibold text-[var(--text-heading)] mb-1">{t('title')}</h1>
            <p className="text-sm text-[var(--text-muted)] mb-8">{t('subtitle')}</p>
            <SignupForm locale={locale} />
          </div>
        </div>
      </div>
    </main>
  );
}
