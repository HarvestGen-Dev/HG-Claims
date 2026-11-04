-- Real database regression checks; every mutation is rolled back.
BEGIN;
\ir helpers/test-session.sql
DO $$
DECLARE admin_id uuid; member_id uuid; c public.claims; snap jsonb; result jsonb; inv uuid; dummy uuid;
BEGIN
  SELECT p.id INTO STRICT admin_id FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id
    JOIN public.roles r ON r.id=ur.role_id WHERE p.status='ACTIVE' AND r.code='SYSTEM_ADMIN' LIMIT 1;
  SELECT id INTO STRICT member_id FROM public.profiles WHERE status='ACTIVE' AND id<>admin_id LIMIT 1;
  PERFORM pg_temp.sign_in_as(admin_id);
  -- Unknown actions must fail instead of returning a success with a null ID.
  BEGIN
    PERFORM public.nlcc_command('not_an_action','{}'); RAISE EXCEPTION 'Unknown action accepted' USING ERRCODE='PZ002';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  PERFORM public.nlcc_command('complete_onboarding','{"full_name":"Audit Name","phone":"123"}');
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=admin_id AND full_name='Audit Name' AND phone='123' AND onboarding_completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Onboarding did not persist'; END IF;
  result=public.nlcc_command('create_invitation',jsonb_build_object('role_code','FINANCE_OFFICER',
    'token_hash',repeat('a',64),'max_uses',1,'expires_in_days',1));
  inv=(result->>'id')::uuid;
  snap=public.nlcc_snapshot();
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'signupInvitations') i WHERE i ? 'token_hash') THEN
    RAISE EXCEPTION 'Invitation hash exposed in snapshot'; END IF;
  PERFORM public.nlcc_redeem_invitation(repeat('a',64),member_id);
  IF NOT EXISTS(SELECT 1 FROM public.signup_invitations WHERE id=inv AND use_count=1 AND NOT is_active) THEN
    RAISE EXCEPTION 'Invitation was not consumed'; END IF;
  BEGIN
    PERFORM public.nlcc_redeem_invitation(repeat('a',64),member_id);
    RAISE EXCEPTION 'Used invitation accepted' USING ERRCODE='PZ002';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  -- Administrators cannot erase submitted claims or their accounting history.
  SELECT * INTO c FROM public.claims WHERE status NOT IN ('DRAFT','CANCELLED') LIMIT 1;
  IF c.id IS NOT NULL THEN
    BEGIN
      PERFORM public.nlcc_command('delete_claim',jsonb_build_object('id',c.id));
      RAISE EXCEPTION 'Submitted claim deletion accepted' USING ERRCODE='PZ002';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF NOT EXISTS(SELECT 1 FROM public.claims WHERE id=c.id) THEN RAISE EXCEPTION 'Claim lost'; END IF;
  END IF;
  result=public.nlcc_command('master_save','{"table":"cost_centres","data":{"code":"AUDIT-TEMP","name":"Audit temporary centre","is_active":true}}');
  dummy=(result->>'id')::uuid;
  PERFORM public.nlcc_command('master_save',jsonb_build_object('table','cost_centres','id',dummy,'data','{"display_order":7,"is_active":false}'::jsonb));
  IF NOT EXISTS(SELECT 1 FROM public.cost_centres WHERE id=dummy AND name='Audit temporary centre' AND display_order=7 AND NOT is_active) THEN
    RAISE EXCEPTION 'Partial master update lost fields or display order'; END IF;
  PERFORM public.nlcc_command('master_delete',jsonb_build_object('table','cost_centres','id',dummy));
  IF EXISTS(SELECT 1 FROM public.cost_centres WHERE id=dummy) THEN RAISE EXCEPTION 'Master deletion failed'; END IF;
  IF has_function_privilege('anon','public.build_workflow(uuid,uuid,uuid,numeric)','EXECUTE') OR
     has_function_privilege('authenticated','public.nlcc_redeem_invitation(text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Privileged helper exposed'; END IF;
END $$;
ROLLBACK;
