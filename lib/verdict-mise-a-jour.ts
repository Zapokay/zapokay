/**
 * LE VERDICT D'UN UPDATE — a-t-il VRAIMENT eu lieu ?
 *
 * ⛔ UNE ABSENCE D'ERREUR N'EST PAS UN SUCCÈS. Un `.update(…).eq('id', …)` que
 * la RLS filtre, ou qui vise une ligne disparue, ne rend AUCUNE erreur : supabase-js
 * retourne `{ error: null }` et zéro ligne touchée. Une modale qui ne lit que
 * `error` affiche alors un succès sur un enregistrement qui n'a pas eu lieu.
 *
 * Mesuré le 2026-09-11 : EditPersonModal a exactement ce défaut — il ne lit que
 * `updateErr` et ne demande pas les lignes touchées. Il est en file, et ce
 * fichier est la pièce qui le fermera le jour venu ; l'écran de correction
 * d'entité est son premier appelant.
 *
 * ★ LE CONTRAT : l'appelant fait suivre son UPDATE d'un `.select('id')`. Il
 * reçoit alors les lignes RÉELLEMENT modifiées, et ce verdict les compte.
 */

export type VerdictMiseAJour =
  /** Exactement une ligne modifiée — la seule issue qui vaut un succès. */
  | 'ok'
  /** Erreur rendue : refus de Postgres, OU panne réseau (sans throwOnError, rendue et non levée). */
  | 'refus'
  /**
   * ⛔ Aucune erreur, et aucune ligne : RLS, ligne supprimée entre-temps, ou
   * identifiant faux. Le cas que la seule lecture de `error` laissait passer.
   */
  | 'aucune-ligne'
  /**
   * Plus d'une ligne pour un UPDATE ciblé sur un identifiant unique : ne
   * devrait pas arriver. Traité comme un échec plutôt que comme un succès
   * plus grand que prévu.
   */
  | 'trop-de-lignes';

export function verdictMiseAJour(
  data: readonly unknown[] | null,
  error: { message: string } | null,
): VerdictMiseAJour {
  if (error) return 'refus';
  const n = data?.length ?? 0;
  if (n === 0) return 'aucune-ligne';
  if (n > 1) return 'trop-de-lignes';
  return 'ok';
}
