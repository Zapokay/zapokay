-- =============================================================================
-- activity_log.event_type — élargissement du CHECK de 25 → 26 valeurs
-- Ajoute : 'document_superseded'
-- =============================================================================
--
-- POURQUOI. Le lot du remplacement multiple journalisera chaque document mis au
-- rancart. Aujourd'hui, `activity_log.event_type` porte un CHECK FERMÉ à 25
-- valeurs : un type neuf serait REFUSÉ à l'insertion.
--
-- ⚠️ ET LE REFUS SERAIT MUET. `lib/activity-log.ts` enveloppe son insert dans un
-- try/catch, mais supabase-js NE LÈVE PAS sur une erreur Postgres — il retourne
-- `{ error }`, que cette fonction ne destructure jamais. Un rejet par ce CHECK
-- ne produirait donc ni exception, ni ligne de journal, ni effet visible : le
-- document partirait au rancart et rien ne serait consigné. Cette migration doit
-- être appliquée AVANT que le code écrive le type neuf.
--
-- ⚠️ APPLIQUÉE PAR LE TABLEAU DE BORD SUPABASE, DONC ABSENTE DU REGISTRE.
-- Comme toutes les migrations de ce dépôt, celle-ci est collée dans l'éditeur SQL
-- du tableau de bord. Elle n'est PAS enregistrée dans
-- `supabase_migrations.schema_migrations` : le fichier existe pour la traçabilité
-- du dépôt, pas pour un `supabase db push`.
--
-- ⚠️ AUCUN BEGIN;/COMMIT; — DÉLIBÉRÉMENT. L'éditeur SQL du tableau de bord les
-- IGNORE. En écrire donnerait une fausse impression d'atomicité. La protection
-- réelle est l'idempotence : `DROP CONSTRAINT IF EXISTS` puis `ADD`, rejouable
-- autant de fois que voulu, avec le même état final.
--
-- ⚠️ LE SEUL INSTANT DE RISQUE. Entre le DROP et le ADD, la table est
-- momentanément SANS contrainte sur `event_type`. Une écriture concurrente
-- portant une valeur hors liste passerait, et ferait ensuite ÉCHOUER le ADD.
-- Les deux instructions doivent être collées et exécutées ENSEMBLE, en une
-- seule fois. Si le ADD échoue, la table reste sans contrainte : relancer le
-- fichier entier, qui est idempotent.
--
-- ★ PROTECTION GRATUITE, ET SES LIMITES. `ADD CONSTRAINT` VALIDE les lignes
-- existantes : si la liste ci-dessous omettait une valeur réellement présente en
-- base, l'instruction échouerait BRUYAMMENT. Les 16 types employés (476 lignes,
-- mesurées le 2026-08-27) sont donc protégés par Postgres lui-même.
-- ⚠️ Les 9 types autorisés mais JAMAIS écrits ne le sont pas : en perdre un
-- passerait sans bruit. C'est pourquoi la liste ci-dessous n'a pas été recopiée
-- à la main — elle a été DÉRIVÉE de `pg_get_constraintdef` par une requête qui a
-- fait émettre ce DDL à Postgres à partir de sa propre contrainte.
--
-- AUCUNE DONNÉE N'EST MODIFIÉE. Élargissement de contrainte, rien d'autre :
-- ni UPDATE, ni DELETE, ni INSERT. `count(*)` sur activity_log doit valoir 476
-- avant comme après.
--
-- Ordre des 25 valeurs préservé verbatim ; 'document_superseded' ajoutée EN FIN.
-- Nom de contrainte préservé (`activity_log_event_type_check`), comme les trois
-- élargissements précédents : 20260524190548 (18→22), 20260526120000 (22→24),
-- 20260527120000 (24→25).
-- =============================================================================

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
    'document_superseded'::text
  ]));
