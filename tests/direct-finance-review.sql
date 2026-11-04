-- Verify the migrated workflow without retaining approvals, reviews, or audit records.
BEGIN;
\ir helpers/test-session.sql
DO $$
DECLARE c public.claims; reviewer uuid; reviewer_role text; action_name text; v integer;
BEGIN
  SELECT * INTO STRICT c FROM public.claims WHERE status='PENDING_FINANCE_REVIEW' ORDER BY created_at DESC LIMIT 1;
  IF (SELECT count(*) FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id
      WHERE w.claim_id=c.id AND w.is_current) <> 1 THEN
    RAISE EXCEPTION 'Expected one current review step';
  END IF;
  PERFORM pg_temp.sign_in_as(COALESCE(c.submitted_by_user_id,c.claimant_id));
  FOREACH action_name IN ARRAY ARRAY['verify','approve'] LOOP
    BEGIN
      PERFORM public.nlcc_command(action_name,jsonb_build_object('claim_id',c.id,'version',c.version));
      RAISE EXCEPTION 'Self-review was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  FOREACH reviewer_role IN ARRAY ARRAY['FINANCE_OFFICER','SYSTEM_ADMIN'] LOOP
    SELECT p.id INTO reviewer FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id
      WHERE p.status='ACTIVE' AND r.code=reviewer_role
        AND p.id IS DISTINCT FROM c.submitted_by_user_id AND p.id IS DISTINCT FROM c.claimant_id
      LIMIT 1;
    IF reviewer IS NULL THEN RAISE EXCEPTION 'Missing independent reviewer for %',reviewer_role; END IF;
    BEGIN
      PERFORM pg_temp.sign_in_as(reviewer);
      PERFORM public.nlcc_command('verify',jsonb_build_object('claim_id',c.id,'version',c.version));
      SELECT version INTO v FROM public.claims WHERE id=c.id;
      PERFORM public.nlcc_command('approve',jsonb_build_object('claim_id',c.id,'version',v));
      IF NOT EXISTS (SELECT 1 FROM public.claims WHERE id=c.id AND status='APPROVED_FOR_PAYMENT') THEN
        RAISE EXCEPTION 'Finance approval did not advance directly to payment';
      END IF;
      IF EXISTS (SELECT 1 FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id
        WHERE w.claim_id=c.id AND w.is_current AND s.status IN ('PENDING','IN_PROGRESS')) THEN
        RAISE EXCEPTION 'Unexpected additional approval stage';
      END IF;
      -- Roll back this review so the next role tests the same pending claim.
      RAISE EXCEPTION 'rollback successful role check' USING ERRCODE='PZ001';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
    END;
  END LOOP;
END $$;
ROLLBACK;
