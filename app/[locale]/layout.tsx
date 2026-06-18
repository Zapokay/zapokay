import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import '../globals.css';
import { getUserWithProfile } from '@/lib/auth';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

export const metadata: Metadata = {
  title: 'ZapOkay',
  description: 'Corporate Minute Book SaaS',
};

const locales = ['fr', 'en'];

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!locales.includes(locale)) notFound();
  const messages = await getMessages();

  const { user, profile } = await getUserWithProfile();
  let preferredTheme: 'light' | 'dark' | null = null;
  if (user) {
    const raw = profile?.preferred_theme;
    if (raw === 'light' || raw === 'dark') preferredTheme = raw;
  }

  return (
    <html lang={locale} data-theme="light" suppressHydrationWarning>
      <body>
        <ThemeProvider userPreferredTheme={preferredTheme}>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
