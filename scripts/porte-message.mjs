#!/usr/bin/env node
/**
 * LA PORTE DU MESSAGE DE COMMIT — elle SORT EN ERREUR, elle n'affiche pas.
 *
 * ⚖️ DOM, 2026-09-21, lot AA-5 : « chaîne-le POUR DE VRAI, et prouve-le contre
 * une ligne délibérément longue. Pas d'annonce cette fois — une assertion. »
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE, ET C'EST UN AVEU. Je vérifiais la longueur
 * des lignes par un fragment Python collé dans la commande. DEUX FOIS il a
 * détecté une ligne trop longue et DEUX FOIS le commit est parti quand même —
 * aux lots T et Z-B — parce que la commande suivante n'était pas chaînée par
 * `&&` : le fragment sortait en code 1, personne ne le lisait, et rien ne
 * s'arrêtait. Au lot T j'ai ANNONCÉ l'avoir corrigé sans le faire.
 *
 * ★ UN CONTRÔLE QUI AFFICHE N'EST PAS UNE PORTE. Une porte refuse. Celle-ci
 * vit dans le dépôt, porte un nom, et son code de sortie est la seule chose
 * qui compte. ⛔ NE PAS la réécrire en fragment collé : c'est exactement le
 * défaut qu'elle remplace.
 *
 * USAGE, et il se chaîne :
 *   npm run -s porte:message -- <fichier> && git commit -F <fichier>
 *
 * ★★★ CETTE PORTE VÉRIFIE CE QUE GIT SAIT. ELLE NE VÉRIFIE PAS CE QU'UN BUILD
 *   SAIT. ★★★ — Dom, 2026-09-22, lot AB-4.
 *   Un fait qui exige un artefact de build appartient à la porte qui le
 *   PRODUIT. « ROUTES : 40 » est vérifié par `next build` ; « Avertissements
 *   lint : 6 » par `next lint`. ⛔ Les lire ici ferait dépendre cette porte de
 *   l'artefact d'une AUTRE, donc de l'ORDRE dans lequel elles ont tourné — et
 *   un ordre différent la désactiverait en silence. C'est le défaut exact qui
 *   a produit deux faux échecs de `tsc` cette semaine : lancé avant
 *   `next build`, il lisait un `.next/types` PÉRIMÉ. Une porte qui lit
 *   l'artefact d'une autre hérite de sa fraîcheur, et un artefact périmé
 *   produit une porte qui ment DANS LES DEUX SENS.
 *   ⛔ Qui voudra ajouter ici un fait de build doit relire ce paragraphe.
 *
 * ⚪ LES REFUS SONT TOUS DITS, PAS SEULEMENT LE PREMIER. Chaque contrôle
 *   inscrit son refus, et la porte sort en erreur à la fin s'il y en a au
 *   moins un : une faute de longueur ne doit pas cacher un parent faux.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * ⛔ 80 CARACTÈRES, PAS 80 OCTETS. Le message est en français : « é » pèse deux
 * octets et une colonne. Compter les octets refuserait des lignes correctes et
 * c'est la mesure que `awk length` donne par défaut — piège rencontré au lot T.
 * ⚪ Le SUJET est exempt : le dépôt le veut long et explicite.
 */
const LARGEUR = 80;

const fichier = process.argv[2];
if (!fichier) {
  console.error('porte:message — usage : porte:message -- <fichier>');
  process.exit(2);
}

const lignes = readFileSync(fichier, 'utf8').split('\n');
const trop = lignes
  .map((l, i) => ({ n: i + 1, len: [...l].length, l }))
  .filter((x) => x.n > 1 && x.len > LARGEUR);

/** Les refus, dans l'ordre. La porte sort en erreur à la fin s'il y en a. */
const refus = [];

if (trop.length > 0) {
  refus.push(`longueur — ${trop.length} ligne(s) au-delà de ${LARGEUR} caractères :`);
  for (const x of trop) refus.push(`   l.${x.n} (${x.len}) ${x.l.slice(0, 72)}…`);
}

/** Git, en lecture. `null` si le dépôt n'est pas lisible — on se tait alors
 *  plutôt que d'inventer une comparaison. */
