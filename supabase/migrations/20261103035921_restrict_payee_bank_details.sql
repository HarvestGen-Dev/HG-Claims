-- Keep bank details in the existing tables for finance and exports, but do not
-- disclose every saved payee's details to every signed-in workspace user.
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
          - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address'
      END
    ), '[]'::jsonb) INTO claims
    FROM jsonb_array_elements(result->'claims') c;
    result := jsonb_set(result, '{claims}', claims);
  END IF;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.redact_workspace_snapshot(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nlcc_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.redact_workspace_snapshot(private.snapshot());
$$;

CREATE OR REPLACE FUNCTION public.nlcc_domain_snapshot(p_domain text DEFAULT 'all') RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.redact_workspace_snapshot(private.domain_snapshot(p_domain));
$$;

-- The private functions previously remained directly executable by an
-- authenticated database role, bypassing the public redaction wrapper.
REVOKE ALL ON FUNCTION private.snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.domain_snapshot(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nlcc_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nlcc_domain_snapshot(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nlcc_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nlcc_domain_snapshot(text) TO authenticated;

-- All claim writes, including security-definer commands, pass this ownership
-- check. Existing historical rows are untouched.
CREATE OR REPLACE FUNCTION private.enforce_claim_payee_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.claimant_id IS NOT DISTINCT FROM OLD.claimant_id THEN
    RETURN NEW;
  END IF;
  IF NEW.claimant_id = caller OR private.has_role('FINANCE_OFFICER') OR private.has_role('SYSTEM_ADMIN') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = NEW.claimant_id AND p.status = 'ACTIVE'
      AND p.is_payee_only AND p.created_by_user_id = caller
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'This payee profile is not available to your account' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS enforce_claim_payee_access ON public.claims;
CREATE TRIGGER enforce_claim_payee_access
BEFORE INSERT OR UPDATE OF claimant_id ON public.claims
FOR EACH ROW EXECUTE FUNCTION private.enforce_claim_payee_access();

CREATE OR REPLACE FUNCTION private.enforce_payee_profile_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR NOT OLD.is_payee_only THEN RETURN NEW; END IF;
  IF OLD.id = caller OR OLD.created_by_user_id = caller
    OR private.has_role('FINANCE_OFFICER') OR private.has_role('SYSTEM_ADMIN') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'This payee profile cannot be changed by your account' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS enforce_payee_profile_owner ON public.profiles;
CREATE TRIGGER enforce_payee_profile_owner
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_payee_profile_owner();

REVOKE ALL ON FUNCTION private.enforce_claim_payee_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_payee_profile_owner() FROM PUBLIC, anon, authenticated;
