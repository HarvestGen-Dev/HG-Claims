-- Rollback-only regression test. Requires an active account with an unused uploaded
-- receipt and an active ministry/cost centre. No fixtures survive this transaction.
BEGIN;
\ir helpers/test-session.sql
DO $$
DECLARE
  actor uuid; ministry uuid; centre uuid; receipt jsonb; payload jsonb;
  saved jsonb; submitted jsonb; v_claim_id uuid; claim_version integer; reviewer uuid; snapshot jsonb;
BEGIN
  SELECT p.id, jsonb_build_object(
    'storage_path', o.name, 'original_filename', 'regression-receipt',
    'file_category', 'RECEIPT', 'temp_id', 'regression-receipt'
  ) INTO actor, receipt
  FROM storage.objects o JOIN public.profiles p ON p.id::text=split_part(o.name,'/',1)
  WHERE o.bucket_id='receipts' AND p.status='ACTIVE'
    AND (o.metadata->>'size')::bigint BETWEEN 1 AND 1048576
    AND NOT EXISTS (SELECT 1 FROM public.claim_attachments a WHERE a.storage_path=o.name)
  LIMIT 1;
  SELECT m.id, cc.id INTO ministry, centre
  FROM public.ministries m JOIN public.cost_centres cc ON cc.ministry_id=m.id OR cc.ministry_id IS NULL
  WHERE m.is_active AND cc.is_active LIMIT 1;
  IF actor IS NULL OR ministry IS NULL THEN
    RAISE EXCEPTION 'Regression prerequisites missing: active account, unused receipt, ministry/cost centre';
  END IF;
  PERFORM pg_temp.sign_in_as(actor);
  payload=jsonb_build_object(
    'request_key',gen_random_uuid(), 'ministry_id',ministry,
    'claimant_name','Rollback regression', 'claim_date',current_date,
    'purpose','Rollback save/submit verification', 'declaration_accepted',true,
    'expenses',jsonb_build_array(jsonb_build_object(
      'temp_id','regression-receipt', 'expense_date',current_date,
      'cost_centre_id',centre, 'description','Regression receipt',
      'vendor','Regression vendor', 'amount',1.25, 'sort_order',1,
      'attachment',receipt
    )), 'attachments',jsonb_build_array(receipt)
  );
  -- The real form always supplies a UUID request key and omits the category.
  saved=public.nlcc_command('save_draft',payload);
  v_claim_id=(saved->>'id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.claims WHERE id=v_claim_id AND status='DRAFT' AND total_amount=1.25) THEN
    RAISE EXCEPTION 'Draft was not saved correctly';
  END IF;
  IF (SELECT count(*) FROM public.claim_attachments WHERE claim_attachments.claim_id=v_claim_id) <> 1 THEN
    RAISE EXCEPTION 'Receipt was not attached exactly once';
  END IF;
  -- Avoid advancing the nontransactional claim-number sequence during this test.
  UPDATE public.claims SET claim_number='REGRESSION-' || v_claim_id::text WHERE id=v_claim_id;
  SELECT version INTO claim_version FROM public.claims WHERE id=v_claim_id;
  submitted=public.nlcc_command('submit_claim',payload || jsonb_build_object('id',v_claim_id,'version',claim_version));
  IF submitted->>'id' IS DISTINCT FROM saved->>'id' OR NOT EXISTS (
    SELECT 1 FROM public.claims WHERE id=v_claim_id AND status='PENDING_FINANCE_REVIEW' AND submitted_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Draft was not submitted'; END IF;
  IF (SELECT count(*) FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id
      WHERE w.claim_id=v_claim_id AND w.is_current) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id
    WHERE w.claim_id=v_claim_id AND w.is_current AND s.approver_role='FINANCE_OFFICER'
      AND s.status='IN_PROGRESS' AND s.assigned_user_id IS NULL
  ) THEN RAISE EXCEPTION 'Submission did not create one shared Finance Review step'; END IF;
  IF public.nlcc_command('submit_claim',payload)->>'id' IS DISTINCT FROM saved->>'id' THEN
    RAISE EXCEPTION 'Submission retry was not idempotent';
  END IF;
  BEGIN
    PERFORM public.nlcc_command('save_draft',payload || '{"request_key":"not-a-uuid"}'::jsonb);
    RAISE EXCEPTION 'Invalid request key was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Invalid request key format' THEN RAISE; END IF;
  END;
  SELECT p.id INTO STRICT reviewer FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id
    JOIN public.roles r ON r.id=ur.role_id WHERE p.status='ACTIVE' AND p.id<>actor AND r.code IN ('FINANCE_OFFICER','SYSTEM_ADMIN') LIMIT 1;
  PERFORM pg_temp.sign_in_as(reviewer);
  SELECT version INTO claim_version FROM public.claims WHERE id=v_claim_id;
  PERFORM public.nlcc_command('verify',jsonb_build_object('claim_id',v_claim_id,'version',claim_version));
  SELECT version INTO claim_version FROM public.claims WHERE id=v_claim_id;
  PERFORM public.nlcc_command('return',jsonb_build_object('claim_id',v_claim_id,'version',claim_version,'reason','Clarify receipt'));
  IF NOT EXISTS(SELECT 1 FROM public.claims WHERE id=v_claim_id AND clarification_reason='Clarify receipt' AND returned_by=reviewer) THEN
    RAISE EXCEPTION 'Return reason or reviewer was lost'; END IF;
  -- Make the previous review unambiguously older even within this single transaction.
  UPDATE public.finance_reviews SET created_at=now()-interval '1 day' WHERE claim_id=v_claim_id;
  PERFORM pg_temp.sign_in_as(actor);
  SELECT version INTO claim_version FROM public.claims WHERE id=v_claim_id;
  PERFORM public.nlcc_command('submit_claim',payload || jsonb_build_object('id',v_claim_id,'version',claim_version));
  snapshot=public.nlcc_snapshot();
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'claims') x WHERE x->>'id'=v_claim_id::text AND x->'finance_review'<>'null'::jsonb) THEN
    RAISE EXCEPTION 'Stale receipt verification survived resubmission'; END IF;
  PERFORM pg_temp.sign_in_as(reviewer);
  SELECT version INTO claim_version FROM public.claims WHERE id=v_claim_id;
  BEGIN
    PERFORM public.nlcc_command('approve',jsonb_build_object('claim_id',v_claim_id,'version',claim_version));
    RAISE EXCEPTION 'Approval accepted stale verification' USING ERRCODE='PZ002';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  PERFORM public.nlcc_command('verify',jsonb_build_object('claim_id',v_claim_id,'version',claim_version));
  SELECT version INTO claim_version FROM public.claims WHERE id=v_claim_id;
  PERFORM public.nlcc_command('approve',jsonb_build_object('claim_id',v_claim_id,'version',claim_version));
  SELECT version INTO claim_version FROM public.claims WHERE id=v_claim_id;
  PERFORM public.nlcc_command('pay',jsonb_build_object('claim_id',v_claim_id,'version',claim_version,'amount',1.25,
    'payment_date',current_date,'payment_reference','AUDIT-ROLLBACK','payment_method','BANK_TRANSFER'));
  IF NOT EXISTS(SELECT 1 FROM public.claims WHERE id=v_claim_id AND status='PAID') THEN RAISE EXCEPTION 'Payment was not recorded'; END IF;
  IF (SELECT count(*) FROM public.payments WHERE claim_id=v_claim_id) <> 1 THEN RAISE EXCEPTION 'Payment count incorrect'; END IF;
END $$;
ROLLBACK;
