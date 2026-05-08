-- Allow preferred_theme to be NULL (means "automatic / follow OS")
-- The column may already exist with a NOT NULL or restrictive CHECK constraint.

-- Step 1: Add the column if it doesn't exist yet (no-op if already present)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_theme TEXT;

-- Step 2: Drop any existing CHECK constraint on preferred_theme
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%preferred_theme%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$$;

-- Step 3: Drop NOT NULL if present
ALTER TABLE public.users
  ALTER COLUMN preferred_theme DROP NOT NULL;

-- Step 4: Add a clean nullable CHECK constraint
ALTER TABLE public.users
  ADD CONSTRAINT users_preferred_theme_check
  CHECK (preferred_theme IS NULL OR preferred_theme IN ('light', 'dark', 'original'));
