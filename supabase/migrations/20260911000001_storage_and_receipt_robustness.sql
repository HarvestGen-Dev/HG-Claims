-- Migration: 20260911000001_storage_and_receipt_robustness.sql
-- Description: Fixes permission denied on claim_attachments, ensures receipts storage bucket
-- is configured with all document and image mime types, and defines SECURITY DEFINER storage policies.

-- 1. Grant necessary table and schema access to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_attachments TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 2. Ensure receipts bucket exists with comprehensive allowed mime types and 25MB limit
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ];

-- 3. Security Definer Helper for Receipt Access (runs with system privileges)
CREATE OR REPLACE FUNCTION private.can_read_receipt(path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (split_part(path, '/', 1) = auth.uid()::text)
  OR EXISTS (
    SELECT 1 FROM public.claim_attachments a
    JOIN public.claims c ON c.id = a.claim_id
    WHERE a.storage_path = path
      AND (
        c.submitted_by_user_id = auth.uid()
        OR c.claimant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid() AND r.code IN ('FINANCE_OFFICER', 'SYSTEM_ADMIN')
        )
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.code IN ('FINANCE_OFFICER', 'SYSTEM_ADMIN')
  );
$$;

REVOKE ALL ON FUNCTION private.can_read_receipt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_receipt(text) TO authenticated;

-- 4. Storage RLS Policies for receipts bucket
DROP POLICY IF EXISTS "receipt_upload" ON storage.objects;
DROP POLICY IF EXISTS "receipt_read" ON storage.objects;
DROP POLICY IF EXISTS "receipt_update" ON storage.objects;
DROP POLICY IF EXISTS "receipt_delete" ON storage.objects;

-- Allow authenticated users to upload receipts into their own user folder ({auth.uid()}/...)
CREATE POLICY "receipt_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );

-- Allow authenticated users to update/overwrite receipts in their own user folder
CREATE POLICY "receipt_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );

-- Allow authorized users to download receipts (uploader, associated claim viewers, finance, admin)
CREATE POLICY "receipt_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      split_part(name, '/', 1) = (SELECT auth.uid())::text
      OR private.can_read_receipt(name)
    )
  );

-- Allow users to delete their own uploaded receipt objects
CREATE POLICY "receipt_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );
