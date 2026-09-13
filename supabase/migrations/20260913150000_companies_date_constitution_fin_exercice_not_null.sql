-- =============================================================================
-- Les deux bornes des exercices d'une société deviennent obligatoires
--   companies.incorporation_date, fiscal_year_end_month, fiscal_year_end_day :
--   SET NOT NULL
-- =============================================================================
--
-- ⚖️ DÉCISION, 2026-09-13 : une seule déclaration des exercices d'une société
-- (lib/active-years.ts, `exercicesDeLaSociete`). Elle va du premier exercice —
-- celui qui contient la date de constitution — à celui en cours, et la fin
-- d'exercice fixe chaque frontière. Sans l'une de ces trois valeurs, la liste n'a
-- pas de borne : le code LÈVE plutôt que d'en inventer une.
--
-- ⛔ UNE SEULE MIGRATION, UN SEUL TEMPS — AVANT LE DÉPLOIEMENT.
--   · AVANT : la base garantit ce que le code neuf suppose, dès sa première
--     requête. Sans risque pour le code déployé aujourd'hui : l'inscription
--     exige la date (StepCompany) et écrit toujours la fin d'exercice (valeurs
--     initiales 12/31) ; les Paramètres refusent une date vide depuis 8620b74 et
--     n'écrivent la fin d'exercice qu'en nombres. Mesuré le 2026-09-13 : aucune
--     des dix-huit sociétés n'a l'une des trois valeurs à NULL.
--   · APRÈS (inversion) : le code neuf serait en ligne sans la garantie. Une ligne
--     à NULL écrite dans l'intervalle — par une requête directe, puisque l'accès
--     aux lignes de sa propre société le permet — ferait lever l'étape 8, les
--     Paramètres, le tableau de bord et Complétude de cette société.
--   · `supabase db push` applique TOUT ce qui est en attente : au 2026-09-13 le
--     distant et le dépôt s'arrêtent tous deux à 20260913120100, donc cette
--     migration est la seule qu'il appliquera.
--
-- ⛔ HORS DE CE FICHIER, À DESSEIN : `company_active_years` (8 lignes, aucun
-- lecteur) et `companies.active_fiscal_year` (vide), deux déclarations mortes
-- des exercices. Leur retrait est destructif : lot séparé.
-- =============================================================================

alter table public.companies
  alter column incorporation_date set not null,
  alter column fiscal_year_end_month set not null,
  alter column fiscal_year_end_day set not null;