function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
const indexe = (git('diff', '--cached', '--name-only') ?? '')
  .split('\n')
  .filter((l) => l.trim() !== '');

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LE COMPTE DE FICHIERS — LA PORTE VÉRIFIE CE QUE LE MESSAGE AFFIRME.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚖️ DOM, 2026-09-21, lot AB. Troisième incident de la même famille : le
 * message de `d6435fa` annonçait « NEUF fichiers au diff » pour DIX. La porte
 * vérifiait la longueur, pas les faits.
 *
 * ⚖️⚖️ DÉCISION DE MAX, 2026-09-23, lot P-1 — ET ELLE RENVERSE LA CLAUSE
 * CI-DESSOUS, QUI DISAIT : « elle vérifie ce qui est affirmé, elle n'exige pas
 * qu'on affirme ». Cette prudence a coûté DEUX silences : un message annonçant
 * « VINGT fichiers » (mot absent de la table) et un autre « TROIS fichiers »
 * sans « au diff » sont passés SANS VÉRIFICATION, et la porte n'a rien dit.
 * ★ UNE PORTE QUI SE TAIT QUAND ELLE NE RECONNAÎT PAS LA FORME LAISSE CROIRE
 * QU'ELLE A VÉRIFIÉ. C'est pire que pas de porte : on lui fait confiance.
 *
 * ⛔ DONC : LE COMPTE EST EXIGÉ, ET EN CHIFFRES. « 3 fichiers au diff ».
 *   · pas de compte → REFUS. Le silence devient impossible.
 *   · en lettres → REFUS. Élargir la table, c'est courir après les formes ;
 *     exiger la forme, c'est fermer la question une fois.
 * ⚪ ET LA TABLE DES MOTS EST SUPPRIMÉE avec la clause : la garder entretenue
 *   pour un cas qu'on refuse désormais serait du code mort qui a l'air vivant.
 *
 * ⚪ ELLE LIT L'INDEX (`--cached`), pas l'arbre : c'est ce que `git commit`
 * s'apprête à écrire. Hors dépôt ou sans rien d'indexé, elle se tait plutôt
 * que d'inventer une comparaison.
 */
/**
 * « 12 FICHIERS AU DIFF », « 1 fichier au diff ». ⛔ EN CHIFFRES, TOUJOURS.
 *
 * ⛔⛔ LES CITATIONS SONT ÔTÉES D'ABORD, ET LA PORTE L'A APPRIS SUR ELLE-MÊME.
 *   À son tout premier usage, elle a refusé le message du lot AB : il CITAIT
 *   « NEUF fichiers au diff » en racontant la faute de `d6435fa`, et la porte
 *   a lu la citation au lieu de l'affirmation. ★ Un message de ce dépôt cite
 *   constamment les messages passés — c'est sa forme. Une porte qui confond
 *   « ce que j'affirme » et « ce que je rapporte » refuse les bons messages,
 *   et on finit par la désactiver.
 *   ⚪ Les guillemets français « … » sont le seul marqueur de citation
 *   employé ici ; leur contenu est retiré avant lecture.
 *
 * ⛔ ET SI DEUX COMPTES DIFFÉRENTS SUBSISTENT HORS CITATION, ON REFUSE : le
 *   message se contredit lui-même, et choisir le dernier masquerait la
 *   contradiction au lieu de la dire.
 */
function compteAnnonce(texte) {
  const sansCitation = texte.replace(/«[^»]*»/g, ' ');
  const trouves = [...sansCitation.matchAll(/\b(\d+)\s+fichiers?\s+au\s+diff\b/gi)]
    .map((m) => Number(m[1]));
  if (trouves.length === 0) return null;
  const distincts = [...new Set(trouves)];
  if (distincts.length > 1) return { contradiction: distincts };
  return distincts[0];
}

