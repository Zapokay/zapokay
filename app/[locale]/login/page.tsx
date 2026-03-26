import { LoginForm } from '@/components/auth/LoginForm';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { getTranslations } from 'next-intl/server';

export default async function LoginPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('auth.login');
  return (
    <main className="min-h-screen bg-ivory flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <ZapLogo size="lg" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-ivory-dark p-8">
          <h1 className="font-sora text-2xl font-semibold text-navy-900 mb-1">{t('title')}</h1>
          <p className="text-navy-400 text-sm mb-8">{t('subtitle')}</p>
          <LoginForm locale={locale} />
        </div>
      </div>
    </main>
  );
}
