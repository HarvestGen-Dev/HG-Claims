-- Migration: 20260911000001_storage_and_receipt_robustness.sql
-- Description: Ensures receipts storage bucket is configured with all document and image mime types,
-- and aligns RLS policies with direct split_part path checks.

-- 1. Ensure receipts bucket exists with comprehensive allowed mime types and 25MB limit
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

-- 2. Storage RLS Policies for receipts bucket
DROP POLICY IF EXISTS "receipt_upload" ON storage.objects;
DROP POLICY IF EXISTS "receipt_read" ON storage.objects;
DROP POLICY IF EXISTS "receipt_update" ON storage.objects;
DROP POLICY IF EXISTS "receipt_delete" ON storage.objects;

-- Allow authenticated active users to upload receipts into their own folder ({auth.uid()}/...)
CREATE POLICY "receipt_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );

-- Allow authenticated active users to update/overwrite receipts in their own folder
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

-- Allow authorized users to download receipts (uploader or any role permitted to view the associated claim)
CREATE POLICY "receipt_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      split_part(name, '/', 1) = (SELECT auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.claim_attachments a
        JOIN public.claims c ON c.id = a.claim_id
        WHERE a.storage_path = name
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('FINANCE_OFFICER', 'SYSTEM_ADMIN')
      )
    )
  );

-- Allow users to delete their own uploaded receipt objects
CREATE POLICY "receipt_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  );
