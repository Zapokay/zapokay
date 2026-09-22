'use client'

import type { ReactNode } from 'react'

interface ActivityRowProps {
  time: string
  title: string
  /** ⛔ TOUJOURS FOURNI. L'absence d'auteur est un TEXTE, jamais une absence. */
  author: string
  /**
   * LA DATE DE L'ACTE — lot AC-2. TOUJOURS FOURNIE, comme l'auteur : une ligne
   * sans elle serait indiscernable d'une ligne dont on a oublié de la dire.
   * ⚪ Traitement minimal, pour la même raison que l'auteur : sa forme
   * appartient au Visual Update avec Aria.
   */
  acte: ReactNode
}

export default function ActivityRow({ time, title, author, acte }: ActivityRowProps) {
  return (
    <div className="flex items-start gap-4 py-2">
      <span className="text-sm text-[var(--text-muted)] font-mono shrink-0 w-12">{time}</span>
      <span className="text-sm text-[var(--text-body)]">
        {title}
        {/* ⚪ TRAITEMENT MINIMAL ET DÉLIBÉRÉ : c'est une donnée de REGISTRE, pas
            une décoration. Sa forme appartient au Visual Update avec Aria ; la
            styler davantage maintenant préempterait cette décision. */}
        <span className="text-[var(--text-muted)]"> · {author}</span>
        <span className="block text-xs text-[var(--text-muted)]">{acte}</span>
      </span>
    </div>
  )
}
