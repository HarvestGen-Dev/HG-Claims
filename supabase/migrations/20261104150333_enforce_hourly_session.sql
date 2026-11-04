BEGIN;

-- A refresh changes the JWT, but preserves the original Auth session ID.
CREATE FUNCTION private.session_expires_at() RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.created_at + interval '1 hour'
  FROM auth.sessions s
  WHERE s.id = NULLIF(auth.jwt()->>'session_id', '')::uuid
    AND s.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION private.session_expires_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.session_expires_at() TO authenticated;

CREATE FUNCTION public.hg_session_expires_at() RETURNS timestamptz
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.session_expires_at();
$$;
REVOKE ALL ON FUNCTION public.hg_session_expires_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hg_session_expires_at() TO authenticated;

CREATE OR REPLACE FUNCTION private.active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(private.session_expires_at() > statement_timestamp(), false)
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'ACTIVE');
$$;

-- Use the guarded RPCs for business data. Server-only service grants are separate.
REVOKE ALL ON public.profiles, public.claims, public.claim_attachments,
  public.signup_invitations, public.audit_logs FROM anon, authenticated;

CREATE POLICY receipt_active_session ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING (bucket_id <> 'receipts' OR (SELECT private.active_user()))
WITH CHECK (bucket_id <> 'receipts' OR (SELECT private.active_user()));

-- Receipt previews use authenticated downloads. Don't mint bearer links that
-- would outlive the session or bypass claim ownership checks when opened.
CREATE POLICY receipt_no_signed_urls ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING (bucket_id <> 'receipts' OR NOT storage.allow_any_operation(
  ARRAY['object.sign', 'object.sign_many', 'object.sign_upload_url']
))
WITH CHECK (bucket_id <> 'receipts' OR NOT storage.allow_any_operation(
  ARRAY['object.sign', 'object.sign_many', 'object.sign_upload_url']
));

CREATE OR REPLACE FUNCTION private.can_read_receipt(path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.active_user() AND (
    split_part(path, '/', 1) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.claim_attachments a
      JOIN public.claims c ON c.id = a.claim_id
      WHERE a.storage_path = path AND (
        c.submitted_by_user_id = auth.uid() OR c.claimant_id = auth.uid()
        OR (c.status <> 'DRAFT' AND (
          private.has_role('FINANCE_OFFICER') OR private.has_role('SYSTEM_ADMIN')
        ))
      )
    )
  );
$$;

-- The frozen payment snapshot also contains account numbers and identifiers.
CREATE OR REPLACE FUNCTION private.redact_workspace_snapshot(p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb := p_snapshot;
  caller uuid := auth.uid();
  privileged boolean := private.has_role('FINANCE_OFFICER') OR private.has_role('SYSTEM_ADMIN');
  profiles jsonb;
  claims jsonb;
BEGIN
  IF NOT private.active_user() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  IF result ? 'profiles' THEN
    SELECT COALESCE(jsonb_agg(
      CASE WHEN privileged OR p->>'id' = caller::text OR p->>'created_by_user_id' = caller::text
        THEN p
        ELSE p - 'bank_name' - 'bank_code' - 'bank_account_holder_name'
          - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic'
          - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address'
          - 'phone' - 'email'
      END
    ), '[]'::jsonb) INTO profiles
    FROM jsonb_array_elements(result->'profiles') p;
    result := jsonb_set(result, '{profiles}', profiles);
  END IF;

  -- Historical workflows may allow a non-finance reviewer to read a claim.
  -- Such review does not require the claimant's payment identifiers.
  IF result ? 'claims' AND NOT privileged THEN
    SELECT COALESCE(jsonb_agg(
      CASE WHEN c->>'claimant_id' = caller::text OR c->>'submitted_by_user_id' = caller::text
        THEN c
        ELSE c - 'bank_name' - 'bank_code' - 'bank_account_holder_name'
          - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic'
          - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address' - 'approved_snapshot'
      END
    ), '[]'::jsonb) INTO claims
    FROM jsonb_array_elements(result->'claims') c;
    result := jsonb_set(result, '{claims}', claims);
  END IF;

  RETURN result;
END $$;

COMMIT;
