'use client';

import { useTranslations } from 'next-intl';

/**
 * UNE SECTION N'A PAS PU CHARGER — UNE SEULE FAÇON DE LE DIRE.
 *
 * ⚖️ DÉCISION DE DOM DU 2026-09-18 (㊴), construite le 2026-09-21 : un état
 * d'erreur PAR SECTION. Sa formulation tient en une phrase, et c'est elle qui
 * commande tout le reste : UNE SECTION QUI ÉCHOUE N'EST PAS UNE PAGE QUI
 * ÉCHOUE. Les autres sections s'affichent, avec leurs données, normalement.
 *
 * ⛔ CE COMPOSANT NE DESSINE PRESQUE RIEN DE NEUF, ET C'EST VOULU. Il EXTRAIT
 * le traitement que `BinderView.tsx` portait déjà — le seul du dépôt qui ait
 * la bonne sémantique, « cette section n'a pas chargé, les autres oui » :
 *
 *     rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]
 *     px-5 py-4 text-sm text-[var(--text-muted)]     + role="alert"
 *
 * ★ CE QUI LUI MANQUAIT EST LA REPRISE. Son texte disait « Rechargez la page
 * pour réessayer » : une consigne à l'utilisateur au lieu d'un geste. Le
 * bouton la remplace, et c'est le seul ajout.
 *
 * ⛔ LE TEXTE PASSE PAR LE CATALOGUE, ET LE CONTRE-EXEMPLE EST DANS LE DÉPÔT.
 * `GapAnalysisPanel.tsx:287` et `DocumentModal.tsx:353,375` écrivent
 * `fr ? 'Réessayer' : 'Retry'` en dur — le seul endroit qui porte un bouton de
 * reprise est aussi le seul qui n'est pas traduit, en violation de la règle §1
 * du CLAUDE.md. Ne pas le recopier ; `common.retry` existe désormais pour eux.
 *
 * ⚪ LE LIBELLÉ NOMME LA SECTION PAR INTERPOLATION, pas par neuf clés :
 * `common.sectionUnavailable` prend `{section}`. Une section de plus n'ajoute
 * pas une phrase, elle ajoute un nom.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUE CE COMPOSANT NE COUVRE PAS — RECENSÉ, PAS OUBLIÉ
 * ═══════════════════════════════════════════════════════════════════════
 * Recensement du 2026-09-21, tout le dépôt. QUATRE traitements d'échec
 * existaient ; celui-ci en extrait UN et laisse les trois autres :
 *
 *   · L'ALERTE ROUGE BLOQUANTE — `BinderExportModal.tsx:366,447`, palette
 *     `--error-*`. Elle EMPÊCHE l'export ; ce n'est pas le même objet qu'une
 *     section qui manque à côté d'autres qui s'affichent.
 *   · LA PHRASE NUE — `CompletenessPage.tsx:827`, un `<p>` sans conteneur et
 *     ⚠️ SANS `role="alert"` : rien n'est annoncé aux lecteurs d'écran. C'est
 *     le candidat le plus évident à la prochaine consolidation.
 *   · LE BOUTON RÉESSAYER EN DUR — `GapAnalysisPanel`, `DocumentModal` :
 *     styles en ligne et libellé non traduit. Ils devraient consommer
 *     `common.retry` ; c'est un lot à part parce qu'il touche l'IA et les
 *     documents, pas les registres.
 */
export function SectionEnEchec({
  section,
  onRetry,
}: {
  /** Le nom de la section, tel que son propre titre l'affiche. Une seule
   *  source pour les deux : le titre et l'avis disent le même mot. */
  section: string;
  onRetry: () => void;
}) {
  const t = useTranslations('common');

  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-4 text-sm text-[var(--text-muted)]"
    >
      <p>{t('sectionUnavailable', { section })}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 text-sm font-medium underline text-[var(--text-muted)]"
      >
        {t('retry')}
      </button>
    </div>
  );
}
