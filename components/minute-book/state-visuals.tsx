'use client';

/**
 * LES MARQUES D'ÉTAT DESSINÉES UNE FOIS — lot V4, 2026-09-25.
 *
 * ★ StateBadge : le dessin de Complétude, tel qu'il est (12 px, graisse 500, casse
 * normale, fond pâle) — le MÊME que sur Administrateurs, Dirigeants et Actionnaires.
 * Documents s'y aligne ; ces pages-là n'ont rien à changer.
 * ★ MissingMarker : « Manquant » = cercle POINTILLÉ neutre (décision de Dom), partout où
 * l'état a un marqueur — lignes de Complétude et ligne de total. Jeton gris existant.
 */

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { VaultDocType } from '@/lib/requirement-doctype';

/**
 * ★ La boîte d'identité : le MOT du type (documents.types.*, les mots du filtre de la
 * page), puis — seulement si fourni — le filet et le code de langue en texte simple.
 * Documents passe la langue ; Complétude non (C4, phase 2).
 */
export function IdentityBox({ type, languageCode }: { type: VaultDocType; languageCode?: string }) {
  const tDocs = useTranslations('documents');
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-[7px] rounded-md border border-[var(--card-border)] px-2 py-px text-[11.5px] font-medium text-[var(--text-body)]">
      {tDocs(`types.${type}`)}
      {languageCode && (
        <>
          <span aria-hidden="true" className="inline-block h-[11px] w-px bg-[var(--card-border)]" />
          <span className="text-[10px] font-bold tracking-[.07em] text-[var(--text-muted)]">{languageCode}</span>
        </>
      )}
    </span>
  );
}

/** Les codes que LanguageBadge affichait, repris tels quels (repli sur EN, comme lui) — Documents et Livre. */
const CODE_LANGUE: Record<string, string> = { fr: 'FR', en: 'EN', bilingual: 'Bilingue' };
export function codeDeLangue(language: string | null | undefined): string {
  return CODE_LANGUE[language ?? ''] ?? 'EN';
}

export function StateBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--warning-text)] whitespace-nowrap">
      {children}
    </span>
  );
}

export function MissingMarker({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`flex-shrink-0 text-[var(--text-muted)] ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  );
}
