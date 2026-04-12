import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  },
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/@sparticuz/chromium/**'],
  },
}

export default withNextIntl(nextConfig)
