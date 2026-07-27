/**
 * TYPED MESSAGES — moves missing/mistyped i18n keys from a RENDER-time failure to a
 * `tsc` failure.
 *
 * WHY THIS EXISTS: `npm run build` provides essentially ZERO missing-message coverage
 * here. next-intl does no static analysis of key literals — a bad key surfaces only
 * when `t()` actually executes, and then it silently renders the key PATH to the user.
 * The build can only catch that if a STATICALLY prerendered route renders the call
 * during `next build`, and every localized route in this app is dynamic (ƒ); only `/`
 * and `/_not-found` are static (○). So nothing under /[locale]/** was ever protected.
 * That is how `auth.login.magicLinkSent` reached production copy.
 *
 * Augmenting the global `IntlMessages` interface makes next-intl type BOTH halves of a
 * lookup — the `useTranslations('ns')` namespace AND the `t('key')` literal — against
 * the real message tree, so a wrong namespace/key pair is a compile error on a gate we
 * already run every ship.
 *
 * SOURCE OF TRUTH: messages/fr.json. FR is `defaultLocale` in i18n/routing.ts and is
 * the locale the product is authored in. A key present in fr.json but absent from
 * en.json is therefore NOT caught here — that is locale PARITY, a separate check.
 *
 * NOT COVERED: keys built from runtime values (template literals like
 * `obligationNotice.${copyKey}.title` or `endReasons.${value}`). ~31 such call sites
 * exist; no type system reaches them and they remain verified by grep discipline. That
 * is a known limit of this approach, not a gap introduced by it.
 *
 * `resolveJsonModule` is already enabled in tsconfig.json, and `include: ["**\/*.ts"]`
 * picks this file up from the repo root.
 */
type Messages = typeof import('./messages/fr.json');

declare interface IntlMessages extends Messages {}
