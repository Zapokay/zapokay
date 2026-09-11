-- =============================================================================
-- Correction d'une entité actionnaire — le préalable de schéma
--   activity_log.event_type — élargissement du CHECK de 27 → 28 valeurs
--   Ajoute : 'shareholder_entity_edited'
-- =============================================================================
--
-- POURQUOI. L'écran de correction d'une entité journalisera chaque correction,
-- avec la dénomination PRÉCÉDENTE dans les détails — comme
-- person_identity_updated le fait pour une personne. `activity_log.event_type`
-- porte un CHECK FERMÉ à 27 valeurs : un type neuf serait REFUSÉ à l'insertion.
--
-- ⚠️ ET LE REFUS SERAIT SANS EFFET VISIBLE POUR L'UTILISATEUR. Relu avant
-- d'écrire : `lib/activity-log.ts` NE LÈVE JAMAIS — c'est son intention
-- déclarée, un journal en échec ne doit pas défaire le geste qu'il consigne. Il
-- lit désormais le `{ error }` et l'écrit à la console, mais l'action a déjà eu
-- lieu. Sans cette migration, une dénomination serait corrigée et la
-- correction ne serait PAS CONSIGNÉE. Elle doit donc être appliquée AVANT que
-- l'écran serve.
--
-- LE NOM SUIT LES VOISINES. director_edited, officer_edited, shareholding_edited :
-- `<chose>_edited`. La chose est une entité actionnaire — la table s'appelle
-- shareholder_entities — d'où `shareholder_entity_edited`. `entity_edited` seul
-- aurait été ambigu dans un journal où « entity » ne désigne rien d'autre de
-- façon stable.
--
-- ⚠️ AUCUN BEGIN;/COMMIT; — DÉLIBÉRÉMENT, comme 20260905141500. La protection
-- réelle est l'idempotence : DROP CONSTRAINT IF EXISTS puis ADD, rejouable
-- autant de fois que voulu, même état final.
--
-- ⚠️ LE SEUL INSTANT DE RISQUE. Entre le DROP et le ADD, la table est
-- momentanément SANS contrainte sur `event_type`. Les deux instructions doivent
-- être exécutées ENSEMBLE. Si le ADD échoue, relancer le fichier entier.
--
-- ★ LA LISTE N'A PAS ÉTÉ RECOPIÉE À LA MAIN. Les 27 valeurs ont été ÉMISES par
-- Postgres à partir de sa propre contrainte (`pg_get_constraintdef` puis
-- `regexp_matches … WITH ORDINALITY`), dans leur ordre. Même méthode qu'au
-- 20260905141500 et pour la même raison : `ADD CONSTRAINT` valide les lignes
-- existantes, donc perdre une valeur EMPLOYÉE échouerait bruyamment — mais
-- perdre une valeur autorisée et JAMAIS écrite passerait sans bruit. 18 des 27
-- types sont employés ; les 9 autres ne sont protégés que par cette dérivation.
--
-- ★ AUCUNE LIGNE EXISTANTE NE PEUT VIOLER LA CONTRAINTE NEUVE, et c'est mesuré,
-- pas déduit. Le 2026-09-09, une reprise a échoué exactement sur ce point. Avant
-- d'écrire : 519 lignes, 18 types distincts, la somme par type retombe sur 519,
-- et AUCUN des 18 n'est hors de la liste des 28. La contrainte actuelle est
-- `convalidated = true` : elle a déjà validé chaque ligne contre les 27, et la
-- liste neuve les contient toutes.
--
-- AUCUNE DONNÉE N'EST MODIFIÉE. Un élargissement de contrainte : ni UPDATE, ni
-- DELETE, ni INSERT.
-- Attendu — valeurs du CHECK : 27 avant, 28 après.
--            `count(*)` sur activity_log : 519 avant comme après.
--
-- Ordre des 27 valeurs préservé verbatim ; 'shareholder_entity_edited' ajoutée
-- EN FIN. Nom de contrainte préservé (`activity_log_event_type_check`), comme
-- les cinq élargissements précédents.
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
    'document_superseded'::text,
    'person_identity_updated'::text,
    'shareholder_entity_edited'::text
  ]));
