-- =============================================================================
-- Les exercices financiers entrent au registre — le préalable de schéma
--   activity_log.event_type — élargissement du CHECK de 28 → 30 valeurs
--   Ajoute : 'fiscal_years_defined' · 'fiscal_years_updated'
-- =============================================================================
--
-- POURQUOI DEUX TYPES NEUFS, ALORS QUE DEUX EXISTENT DÉJÀ. Le CHECK porte
-- `fiscal_year_activated` et `fiscal_year_archived` — DEUX TYPES PAR ANNÉE.
-- Les employer produirait UNE LIGNE PAR EXERCICE COCHÉ, exactement le
-- découpage refusé pour l'inscription : on consigne ce qui a EU LIEU, pas ce
-- que le code a exécuté. L'utilisateur coche, décoche, puis valide UNE FOIS —
-- c'est UN geste, et `FiscalYearsSetup` en fait quatre écritures.
--
-- ⛔ ET LES DEUX ANCIENS NE SONT PAS RETIRÉS. Mesuré le 2026-09-17 : zéro
-- occurrence en code de produit (les 14 trouvées sont les listes de CHECK des
-- migrations antérieures, reportées) et zéro ligne en base. Ils sont MORTS —
-- mais une valeur inutilisée peut être une INTENTION, pas un accident. Même
-- traitement que `director_general` : on garde la question, on ne nettoie pas.
--
-- POURQUOI DEUX ET PAS UN. « Exercices définis » et « exercices modifiés » ne
-- disent pas la même chose à un associé. Le premier répond « depuis quand ce
-- livre compte-t-il ? », le second « qu'est-ce qui a changé, et par rapport à
-- quoi ? ». Deux moments différents de la vie du livre : la dernière étape de
-- l'inscription, et Paramètres, plus tard.
--
-- LE NOM SUIT LES VOISINES au PLURIEL, délibérément : `fiscal_years_*` et non
-- `fiscal_year_*`, parce que la ligne parle de L'ENSEMBLE des exercices suivis,
-- pas d'un exercice. La distinction avec les deux anciens est donc lisible dans
-- le nom même.
--
-- ⚪ ELLE EST ADDITIVE, ET C'EST MESURÉ, PAS SUPPOSÉ. Aucune ligne existante ne
-- peut la violer : le CHECK élargi contient les 28 valeurs actuelles plus deux.
-- Compté avant d'écrire — 0 ligne de `activity_log` porterait un `event_type`
-- refusé par la nouvelle liste. Le test lui-même a été validé : un type inventé
-- serait bien refusé par cette liste.
--
-- ⚠️ AUCUN BEGIN;/COMMIT; — DÉLIBÉRÉMENT, comme 20260911120000. La protection
-- réelle est l'idempotence : DROP CONSTRAINT IF EXISTS puis ADD, rejouable
-- autant de fois que voulu, même état final.
--
-- ⚠️ LE SEUL INSTANT DE RISQUE. Entre le DROP et le ADD, la table est
-- momentanément SANS contrainte sur `event_type`. Les deux instructions doivent
-- être exécutées ENSEMBLE. Si le ADD échoue, relancer le fichier entier.
--
-- ★ LA LISTE N'A PAS ÉTÉ RECOPIÉE À LA MAIN. Les 28 valeurs ont été ÉMISES par
-- Postgres à partir de sa propre contrainte (`pg_get_constraintdef` puis
-- `regexp_matches … WITH ORDINALITY`), dans leur ordre. Même méthode qu'au
-- 20260911120000 et pour la même raison : `ADD CONSTRAINT` valide les lignes
-- existantes, donc perdre une valeur EMPLOYÉE échouerait bruyamment — mais
-- perdre une valeur autorisée et JAMAIS écrite passerait sans bruit. Sept des
-- 28 types ne sont protégés que par cette dérivation.

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_event_type_check;

ALTER TABLE activity_log ADD CONSTRAINT activity_log_event_type_check CHECK (
  event_type = ANY (ARRAY[
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
    'shareholder_entity_edited'::text,
    'fiscal_years_defined'::text,
    'fiscal_years_updated'::text
  ])
);
