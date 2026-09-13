-- =============================================================================
-- Le siège social entre au schéma — et la province cesse d'être une question
--   1. companies gagne les SIX colonnes d'adresse, aux noms des personnes et
--      des entités
--   2. companies.province : DROP DEFAULT, DROP NOT NULL — elle ne sera plus
--      écrite ; son retrait est la migration suivante, APRÈS le déploiement
-- =============================================================================
--
-- ⚖️ DÉCISIONS DE DOM, 2026-09-13 : la société obtient une adresse de siège ;
-- l'adresse ABSORBE la province ; l'adresse complète est exigée dans
-- l'application et proposée sans astérisque à l'inscription.
--
-- ⛔ ORDRE D'APPLICATION — DEUX TEMPS, ET CELUI-CI EST LE PREMIER.
--   · CETTE migration s'applique AVANT le déploiement du code du lot. Le code
--     neuf lit et écrit les six colonnes : déployé sans elles, l'étape 3 de
--     l'inscription et les Paramètres échoueraient.
--   · Elle est SANS RISQUE pour le code déployé aujourd'hui : elle ajoute des
--     colonnes nullables sans défaut, et relâche `province`, que l'ancien code
--     écrit toujours explicitement.
--   · Le retrait de `province` (20260913120100) vient APRÈS le déploiement :
--     appliqué avant, il casserait l'étape 3 de l'ancien code, qui écrit la
--     colonne. Même doctrine que 64137f7 — la base suit le code qui sait la lire.
--
-- -----------------------------------------------------------------------------
-- POURQUOI LES MÊMES NOMS (1)
-- -----------------------------------------------------------------------------
-- company_people et shareholder_entities portent déjà ces six colonnes, sous
-- ces noms. lib/address.ts compose toute ligne qui les porte SANS VARIANTE :
-- `PersonneAdressable` est un type structurel sur les six noms. D'autres noms
-- auraient exigé un cas particulier dans la composition.
--
-- Nullables, SANS DÉFAUT, SANS CHECK — la forme des personnes et des entités.
-- Un défaut refabriquerait le « QC » que ce lot retire. L'exigence vit dans
-- l'application (lib/data-gaps.ts, CHAMPS_REQUIS_SIEGE), là où Dom l'a posée :
-- une contrainte en base refuserait l'inscription, où l'adresse est facultative.
--
-- -----------------------------------------------------------------------------
-- POURQUOI LES 17 VALEURS DE `province` NE SONT PAS RECOPIÉES (2)
-- -----------------------------------------------------------------------------
-- Elles ne sont pas une source : DEFAULT 'QC' en base, présélection 'QC' à
-- l'étape 3, aucune garde — 17 sociétés sur 17 à QC, et rien ne distingue un
-- choix d'un défaut. Les recopier dans `address_province` les ferait passer
-- pour déclarées. Le parc est jetable, sauf « Art et Technologie DePictura
-- Inc. » (a1805bf2-f9c8-4834-8deb-9a4264ce0d14, province 'QC' avant ce lot),
-- dont Dom saisira le siège à la main.
--
-- Mesuré avant rédaction : rien ne LIT `companies.province` hors de
-- l'inscription et des Paramètres — aucune fonction, vue, politique ni
-- déclencheur, et aucun calcul d'obligation (juridiction QC codée en dur).
--
-- ⚠️ NON EXÉCUTÉE PAR L'AUTEUR DU LOT. À appliquer par Dom, avant le déploiement.
-- =============================================================================

alter table public.companies
  add column address_line1       text,
  add column address_line2       text,
  add column address_city        text,
  add column address_province    text,
  add column address_postal_code text,
  add column address_country     text;

alter table public.companies
  alter column province drop default,
  alter column province drop not null;
