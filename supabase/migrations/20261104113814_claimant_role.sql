BEGIN;

-- Keep existing submitter grants. The older CLAIMANT row was assigned automatically
-- to new Auth users before invitation provisioning and did not grant claim creation.
CREATE OR REPLACE FUNCTION private.provision_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles(id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)));
  RETURN NEW;
END $$;

UPDATE public.profiles p
SET ministry_id = NULL, default_ministry_id = NULL, updated_at = now()
WHERE (p.ministry_id IS NOT NULL OR p.default_ministry_id IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p.id AND r.code = 'MINISTRY_LEADER'
  );

DELETE FROM public.roles WHERE code = 'CLAIMANT';
UPDATE public.roles
SET code = 'CLAIMANT', name = 'Claimant', description = 'Can submit claims and view their own claims'
WHERE code = 'MINISTRY_LEADER';

ALTER TABLE public.signup_invitations DROP CONSTRAINT signup_invitations_role_code_check;
UPDATE public.signup_invitations
SET role_code = 'CLAIMANT', ministry_id = NULL
WHERE role_code = 'MINISTRY_LEADER';
ALTER TABLE public.signup_invitations ADD CONSTRAINT signup_invitations_role_code_check
  CHECK (role_code IN ('CLAIMANT', 'FINANCE_OFFICER', 'SYSTEM_ADMIN'));

-- The previous migration owns the shared command body. Change its submitter
-- role and invitation branch in place, with checks to catch a different baseline.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('private.command(text,jsonb)'::regprocedure);
  ministry_check text := $old$    IF payload->>'role_code'='CLAIMANT' AND NOT EXISTS (
      SELECT 1 FROM public.ministries WHERE id=NULLIF(payload->>'ministry_id','')::uuid AND is_active
    ) THEN RAISE EXCEPTION 'Choose an active ministry for the Ministry Leader'; END IF;
$old$;
  ministry_assignment text := $old$CASE WHEN payload->>'role_code'='CLAIMANT' THEN (payload->>'ministry_id')::uuid END$old$;
BEGIN
  IF strpos(definition, $old$private.has_role('MINISTRY_LEADER')$old$) = 0 THEN
    RAISE EXCEPTION 'Unexpected claim command definition';
  END IF;
  definition := replace(definition, '''MINISTRY_LEADER''', '''CLAIMANT''');
  IF strpos(definition, ministry_check) = 0 OR strpos(definition, ministry_assignment) = 0 THEN
    RAISE EXCEPTION 'Unexpected invitation command definition';
  END IF;
  definition := replace(definition, ministry_check, '');
  definition := replace(definition, ministry_assignment, 'NULL');
  definition := replace(definition, 'Ministry Leader or System Admin access is required to submit claims', 'Claimant or System Admin access is required to submit claims');
  EXECUTE definition;
END $migration$;

-- The API server and administrator bootstrap use service-role table access.
GRANT SELECT ON public.roles, public.profiles, public.signup_invitations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_roles TO service_role;
GRANT UPDATE (is_multi_user, onboarding_completed_at) ON public.profiles TO service_role;

COMMIT;
