import { SignupForm } from '@/components/auth/SignupForm';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function SignupPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('auth.signup');
  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const otherLabel = locale === 'fr' ? 'EN' : 'FR';

  return (
    <main className="min-h-screen bg-ivory flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Subtle language toggle */}
        <div className="flex justify-end mb-4">
          <Link href={`/${otherLocale}/signup`} className="text-xs text-navy-400 hover:text-navy-700 transition-colors">
            {otherLabel}
          </Link>
        </div>

        <div className="flex justify-center mb-10">
          <ZapLogo size="lg" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-ivory-dark p-8">
          <h1 className="font-sora text-2xl font-semibold text-navy-900 mb-1">{t('title')}</h1>
          <p className="text-navy-400 text-sm mb-8">{t('subtitle')}</p>
          <SignupForm locale={locale} />
        </div>
      </div>
    </main>
  );
}
