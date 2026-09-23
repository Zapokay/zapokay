'use client';

/**
 * LA PAGE QUI RESTE QUAND TOUT LE RESTE EST TOMBÉ.
 *
 * ⚖️ EXCEPTION À LA RÈGLE §1 DU CLAUDE.MD, APPROUVÉE PAR DOM LE 2026-09-22, ET
 * VOICI SA RAISON : §1 existe pour que le texte soit TRADUISIBLE et
 * CENTRALISÉ. Ici, le centraliser détruirait la seule page qui doit survivre
 * quand le mécanisme central EST la panne. On sert l'intention de la règle en
 * brisant sa lettre.
 *
 * ⛔ CE FICHIER N'IMPORTE RIEN, ET C'EST SA SEULE PROTECTION. Pas de
 * `useTranslations` — il exige un `NextIntlClientProvider` qui vit dans
 * `app/[locale]/layout.tsx`, c'est-à-dire dans le layout dont l'échec fait
 * apparaître cette page. Lui donner le catalogue, ce serait lui donner pour
 * dépendance la chose même qui est cassée : il rendrait une clé brute ou du
 * vide, ce qui est pire qu'un mot dans la mauvaise langue.
 * ⛔ NE PAS « nettoyer » en important quoi que ce soit. Ni le catalogue, ni
 * `routing`, ni un composant d'interface : tout import est une chose de plus
 * qui peut être en panne au moment où celle-ci s'affiche.
 */

/**
 * LES QUATRE CHAÎNES, DANS LES DEUX LANGUES.
 *
 * ★ EXPORTÉES, PARCE QUE L'EXCEPTION A BESOIN DE SA GARDE. Ce fichier vient de
 * sortir du catalogue, et le catalogue était ce qui garantissait qu'une chaîne
 * existe dans les deux langues. `check:inscription` vérifie donc ici même que
 * les deux jeux ont les MÊMES clés et qu'aucune n'est vide — sans quoi cette
 * exception deviendrait l'endroit où les chaînes non traduites vont se ranger.
 */
export const TEXTES = {
  fr: {
    titre: 'Une erreur est survenue',
    repli: 'Une erreur inattendue est survenue.',
    bouton: 'Réessayer',
  },
  en: {
    titre: 'Something went wrong',
    repli: 'An unexpected error occurred.',
    bouton: 'Try again',
  },
} as const;

/**
 * LA LANGUE VIENT DU CHEMIN, ET DE RIEN D'AUTRE.
 *
 * ⛔ PAS DE `document.documentElement.lang` : ce serait CIRCULAIRE. Cette page
 * REMPLACE le `<html>` entier — on lirait soit l'ancien si React n'a pas
 * commité, soit celui qu'on est en train d'écrire. ★ Une résolution qui dépend
 * du moment du commit marche en développement et échoue une fois sur dix en
 * production.
 *
 * ⚪ ET CE N'EST PAS UNE INVENTION : `bcd67c1` a déjà tranché la même question
 * pour la redirection d'authentification — la langue vient de l'URL, parce que
 * l'URL survit à une session expirée, à un lien consommé et à un cookie
 * absent. Même raisonnement, même conclusion.
 *
 * ⛔ ET VOICI OÙ ÇA CASSERA : si une TROISIÈME langue arrive, cette ligne doit
 * être revue — elle ne peut pas lire `routing.locales` sans reprendre la
 * dépendance qu'on évite ici. Deux langues, deux littéraux, et une note.
 */
export function langueDuChemin(chemin: string): 'fr' | 'en' {
  return chemin.split('/')[1] === 'en' ? 'en' : 'fr';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /* ⚪ `window` peut manquer — cette page est aussi rendue au serveur. Le repli
     est le français, langue par défaut du produit. */
  const langue =
    typeof window === 'undefined' ? 'fr' : langueDuChemin(window.location.pathname);
  const t = TEXTES[langue];

  return (
    <html lang={langue}>
      <body style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', background: '#0f172a', color: '#f8fafc' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {t.titre}
          </h2>
          {/* ⛔ `||`, ET PAS `??`. `error.message` d'une vraie `Error` est
              TOUJOURS une chaîne — vide, mais présente. Avec `??`, le repli
              n'aurait eu AUCUN chemin : une chaîne traduite, gardée, comptée
              par la sonde, et que personne n'aurait jamais lue (§366). Avec
              `||`, un message vide rend la phrase de repli. */}
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            {error.message || t.repli}
          </p>
          <button
            onClick={reset}
            style={{ background: '#f59e0b', color: '#1e1b4b', fontWeight: 600, padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            {t.bouton}
          </button>
        </div>
      </body>
    </html>
  );
}
