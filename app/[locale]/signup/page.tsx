import { SignupForm } from '@/components/auth/SignupForm';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function SignupPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('auth.signup');
  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const otherLabel = locale === 'fr' ? 'EN' : 'FR';
  const fr = locale === 'fr';

  return (
    <main className="min-h-screen flex">
      {/* Left panel — hidden on mobile, 45% on desktop */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-[var(--auth-left-bg)] p-12"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px)',
        }}
      >
        <span style={{
          fontFamily: 'Sora, sans-serif',
          fontSize: '28px',
          fontWeight: 900,
          letterSpacing: '-0.025em',
          lineHeight: 1,
        }}>
          <span style={{ color: '#F5B91E' }}>Zap</span>
          <span style={{ color: 'white' }}>Okay</span>
        </span>

        <div className="max-w-sm">
          <h2
            className="font-sora font-extrabold text-3xl leading-tight text-[var(--auth-left-heading)] mb-4"
          >
            {fr ? (
              <>Zap la paperasse.{' '}<span style={{ color: 'var(--amber-400)' }}>Faites avancer</span>{' '}votre entreprise.</>
            ) : (
              <>Zap the paperwork.{' '}<span style={{ color: 'var(--amber-400)' }}>Move your business</span>{' '}forward.</>
            )}
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.70)' }} className="mb-10">
            {t('leftSubtagline')}
          </p>
          <ul className="space-y-5">
            {(['leftFeature1', 'leftFeature2', 'leftFeature3'] as const).map(key => (
              <li key={key} className="flex items-start gap-3 text-[var(--auth-left-text)] text-sm">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--amber-400)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,.40)' }}>
          © 2026 ZapOkay inc. · Fait au Québec ⚜ · Confidentiel &amp; sécurisé
        </p>
      </div>

      {/* Right panel — full width on mobile, 55% on desktop */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen px-8 py-12 bg-[var(--page-bg)] relative">
        <Link
          href={`/${otherLocale}/signup`}
          className="absolute top-6 right-6 text-xs text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors"
        >
          {otherLabel}
        </Link>
        <div className="w-full max-w-md">
          <SignupForm locale={locale} title={t('title')} subtitle={t('subtitle')} />
        </div>
      </div>
    </main>
  );
}
