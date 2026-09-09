-- =============================================================================
-- Le pays du domicile cesse d'être fabriqué
--   1a. company_people.address_country — DROP DEFAULT
--   1b. les 29 lignes sans lieu passent à NULL (pays ET province)
-- =============================================================================
--
-- ⚠️ CECI N'EST PAS QU'UNE MIGRATION DE SCHÉMA. C'est une CORRECTION DE
-- DONNÉES sur 29 lignes d'une base partagée. L'état antérieur des 29 lignes
-- — id, nom, société, pays, province — a été capturé avant exécution et reste
-- restaurable ligne à ligne.
--
-- -----------------------------------------------------------------------------
-- POURQUOI LE DÉFAUT TOMBE (1a)
-- -----------------------------------------------------------------------------
-- `DEFAULT 'CA'` remplissait un pays que personne n'avait choisi. Mesuré avant
-- exécution : 31 lignes sur 31 portaient un pays, contre DEUX adresses réelles
-- dans toute la table. Une colonne où tout le monde est canadien et personne
-- n'a rien dit n'enregistre pas des réponses : elle enregistre un défaut.
--
-- ⛔ shareholder_entities.address_country garde SON défaut. Sa fonction
-- d'écriture, create_entity_with_signatories, porte en plus un
-- COALESCE(..., 'CA') qui refabriquerait le pays quoi qu'il arrive : les deux
-- pièces ne se séparent pas, et elles ont leur propre dossier.
--
-- -----------------------------------------------------------------------------
-- POURQUOI CES 29 LIGNES, ET PAS LES 31 (1b)
-- -----------------------------------------------------------------------------
-- La condition est le LIEU, pas la date :
--
--     address_country IS NOT NULL
-- AND address_line1   IS NULL
-- AND address_city    IS NULL
--
-- Une règle par date aurait pris les 31 : aucune ligne n'a été créée depuis le
-- déploiement de 88dd01e, donc « antérieure au correctif » ne discrimine plus
-- rien. Elle aurait effacé le pays des DEUX seules adresses complètes du parc —
-- « 55 St-Denis, Montreal, QC, H8K 7G9, CA » et « 123 Principale,
-- Sainte-Adèle, QC, J8B 1A1, CA » — où le « CA » est juste.
--
-- Un pays sans aucun lieu ne dit rien de personne. Un pays sous une voie et une
-- ville est une déclaration, et il reste.
--
-- ⚠️ LE RISQUE RÉSIDUEL, ÉNONCÉ AU CONDITIONNEL. Si quelqu'un avait déclaré un
-- pays SEUL, sans voie ni ville, cette migration l'effacerait. La mesure dit
-- qu'il n'en existe aucune — les 29 lignes visées n'ont jamais eu de champ
-- d'adresse rempli — mais la règle ne peut pas distinguer une déclaration
-- solitaire d'un défaut, et il faut le dire plutôt que de l'affirmer résolu.
--
-- -----------------------------------------------------------------------------
-- POURQUOI LA PROVINCE PART AVEC (1b)
-- -----------------------------------------------------------------------------
-- 13 des 29 portent une province « QC », résidu du `?? 'QC'` retiré du
-- formulaire le 2026-09-08. Fabriquée par le même mécanisme, sur la même ligne,
-- sans lieu autour : la laisser garderait une moitié du mensonge.
--
-- ★ CONSÉQUENCE VISIBLE, ET C'EST LA CORRECTION, PAS UN EFFET DE BORD :
-- QUATRE cartes d'administrateurs actifs cesseront d'afficher « QC » sous leur
-- nom (DirectorCard:119 compose [ville, province]). Elles affichaient une
-- province que personne n'avait saisie. Deux autres la gardent — ce sont celles
-- qui ont une adresse réelle.
-- =============================================================================

-- 1a — le défaut tombe.
ALTER TABLE company_people ALTER COLUMN address_country DROP DEFAULT;

-- 1b — les 29 lignes sans lieu.
UPDATE company_people
   SET address_country  = NULL,
       address_province = NULL
 WHERE address_country IS NOT NULL
   AND address_line1   IS NULL
   AND address_city    IS NULL;
