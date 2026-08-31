-- =============================================================================
-- companies.corporation_number_digits — colonne GÉNÉRÉE + index UNIQUE partiel
-- Ajoute : corporation_number_digits, idx_companies_corporation_number_digits_unique
-- =============================================================================
--
-- ⚠️ CECI EST UN REGISTRE. Le SQL a été appliqué À LA MAIN au tableau de bord
-- Supabase, puis ce fichier est entré à l'histoire. Il inscrit, il ne rejoue
-- pas. Les définitions ci-dessous sont relues depuis la base vivante —
-- pg_get_expr() pour la colonne, pg_get_indexdef() pour l'index — et non
-- retapées depuis un brief.
--
-- POURQUOI. Corporations Canada écrit le MÊME numéro de deux façons, et les
-- deux sortent de chez lui :
--   · certificat de constitution, libellé bilingue officiel
--     « Corporation number / Numéro de société »        →  1709431-1
--   · Registres d'entreprises au Canada, « NI du registre »  →  17094311
-- Même société — une société de notre propre parc — même émetteur. Sept
-- chiffres suivis d'un chiffre vérificateur ; le trait d'union est de la
-- PRÉSENTATION, pas de l'information.
--
-- L'infobulle déployée au 6496ca1 promet à l'utilisateur que les deux
-- écritures sont acceptées. Le champ les acceptait déjà ; le contrôle
-- d'unicité, non — idx_companies_corporation_number_unique compare la chaîne
-- BRUTE, donc 1709431-1 et 17094311 y étaient deux valeurs distinctes et deux
-- comptes pouvaient inscrire la même société sous les deux graphies. Cette
-- colonne rend la promesse vraie.
--
-- ⚠️ LE STOCKAGE NE CHANGE PAS. corporation_number garde sa forme d'origine,
-- trait d'union compris. Rien n'est normalisé à l'écriture, rien n'est affiché
-- depuis cette colonne : elle n'existe que pour la COMPARAISON.
--
-- ⚠️ ET L'INDEX BRUT EST CONSERVÉ, DÉLIBÉRÉMENT. Il n'est pas redondant. La
-- normalisation implique bien que toute paire identique en brut l'est aussi en
-- normalisé — mais les deux index sont PARTIELS, et leurs prédicats ne couvrent
-- pas les mêmes lignes. Une valeur sans AUCUN chiffre (« - ») est non vide,
-- donc l'index brut la voit ; elle se réduit à '', donc l'index normalisé la
-- laisse passer. Mesuré 2026-08-30 : zéro ligne de ce type dans le parc, mais
-- rien dans le code ne l'empêche — le champ fédéral n'a aucune validation de
-- format, par décision. Les deux index cohabitent ; quatre au total sur la
-- table.
--
-- MESURÉ AVANT D'APPLIQUER, sur les 12 sociétés du parc :
--   1709431-1  → 17094311     (Art et Technologie DePictura Inc.)
--   1810444-1  → 18104441     (Wick Inc)
--   9999999-9  → 99999999     (Federal Test inc.)
--   123456789101 et 641545454976 : déjà en chiffres, inchangées
--   5 valeurs indexées, 5 distinctes en brut, 5 distinctes en normalisé
--   → ZÉRO collision créée par la normalisation. Aucune ligne existante
--     n'est rejetée par le nouvel index.
--
-- ⚠️ CE QUE CE LOT NE FAIT PAS. Le format du numéro fédéral n'est toujours pas
-- validé : reste ouvert chez Harvey de savoir si les numéros anciens peuvent
-- faire moins de sept chiffres ou être complétés par des zéros. La
-- recommandation « allow at least 12 » tient, et l'asymétrie des coûts tranche —
-- un numéro malformé se répare aux Paramètres, un numéro légitime REFUSÉ perd
-- un client à l'inscription. Le NEQ ne reçoit rien : sa forme est déjà garantie
-- à l'écriture depuis 8a4b312, et ses 12 valeurs sont déjà en chiffres seuls.
-- =============================================================================

ALTER TABLE public.companies
  ADD COLUMN corporation_number_digits text
  GENERATED ALWAYS AS (regexp_replace(corporation_number, '[^0-9]'::text, ''::text, 'g'::text)) STORED;

CREATE UNIQUE INDEX idx_companies_corporation_number_digits_unique
  ON public.companies USING btree (corporation_number_digits)
  WHERE ((corporation_number_digits IS NOT NULL) AND (corporation_number_digits <> ''::text));
