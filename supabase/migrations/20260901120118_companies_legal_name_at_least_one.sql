-- =============================================================================
-- companies — un nom légal peut être français, anglais, ou les deux
-- Modifie : legal_name_fr (DROP NOT NULL)
-- Ajoute  : companies_legal_name_present (CHECK)
-- =============================================================================
--
-- ⚠️ CECI EST UN REGISTRE. Le SQL a été appliqué À LA MAIN au tableau de bord
-- Supabase, puis ce fichier est entré à l'histoire. Il inscrit, il ne rejoue
-- pas.
--
-- ⚠️ AUCUN BEGIN, AUCUN COMMIT — ET CE N'EST PAS UN OUBLI. L'éditeur SQL du
-- tableau de bord NE TOURNE PAS en transaction : un BEGIN y est ignoré (mesuré
-- 2026-08-24). Les écrire donnerait l'illusion d'un tout-ou-rien qui n'existe
-- pas. La rejouabilité vient d'ailleurs, et c'est la seule protection réelle
-- ici : DROP NOT NULL est idempotent par nature, et le DO $$ ci-dessous rend
-- l'ajout de contrainte rejouable.
--
-- POURQUOI. L'écran d'inscription porte désormais DEUX champs de dénomination,
-- dont au moins un doit être rempli. Cela exige que le FRANÇAIS puisse être
-- vide : une société fédérale peut n'avoir qu'une version anglaise de sa
-- dénomination. Le certificat de constitution émis par Corporations Canada
-- permet quatre formes — français seul, anglais seul, un nom bilingue combiné,
-- ou deux versions distinctes juridiquement équivalentes. Le NOT NULL sur
-- legal_name_fr en interdisait deux.
--
-- ⚠️ LEVER L'OBLIGATION SANS LA REMPLACER OUVRIRAIT UN TROU PLUS GRAND QUE
-- CELUI QU'ELLE FERME. Aujourd'hui, ce NOT NULL est la SEULE chose qui empêche
-- une société sans aucun nom d'exister : mesuré 2026-09-01, ni legal_name_fr ni
-- legal_name_en ne portent de CHECK, d'index ou de défaut. Le retirer seul
-- laisserait passer une ligne muette que plus rien n'attraperait. La contrainte
-- ci-dessous prend le relais — et elle dit MIEUX que le NOT NULL ce que le
-- produit veut vraiment : ce n'est plus l'écran qui garantit qu'une société a
-- un nom, c'est la base.
--
-- BTRIM + NULLIF, ET NON UN SIMPLE IS NOT NULL. Le NOT NULL levé n'a jamais
-- rien dit sur la chaîne VIDE : '' le satisfaisait. Une garde qui se contente
-- de la non-nullité recopierait ce trou-là dans sa remplaçante. NULLIF(BTRIM(…),
-- '') ramène au même verdict la valeur nulle, la chaîne vide et la chaîne
-- d'espaces ; COALESCE accepte la ligne dès que L'UN des deux survit.
--
-- MESURÉ AVANT L'APPLICATION (2026-09-01) : 13 sociétés sur 13, aucune ne
-- violerait la contrainte. Les deux colonnes y sont identiques partout — aucun
-- vrai nom anglais n'existe encore.
--
-- ⚠️ CE QUE CECI NE RÈGLE PAS, et qu'il ne faut pas lire dans ce fichier :
--   · Le produit continue de RECOPIER le français dans l'anglais, aux deux
--     endroits qui écrivent ces colonnes — components/onboarding/
--     OnboardingFlow.tsx:198 et components/dashboard/SettingsClient.tsx:247.
--     Tant que ce code n'a pas changé, la contrainte ne peut jamais mordre :
--     les deux colonnes restent remplies ensemble. C'est l'étape 2 du lot.
--   · Aucune ligne existante n'est réparée ni modifiée. Il n'y avait rien à
--     reprendre.
--   · Rien ici ne dit LAQUELLE des deux versions un écran doit afficher. La
--     base autorise les quatre formes ; le choix d'affichage est une décision
--     de produit et ne vit pas dans une contrainte.
--   · legal_name_en n'est pas touchée : elle était déjà nullable.
-- =============================================================================

ALTER TABLE public.companies
  ALTER COLUMN legal_name_fr DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_legal_name_present'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_legal_name_present
      CHECK (
        COALESCE(
          NULLIF(BTRIM(legal_name_fr), ''),
          NULLIF(BTRIM(legal_name_en), '')
        ) IS NOT NULL
      );
  END IF;
END $$;
