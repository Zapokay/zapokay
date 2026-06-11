'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';

const LOCALES = ['fr', 'en'] as const;

/**
 * Shared locale toggle (#146). Renders an FR/EN segmented pair with the active
 * locale as a filled chip — the active locale must be unambiguous in a static
 * screenshot (the WA #15 gate-legibility requirement that motivates this ticket).
 *
 * Two-Layer Language Model (CLAUDE.md §3): this changes the UI/URL locale ONLY.
 * It MUST NOT read or write users.preferred_language (the document-generation
 * language) — that changes only via Settings. The sole side-effect is the
 * locale-URL navigation, using the same leading-segment rewrite every surface
 * used before convergence.
 *
 * Self-derives locale + pathname so it drops into server components (auth pages)
 * and client components alike with zero props. Labels "FR"/"EN" are invariant
 * (never translated).
 */
export default function LanguageToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <div className="lang-toggle" role="group" aria-label="Language / Langue">
      {LOCALES.map((lang) => {
        const active = lang === locale;
        return (
          <button
            key={lang}
            type="button"
            aria-pressed={active}
            className={
              active ? 'lang-toggle__chip lang-toggle__chip--active' : 'lang-toggle__chip'
            }
            onClick={() => {
              if (active) return;
              const next = pathname.replace(`/${locale}/`, `/${lang}/`);
              router.replace(next);
            }}
          >
            {lang.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
