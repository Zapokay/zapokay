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

console.log(`✔ porte:message — ${lignes.length} lignes, aucune au-delà de ${LARGEUR}`);
