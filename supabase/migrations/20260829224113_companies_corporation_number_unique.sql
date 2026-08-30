-- =============================================================================
-- companies.corporation_number — index UNIQUE partiel
-- Ajoute : idx_companies_corporation_number_unique
-- =============================================================================
--
-- POURQUOI. Le numéro de société fédéral devient OBLIGATOIRE pour les sociétés
-- CBCA à l'inscription, et les Paramètres ne peuvent plus le vider. Il manquait
-- la troisième garde : rien n'empêche aujourd'hui DEUX comptes de déclarer le
-- même numéro. Le NEQ porte cette garantie depuis toujours
-- (`idx_companies_neq_unique`) ; le numéro fédéral n'avait rien.
--
-- FORME COPIÉE, PAS RÉINVENTÉE. Le prédicat reprend celui de l'index du NEQ, lu
-- depuis la base vivante avec pg_get_indexdef() — et non depuis un fichier
-- voisin, PARCE QU'IL N'Y EN A PAS : `idx_companies_neq_unique` existe en
-- production sans aucune migration au dépôt. Dette d'historique, nommée.
--
-- ⚠️ PARTIEL, ET LA CLAUSE EST PORTEUSE. `NULL` et `''` restent HORS de l'index :
-- une société provinciale n'a pas de numéro fédéral et ne doit pas entrer en
-- collision avec une autre provinciale. C'est aussi ce qui laisse passer les
-- TROIS sociétés fédérales du parc qui n'en portent aucun — mesuré 2026-08-29 :
-- 4 valeurs entrent dans l'index, 0 doublon, 7 lignes lui échappent.
--
-- ⚠️ CE QUE CET INDEX NE GARANTIT PAS. Le format du numéro n'est pas validé —
-- le dépôt marque sa propre infobulle « UNVERIFIED SOURCE », et deux des quatre
-- valeurs du parc font 12 chiffres sans rapport avec la forme des deux vraies.
-- Garantir l'unicité de valeurs qui ne veulent rien dire ne garantit rien : la
-- validation de format est un lot à part, chez Harvey.
-- =============================================================================

CREATE UNIQUE INDEX idx_companies_corporation_number_unique
  ON public.companies USING btree (corporation_number)
  WHERE ((corporation_number IS NOT NULL) AND (corporation_number <> ''::text));
