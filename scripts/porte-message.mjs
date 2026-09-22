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

if (trop.length > 0) {
  console.error(`⛔ porte:message — ${trop.length} ligne(s) au-delà de ${LARGEUR} caractères :`);
  for (const x of trop) console.error(`   l.${x.n} (${x.len}) ${x.l.slice(0, 72)}…`);
  console.error('   Le commit ne doit PAS partir. Raccourcis, puis relance.');
  process.exit(1);
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LE COMPTE DE FICHIERS — LA PORTE VÉRIFIE CE QUE LE MESSAGE AFFIRME.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚖️ DOM, 2026-09-21, lot AB. Troisième incident de la même famille : le
 * message de `d6435fa` annonçait « NEUF fichiers au diff » pour DIX. La porte
 * vérifiait la longueur, pas les faits.
 *
 * ⛔ ELLE VÉRIFIE CE QUI EST AFFIRMÉ, ELLE N'EXIGE PAS QU'ON AFFIRME. Un
 * message sans compte passe sans un mot : la porte n'est pas là pour imposer
 * une tournure, elle est là pour empêcher un chiffre faux. ★ Sans cette
 * clause, elle refuserait tout message qui se tait — et « elle refuse tout »
 * serait indistinguable de « elle marche ».
 *
 * ⚪ ELLE LIT L'INDEX (`--cached`), pas l'arbre : c'est ce que `git commit`
 * s'apprête à écrire. Hors dépôt ou sans rien d'indexé, elle se tait plutôt
 * que d'inventer une comparaison.
 */
const MOTS = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16,
};

/**
 * « SEPT fichiers au diff », « 12 FICHIERS AU DIFF », « UN fichier au diff ».
 * ⚪ « seul fichier au diff » est une affirmation de UN : la porte la lit.
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
  const trouves = [...sansCitation.matchAll(/\b([A-Za-zÀ-ÿ]+|\d+)\s+fichiers?\s+au\s+diff\b/gi)]
    .map((m) => {
      const brut = m[1].toLowerCase();
      if (brut === 'seul') return 1;
      if (/^\d+$/.test(brut)) return Number(brut);
      return MOTS[brut] ?? null;
    })
    .filter((v) => v !== null);
  if (trouves.length === 0) return null;
  const distincts = [...new Set(trouves)];
  if (distincts.length > 1) return { contradiction: distincts };
  return distincts[0];
}

const annonce = compteAnnonce(lignes.join('\n'));
if (annonce !== null && typeof annonce === 'object') {
  console.error(
    `⛔ porte:message — le message annonce DEUX comptes différents : ${annonce.contradiction.join(' et ')}.`,
  );
  process.exit(1);
}
if (annonce !== null) {
  let reel = null;
  try {
    const sortie = execFileSync('git', ['diff', '--cached', '--name-only'], {
      encoding: 'utf8',
    });
    reel = sortie.split('\n').filter((l) => l.trim() !== '').length;
  } catch {
    // ⚪ Pas de dépôt lisible : on ne compare pas, on ne refuse pas non plus.
  }
  if (reel !== null && reel > 0 && reel !== annonce) {
    console.error(
      `⛔ porte:message — le message annonce ${annonce} fichier(s) au diff, l'index en porte ${reel}.`,
    );
    console.error("   Corrige le compte, puis relance. Le commit ne doit PAS partir.");
    process.exit(1);
  }
  if (reel !== null && reel > 0) {
    console.log(`✔ porte:message — compte annoncé ${annonce} = ${reel} fichier(s) indexés`);
  }
}

console.log(`✔ porte:message — ${lignes.length} lignes, aucune au-delà de ${LARGEUR}`);
