-- Rollback-only regression test. Requires an active account with an unused uploaded
-- receipt and an active ministry/cost centre. No fixtures survive this transaction.
BEGIN;
DO $$
DECLARE
  actor uuid; ministry uuid; centre uuid; receipt jsonb; payload jsonb;
  saved jsonb; submitted jsonb; v_claim_id uuid; claim_version integer;
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
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
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
    SELECT 1 FROM public.claims WHERE id=v_claim_id AND status<>'DRAFT' AND submitted_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Draft was not submitted'; END IF;
  IF public.nlcc_command('submit_claim',payload)->>'id' IS DISTINCT FROM saved->>'id' THEN
    RAISE EXCEPTION 'Submission retry was not idempotent';
  END IF;
  BEGIN
    PERFORM public.nlcc_command('save_draft',payload || '{"request_key":"not-a-uuid"}'::jsonb);
    RAISE EXCEPTION 'Invalid request key was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Invalid request key format' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
