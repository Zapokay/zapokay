/**
 * L'ÉCHÉANCE D'UNE FORMALITÉ — un seul calcul, pour Complétude ET le tableau de bord (lot V7b, Dom).
 *
 * ★ « Échue » = la date limite est STRICTEMENT avant la date du jour À MONTRÉAL ; le jour même
 *   est encore « à venir ». Comparaison de chaînes ISO AAAA-MM-JJ, jamais de Date en UTC.
 * ⛔ Pas de toISOString : il donne la date UTC, qui passe au lendemain dès 20 h (EDT) ou 19 h (EST)
 *   à Montréal — une formalité deviendrait « échue » la veille au soir.
 */

// 'inconnue' : sans date limite, on n'affirme rien (Max) — le marqueur garde l'apparence d'aujourd'hui.
export type Echeance = 'echue' | 'a-venir' | 'inconnue';

/** La date du jour à Montréal, en AAAA-MM-JJ (en-CA formate déjà ainsi). */
export function aujourdhuiMontreal(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(maintenant);
}

/** `dateLimite` en AAAA-MM-JJ. Sans date : 'inconnue', jamais « à venir ». */
export function echeanceDe(dateLimite: string | null | undefined, maintenant: Date = new Date()): Echeance {
  if (!dateLimite) return 'inconnue';
  return dateLimite.slice(0, 10) < aujourdhuiMontreal(maintenant) ? 'echue' : 'a-venir';
}
