-- Close cross-tenant access to the `documents` storage bucket.
-- Three leftover bucket-level permissive policies OR-nullify the existing
-- company-scoped policies (RLS is permissive/OR-combined). Dropping them
-- leaves the company-scoped policies ("Users can upload/read/delete own ...")
-- as the sole effective authority. No policy is added; documents-table RLS
-- is already company-scoped and untouched.
--
-- Context: docs/audit + #10/#2 Brief 1 Task 1 introspection (2026-06-04) found
-- six storage.objects policies on the `documents` bucket — three bucket-level
-- permissive (any authenticated user) and three company-scoped via
-- (storage.foldername(name))[1] IN (companies owned by auth.uid()). Because
-- Postgres RLS is permissive/OR-combined, the bucket-level trio grants every
-- authenticated user upload/read/delete on any company's objects, nullifying
-- the scoped trio. The original bucket-level policies were created in
-- 20260329000000_documents_vault.sql; the scoped trio was added later via the
-- Supabase Dashboard (not source-tracked). IF EXISTS keeps this idempotent.

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read documents"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