const texte = lignes.join('\n');
const annonce = compteAnnonce(texte);
if (annonce === null) {
  /* ⛔ LE SILENCE EST UN REFUS DEPUIS P-1. La phrase attendue est nommée dans
     le refus : une porte qui refuse sans dire quoi écrire se fait contourner. */
  refus.push(
    'compte — le message n’annonce AUCUN compte. Écris « N fichiers au diff », ' +
    'en chiffres (l’index en porte ' + indexe.length + ').',
  );
} else if (typeof annonce === 'object') {
  refus.push(`compte — le message annonce DEUX comptes différents : ${annonce.contradiction.join(' et ')}`);
} else if (indexe.length > 0 && indexe.length !== annonce) {
  refus.push(`compte — le message annonce ${annonce} fichier(s) au diff, l'index en porte ${indexe.length}`);
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LE PARENT — lot AB-4, 2026-09-22.
 * ═══════════════════════════════════════════════════════════════════════
 * `Parent: <sha>` doit être le HEAD au moment où la porte tourne, c'est-à-dire
 * le parent du commit qu'on s'apprête à écrire. Un parent faux fait décrire au
 * message une LIGNÉE QUI N'EST PAS LA SIENNE — l'erreur qu'on ne découvre qu'en
 * reconstituant l'histoire, des mois plus tard.
 *
 * ⚠️ MESURÉ AVANT DE L'ÉCRIRE, ET DIT : sur 95 commits de l'historique qui
 * portent une ligne `Parent:`, AUCUN n'annonce un parent faux. Cette garde n'a
 * donc encore rien attrapé ; elle ferme un risque, pas un incident.
 *
 * ⛔ `--amend` N'EST PAS LE RITUEL : HEAD y est le commit qu'on remplace, pas
 * son parent. La porte refuserait un parent pourtant juste. On ne l'y adapte
 * pas — le rituel est `porte:message && git commit`, sans amendement.
 */
const parentAnnonce = texte.match(/^Parent:\s*([0-9a-f]{7,40})\s*$/m)?.[1] ?? null;
if (parentAnnonce !== null) {
  const head = (git('rev-parse', 'HEAD') ?? '').trim();
  if (head !== '' && !head.startsWith(parentAnnonce)) {
    refus.push(`parent — le message annonce ${parentAnnonce}, HEAD est ${head.slice(0, 7)}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * « AUCUNE MIGRATION » — lot AB-4, 2026-09-22.
 * ═══════════════════════════════════════════════════════════════════════
 * Si le message l'AFFIRME, l'index ne doit porter aucun fichier sous
 * `supabase/migrations/`. Un schéma qui change sans que le message le dise est
 * le défaut que la règle « elle passe par db push et entre au MÊME commit »
 * existe pour empêcher.
 *
 * ⛔⛔ AFFIRMATION, PAS MENTION — ET C'EST LE RÉTROSPECTIF QUI L'A IMPOSÉ. La
 *   lecture naïve de la phrase trouvait UN fautif dans l'historique :
 *   `aed7f5c`, qui porte bien une migration… et qui écrivait « AUCUNE
 *   MIGRATION N'EST POSSIBLE DE CE CÔTÉ-LÀ » — une migration de DONNÉES jugée
 *   impossible, pas une affirmation sur le schéma. La porte naïve aurait
 *   REFUSÉ un message juste, et n'aurait rien attrapé d'autre.
 *   ★ Sont donc ôtés avant lecture : les citations « … » et les mentions en
 *   `code`. Et la phrase ne compte que si elle se CLÔT — suivie d'un point,
 *   d'une virgule, d'un tiret, d'un deux-points ou d'une fin de ligne —, pas
 *   si elle se poursuit en proposition (« … N'EST POSSIBLE »).
 *
 * ⚠️ MESURÉ AUSSI : sur 10 commits qui l'affirment, AUCUN ne porte de
 * migration. Comme le parent, cette garde n'a encore rien attrapé.
 */
const sansMentions = texte.replace(/«[^»]*»/g, ' ').replace(/`[^`]*`/g, ' ');
const afficheAucuneMigration = /AUCUNE\s+MIGRATION(?=\s*(?:$|[.,:—]))/m.test(sansMentions);
if (afficheAucuneMigration) {
  const migrations = indexe.filter((f) => f.startsWith('supabase/migrations/'));
  if (migrations.length > 0) {
    refus.push(`migration — le message affirme AUCUNE MIGRATION, l'index en porte ${migrations.length} : ${migrations.join(', ')}`);
  }
}

if (refus.length > 0) {
  console.error('⛔ porte:message — le commit ne doit PAS partir :');
  for (const r of refus) console.error(`   ${r}`);
  process.exit(1);
}

if (annonce !== null && indexe.length > 0) {
  console.log(`✔ porte:message — compte annoncé ${annonce} = ${indexe.length} fichier(s) indexés`);
}
if (parentAnnonce !== null) console.log(`✔ porte:message — parent ${parentAnnonce} = HEAD`);
if (afficheAucuneMigration) console.log('✔ porte:message — aucune migration à l’index, comme affirmé');
console.log(`✔ porte:message — ${lignes.length} lignes, aucune au-delà de ${LARGEUR}`);
