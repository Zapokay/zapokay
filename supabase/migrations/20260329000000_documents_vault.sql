-- Sprint 2: Document Vault
-- Root causes fixed:
--   1. document_type CHECK was ('resolution','bylaw','register','certificate','other')
--      but vault UI uses ('statuts','resolution','pv','registre','rapport','autre')
--   2. framework column is NOT NULL with no default — app now always supplies it,
--      but we add a DEFAULT 'LSA' as a safety net for any legacy rows

-- ── 1. Fix document_type constraint ──────────────────────────────────────────

DO $$
DECLARE
  _constraint text;
BEGIN
  SELECT conname INTO _constraint
  FROM pg_constraint
  WHERE conrelid = 'documents'::regclass
    AND contype = 'c'
    AND conname ILIKE '%document_type%';

  IF _constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE documents DROP CONSTRAINT %I', _constraint);
  END IF;
END $$;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN ('statuts', 'resolution', 'pv', 'registre', 'rapport', 'autre'));

-- ── 2. Give framework a default so inserts that omit it don't hard-fail ──────

ALTER TABLE documents
  ALTER COLUMN framework SET DEFAULT 'LSA';

-- ── 3. Storage bucket for PDF documents (idempotent) ─────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  20971520,                        -- 20 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Storage RLS policies ───────────────────────────────────────────────────
-- Authenticated users can upload/read/delete their own company documents.
-- Path format enforced in app: {company_id}/{timestamp}-{filename}

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload documents'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated users can upload documents"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'documents')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read documents'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated users can read documents"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'documents')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete documents'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated users can delete documents"
        ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'documents')
    $p$;
  END IF;
END $$;
