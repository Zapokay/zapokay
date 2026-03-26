import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  pathnames: {
    '/': '/',
    '/login': '/login',
    '/signup': '/signup',
    '/onboarding': '/onboarding',
    '/dashboard': '/dashboard'
  }
});
