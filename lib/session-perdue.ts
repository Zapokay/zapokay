/**
 * LA SESSION EST TOMBÉE — UNE SEULE DÉCLARATION, ET UNE SEULE RAISON ÉCRITE.
 *
 * ⚖️ DÉCISION DE DOM DU 2026-09-18, construite le 2026-09-21 : ㊵ « redirection
 * si la session tombe ». Trois pages portaient `if (!user) return`, c'est-à-dire
 * un écran vide et un chargement éternel — la session était perdue et rien ne le
 * disait.
 *
 * ★★ ET VOICI LE LIEN AVEC LE LOT R, QUI EST LA VRAIE RAISON D'ÊTRE DE CE
 *   FICHIER — SANS LUI, PERSONNE NE LE RETROUVERA :
 *
 *   Depuis `fae7de0`, le rendu serveur vérifie le jeton LOCALEMENT
 *   (`getClaims()` dans `lib/auth.ts`). Une vérification locale ne sait pas
 *   qu'une session a été RÉVOQUÉE : le layout rend donc la coquille même pour
 *   un accès révoqué, jusqu'à l'expiration du jeton — au plus une heure.
 *
 *   ⛔ C'EST CE CHEMIN-CI QUI DÉCOUVRE LA RÉVOCATION, parce que lui interroge le
 *   serveur : les trois clients appellent `supabase.auth.getUser()`, qui fait un
 *   aller-retour vers GoTrue et échoue immédiatement sur une session révoquée.
 *
 *   ★ LE « CADRE VIDE » ACCEPTÉ PAR DOM AU LOT R N'EST ACCEPTABLE QUE PARCE QUE
 *   CETTE LIGNE EXISTE. Supprimer cette redirection ne casse pas seulement une
 *   page : elle laisserait un accès révoqué devant une coquille sans jamais lui
 *   dire de se reconnecter. Qui voudra la retirer doit d'abord rouvrir
 *   `lib/auth.ts` et défaire le lot R.
 *
 * ⛔ AUCUNE BOUCLE N'EST POSSIBLE, ET C'EST PROUVÉ AUX DEUX BOUTS :
 *   · `app/[locale]/login/page.tsx` ne lit AUCUNE session et ne redirige NULLE
 *     PART — il rend son formulaire pour tout le monde, sans condition ;
 *   · le seul chemin de `/login` vers `/dashboard` est
 *     `components/auth/LoginForm.tsx:37`, un `router.push` placé APRÈS un
 *     `signInWithPassword()` retourné SANS erreur — donc après une session
 *     neuve et valide.
 *   Un aller-retour login ↔ dashboard exigerait qu'une session tout juste
 *   obtenue soit déjà invalide côté serveur. ⚪ La redirection du layout serveur
 *   sur `!user` ne change rien : elle envoie dans le même sens, vers `/login`.
 *
 * ⚠️ NAVIGATION DURE, ET CE N'EST PAS UN OUBLI DE `router.replace()`. Depuis le
 *   lot T (`a13aeb8`), le préchargement est rallumé : le cache du routeur peut
 *   contenir jusqu'à HUIT charges utiles RSC rendues par `getClaims()`, donc
 *   possiblement sous une session déjà révoquée, et Next les garde 30 s. Une
 *   navigation douce les laisserait en place et un retour arrière les
 *   resservirait. `window.location.assign` jette tout l'état client et laisse le
 *   serveur redécider.
 *   ⚪ Et pas `router.push` non plus : la page cassée ne doit pas rester dans
 *   l'historique derrière le bouton Précédent.
 *
 * ⚪ CE N'EST PAS UN CHANGEMENT DE LANGUE, donc la règle §3 du CLAUDE.md ne
 *   s'applique pas : `locale` est LU pour construire l'URL, jamais écrit.
 */
export function redirigeVersConnexion(locale: string): void {
  window.location.assign(`/${locale}/login`)
}
