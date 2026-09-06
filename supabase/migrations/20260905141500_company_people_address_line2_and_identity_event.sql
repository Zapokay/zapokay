-- =============================================================================
-- Édition d'identité d'une personne — les deux préalables de schéma
--   1a. company_people.address_line2 (nouveau champ « suite / appartement »)
--   1b. activity_log.event_type — élargissement du CHECK de 26 → 27 valeurs
--       Ajoute : 'person_identity_updated'
-- =============================================================================
--
-- POURQUOI 1a. Le registre des administrateurs doit porter l'adresse (art. 33
-- al. 2 par. 2° LPLE), et le cabinet dont nous copions la forme écrit
-- « 510 – 1655 Saint-Patrick St » : le numéro de suite précède la voie. Les
-- cinq colonnes d'adresse existantes ne peuvent pas le loger — address_line1
-- porte la voie. Mesuré avant d'écrire : AUCUNE colonne line2 / suite /
-- appartement / unit dans TOUT le schéma, alors que la même recherche trouve
-- bien onze colonnes d'adresse sur trois tables. Le manque est réel.
--
-- POURQUOI 1b. L'édition journalisera la correction. `activity_log.event_type`
-- porte un CHECK FERMÉ à 26 valeurs : un type neuf serait REFUSÉ à l'insertion.
--
-- ⚠️ ET LE REFUS SERAIT MUET — la raison est celle de la migration
-- 20260827174806, inchangée : `lib/activity-log.ts` enveloppe son insert dans un
-- try/catch, mais supabase-js NE LÈVE PAS sur une erreur Postgres — il retourne
-- `{ error }`, que cette fonction ne destructure jamais. Un rejet par ce CHECK ne
-- produirait ni exception, ni ligne de journal, ni effet visible : l'identité
-- serait corrigée et rien ne serait consigné. Cette migration doit être appliquée
-- AVANT que le code écrive le type neuf.
--
-- ⚠️ APPLIQUÉE PAR LE TABLEAU DE BORD SUPABASE, DONC ABSENTE DU REGISTRE.
-- Comme toutes les migrations de ce dépôt, celle-ci est collée dans l'éditeur SQL
-- du tableau de bord. Elle n'est PAS enregistrée dans
-- `supabase_migrations.schema_migrations` : le fichier existe pour la traçabilité
-- du dépôt, pas pour un `supabase db push`.
--
-- ⚠️ AUCUN BEGIN;/COMMIT; — DÉLIBÉRÉMENT. L'éditeur SQL du tableau de bord les
-- IGNORE. En écrire donnerait une fausse impression d'atomicité. La protection
-- réelle est l'idempotence : ADD COLUMN IF NOT EXISTS, puis DROP CONSTRAINT
-- IF EXISTS suivi d'un ADD — rejouable autant de fois que voulu, même état final.
--
-- ⚠️ LE SEUL INSTANT DE RISQUE, et il ne concerne que 1b. Entre le DROP et le ADD,
-- la table est momentanément SANS contrainte sur `event_type`. Une écriture
-- concurrente portant une valeur hors liste passerait, et ferait ensuite ÉCHOUER
-- le ADD. Les instructions doivent être collées et exécutées ENSEMBLE, en une
-- seule fois. Si le ADD échoue, la table reste sans contrainte : relancer le
-- fichier entier, qui est idempotent.
--
-- ★ LA LISTE N'A PAS ÉTÉ RECOPIÉE À LA MAIN. Elle a été DÉRIVÉE de
-- `pg_get_constraintdef` par une requête qui a fait émettre ce DDL à Postgres à
-- partir de sa propre contrainte — même méthode qu'au 20260827174806, et pour la
-- même raison : `ADD CONSTRAINT` valide les lignes existantes, donc perdre une
-- valeur EMPLOYÉE échouerait bruyamment, mais perdre une valeur autorisée et
-- JAMAIS écrite passerait sans bruit. 17 des 26 types sont employés (493 lignes,
-- mesurées le 2026-09-05) ; les 9 autres ne sont protégés que par cette dérivation.
--
-- AUCUNE DONNÉE N'EST MODIFIÉE. Un ajout de colonne nullable sans défaut, et un
-- élargissement de contrainte : ni UPDATE, ni DELETE, ni INSERT.
-- Attendu — `count(*)` sur activity_log : 493 avant comme après.
--            `count(*)` sur company_people : 30 avant comme après.
--            address_line2 : 0 ligne renseignée après (colonne nullable, pas
--            de défaut — aucune valeur inventée sur les 30 lignes existantes).
--
-- Ordre des 26 valeurs préservé verbatim ; 'person_identity_updated' ajoutée EN
-- FIN. Nom de contrainte préservé (`activity_log_event_type_check`), comme les
-- quatre élargissements précédents : 20260524190548 (18→22), 20260526120000
-- (22→24), 20260527120000 (24→25), 20260827174806 (25→26).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. company_people.address_line2
-- ---------------------------------------------------------------------------
-- Nullable et SANS défaut, délibérément : une suite absente doit rester
-- indistinguable d'une suite jamais saisie. Une chaîne vide par défaut
-- affirmerait « pas de suite », ce que personne n'a déclaré.

ALTER TABLE public.company_people
  ADD COLUMN IF NOT EXISTS address_line2 text;

-- ---------------------------------------------------------------------------
-- 1b. activity_log.event_type — 26 → 27
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_event_type_check;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'document_uploaded'::text,
    'document_generated'::text,
    'document_deleted'::text,
    'director_added'::text,
    'director_removed'::text,
    'officer_added'::text,
    'officer_removed'::text,
    'officer_replaced'::text,
    'shareholder_added'::text,
    'shares_issued'::text,
    'share_class_created'::text,
    'company_created'::text,
    'company_updated'::text,
    'fiscal_year_activated'::text,
    'fiscal_year_archived'::text,
    'compliance_item_completed'::text,
    'wizard_completed'::text,
    'settings_updated'::text,
    'director_edited'::text,
    'officer_edited'::text,
    'director_soft_deleted'::text,
    'officer_soft_deleted'::text,
    'shareholding_ended'::text,
    'shareholding_edited'::text,
    'share_transfer_created'::text,
    'document_superseded'::text,
    'person_identity_updated'::text
  ]));
