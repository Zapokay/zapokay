import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/**
 * ⚠️ UNE CLÉ A ÉTÉ RETIRÉE D'ICI — LOT ALLÈGE, 2026-09-23. Elle disait :
 *
 *     outputFileTracingIncludes: { '/api/**': ['./node_modules/@sparticuz/chromium/**'] }
 *
 * ⛔ POSÉE À LA RACINE, où Next 14.2 ne la reconnaît pas : chaque build le
 * disait — « Unrecognized key(s) in object: 'outputFileTracingIncludes' » — et
 * personne ne l'entendait. Elle n'a donc jamais rien fait. ★ ET C'EST UNE
 * CHANCE : reconnue, elle aurait FORCÉ le navigateur des PDF dans les
 * trente-neuf routes d'API. Elle demandait exactement le contraire du but.
 *
 * ⛔ NE PAS LA REMETTRE, ni sous `experimental`. Ce qui met le navigateur dans
 * une lambda n'est pas le traçage : c'est le REGROUPEMENT des routes. La
 * séparation se décide route par route — voir `maxDuration` dans les quatre
 * routes qui fabriquent un PDF, et la raison écrite là-bas.
 * ⚪ MESURÉ AVANT D'ÉCRIRE : `outputFileTracingExcludes` ne change RIEN au
 * poids (78,6 Mo avant comme après), parce que la lambda emporte l'UNION des
 * traces de son groupe. Et l'excluder partout en le ré-incluant pour les
 * quatre l'ôte AUSSI des quatre : les exclusions battent les inclusions.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  },
}

export default withNextIntl(nextConfig)
