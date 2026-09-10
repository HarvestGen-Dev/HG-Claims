-- Migration: 20260910000001_claimant_snapshot_receipt_cost_centres.sql
-- Description: Supports Ministry Head submitter model, per-claim claimant snapshot, receipt-level cost centres, and removes bank profile dependency.

-- 1. Alter claims table for submitter and claimant snapshot
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS claimant_name TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS claimant_email TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS claimant_phone TEXT;

-- Make historical/deprecated fields nullable
ALTER TABLE public.claims ALTER COLUMN claimant_id DROP NOT NULL;
ALTER TABLE public.claims ALTER COLUMN cost_centre_id DROP NOT NULL;
ALTER TABLE public.claims ALTER COLUMN programme_event DROP NOT NULL;
ALTER TABLE public.claims ALTER COLUMN payment_method DROP NOT NULL;

-- 2. Alter claim_expenses table for receipt-level cost centre
ALTER TABLE public.claim_expenses ADD COLUMN IF NOT EXISTS cost_centre_id UUID REFERENCES public.cost_centres(id) ON DELETE RESTRICT;

-- 3. Backfill historical claim_expenses cost_centre_id from claims.cost_centre_id
UPDATE public.claim_expenses ce
SET cost_centre_id = c.cost_centre_id
FROM public.claims c
WHERE ce.claim_id = c.id AND ce.cost_centre_id IS NULL AND c.cost_centre_id IS NOT NULL;

-- 4. Backfill historical claims submitter and claimant details from linked profiles
UPDATE public.claims c
SET
  submitted_by_user_id = COALESCE(c.submitted_by_user_id, c.claimant_id),
  claimant_name = COALESCE(c.claimant_name, p.full_name, 'Unknown Claimant'),
  claimant_email = COALESCE(c.claimant_email, p.email),
  claimant_phone = COALESCE(c.claimant_phone, p.phone)
FROM public.profiles p
WHERE c.claimant_id = p.id;

-- Fallback for any claims without a profile
UPDATE public.claims
SET
  submitted_by_user_id = COALESCE(submitted_by_user_id, claimant_id),
  claimant_name = COALESCE(claimant_name, 'Claimant')
WHERE claimant_name IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS claims_submitted_by_user_id_idx ON public.claims(submitted_by_user_id);
CREATE INDEX IF NOT EXISTS claim_expenses_cost_centre_id_idx ON public.claim_expenses(cost_centre_id);
CREATE INDEX IF NOT EXISTS claim_attachments_expense_id_idx ON public.claim_attachments(expense_id);

-- 5. Update RLS & Security Functions

-- can_read_claim: Submitter, assigned workflow users, Finance, Admin can read
CREATE OR REPLACE FUNCTION private.can_read_claim(claim_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.active_user() AND EXISTS (
    SELECT 1 FROM public.claims c WHERE c.id=claim_id AND (
      c.submitted_by_user_id=auth.uid() OR c.claimant_id=auth.uid() OR (c.status <> 'DRAFT' AND (
        private.has_role('SYSTEM_ADMIN') OR private.has_role('FINANCE_OFFICER') OR
        EXISTS (SELECT 1 FROM public.claim_workflow_steps s WHERE s.claim_id=c.id AND
          (s.assigned_user_id=auth.uid() OR (s.assigned_user_id IS NULL AND private.has_role(s.approver_role))))
      ))
    )
  );
$$;

-- build_workflow: Uses submitted_by_user_id for self-approval protection
CREATE OR REPLACE FUNCTION private.build_workflow(claim_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.claims; w uuid; seq integer=0; rule record; assignee uuid; threshold numeric; step_role text; submitter uuid;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT c FROM public.claims WHERE id=claim_id;
  submitter = COALESCE(c.submitted_by_user_id, c.claimant_id);
  UPDATE public.claim_workflows SET is_current=false WHERE public.claim_workflows.claim_id=c.id;
  INSERT INTO public.claim_workflows(claim_id,version) VALUES(c.id,
    COALESCE((SELECT max(version)+1 FROM public.claim_workflows WHERE public.claim_workflows.claim_id=c.id),1)) RETURNING id INTO w;
  threshold=COALESCE((SELECT (value->>'final_approval_threshold')::numeric FROM public.system_settings WHERE key='approval_thresholds'),500);
  
  FOR rule IN SELECT DISTINCT ON (r.sequence) r.* FROM public.approval_rules r
    WHERE r.is_active AND (r.ministry_id IS NULL OR r.ministry_id=c.ministry_id)
      AND r.min_amount<=c.total_amount AND (r.max_amount IS NULL OR r.max_amount>=c.total_amount)
      AND (r.expense_category_id IS NULL OR EXISTS (SELECT 1 FROM public.claim_expenses e WHERE e.claim_id=c.id AND e.expense_category_id=r.expense_category_id))
    ORDER BY r.sequence,r.priority DESC,r.id
  LOOP
    seq=seq+1;
    assignee=rule.approver_user_id;
    IF rule.approver_role='MINISTRY_LEADER' AND assignee IS NULL THEN
      SELECT leader_id INTO assignee FROM public.ministries WHERE id=c.ministry_id;
    END IF;
    IF rule.approver_role IN ('MINISTRY_LEADER','SPECIFIC_USER') AND assignee IS NULL THEN
      RAISE EXCEPTION 'Assign an approver to the ministry or workflow before submitting';
    END IF;
    -- Submitter cannot approve their own submission
    IF assignee=submitter OR (assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=assignee AND status='ACTIVE')) THEN
      -- Try fallback approver (e.g. Final Approver or Admin)
      SELECT p.id INTO assignee FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id
      WHERE p.status='ACTIVE' AND p.id<>submitter AND r.code IN ('FINAL_APPROVER','SYSTEM_ADMIN')
      ORDER BY r.code='FINAL_APPROVER' DESC LIMIT 1;
      IF assignee IS NULL THEN
        RAISE EXCEPTION 'The workflow needs an active approver other than the submitter';
      END IF;
    END IF;
    IF assignee IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id WHERE p.status='ACTIVE' AND p.id<>submitter AND r.code=rule.approver_role) THEN
      RAISE EXCEPTION 'No eligible approver is configured for %',rule.approver_role;
    END IF;
    INSERT INTO public.claim_workflow_steps(workflow_id,claim_id,sequence,step_name,approver_role,assigned_user_id,status,started_at)
    VALUES(w,c.id,seq,rule.name,rule.approver_role,assignee,CASE WHEN seq=1 THEN 'IN_PROGRESS' ELSE 'PENDING' END,CASE WHEN seq=1 THEN now() END);
  END LOOP;

  IF seq=0 THEN
    SELECT leader_id INTO assignee FROM public.ministries WHERE id=c.ministry_id;
    IF assignee IS NULL OR assignee=submitter OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=assignee AND status='ACTIVE') THEN
      SELECT p.id INTO assignee FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id
      WHERE p.status='ACTIVE' AND p.id<>submitter AND r.code IN ('FINAL_APPROVER','SYSTEM_ADMIN')
      ORDER BY r.code='FINAL_APPROVER' DESC LIMIT 1;
      IF assignee IS NULL THEN
        RAISE EXCEPTION 'Assign an active ministry leader or fallback approver other than the submitter';
      END IF;
    END IF;
    INSERT INTO public.claim_workflow_steps(workflow_id,claim_id,sequence,step_name,approver_role,assigned_user_id,status,started_at)
    VALUES(w,c.id,1,'Ministry approval','MINISTRY_LEADER',assignee,'IN_PROGRESS',now());
    FOREACH step_role IN ARRAY CASE WHEN c.total_amount>threshold THEN ARRAY['FINANCE_OFFICER','FINAL_APPROVER'] ELSE ARRAY['FINANCE_OFFICER'] END LOOP
      IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id WHERE p.status='ACTIVE' AND p.id<>submitter AND r.code=step_role) THEN
        RAISE EXCEPTION 'No eligible approver is configured for %',step_role;
      END IF;
      seq=seq+1;
      INSERT INTO public.claim_workflow_steps(workflow_id,claim_id,sequence,step_name,approver_role)
      VALUES(w,c.id,seq+1,CASE WHEN step_role='FINANCE_OFFICER' THEN 'Finance review' ELSE 'Final approval' END,step_role);
    END LOOP;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.claim_workflow_steps WHERE workflow_id=w AND approver_role='FINANCE_OFFICER') THEN
    RAISE EXCEPTION 'Every workflow must include finance review';
  END IF;
  IF c.total_amount>threshold AND NOT EXISTS(SELECT 1 FROM public.claim_workflow_steps WHERE workflow_id=w AND approver_role='FINAL_APPROVER') THEN
    RAISE EXCEPTION 'Claims above the threshold require final approval';
  END IF;
  SELECT approver_role INTO step_role FROM public.claim_workflow_steps WHERE workflow_id=w AND sequence=1;
  UPDATE public.claims SET status=CASE step_role WHEN 'FINANCE_OFFICER' THEN 'PENDING_FINANCE_REVIEW' WHEN 'FINAL_APPROVER' THEN 'PENDING_FINAL_APPROVAL' ELSE 'PENDING_MINISTRY_APPROVAL' END WHERE id=c.id;
END $$;

-- notify_claim: Uses submitted_by_user_id and claimant_name/purpose
CREATE OR REPLACE FUNCTION private.notify_claim(claim_id uuid, title text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.claims; submitter uuid;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT c FROM public.claims WHERE id=claim_id;
  submitter = COALESCE(c.submitted_by_user_id, c.claimant_id);
  INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
  SELECT DISTINCT p.id,c.id,c.status,title,COALESCE(c.claim_number,'Draft') || ': ' || COALESCE(c.claimant_name, c.purpose),
    CASE WHEN p.id=submitter THEN '/claims/' ELSE '/approvals/' END || c.id::text
  FROM public.profiles p WHERE p.status='ACTIVE' AND p.id<>auth.uid() AND (
    p.id=submitter OR EXISTS (
      SELECT 1 FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id AND w.is_current
      WHERE s.claim_id=c.id AND s.status='IN_PROGRESS' AND (s.assigned_user_id=p.id OR
        (s.assigned_user_id IS NULL AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p.id AND r.code=s.approver_role)))
    )
  );
END $$;

-- command: Core transactional state machine
CREATE OR REPLACE FUNCTION private.command(action text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid=auth.uid(); admin boolean; finance boolean; c public.claims; s public.claim_workflow_steps;
  next_step public.claim_workflow_steps; cid uuid; row_id uuid; item jsonb; config jsonb; total numeric;
  previous_status text; action_code text; table_name text; entity jsonb; submitter uuid;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  admin=private.has_role('SYSTEM_ADMIN'); finance=private.has_role('FINANCE_OFFICER');
  IF octet_length(payload::text)>1048576 THEN RAISE EXCEPTION 'Request is too large'; END IF;
  SELECT value INTO config FROM public.system_settings WHERE key='claim_form_config';
  config=COALESCE(config,'{}');

  IF action IN ('save_draft','submit_claim') THEN
    cid=NULLIF(payload->>'id','')::uuid;
    IF cid IS NULL AND payload->>'request_key' IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || (payload->>'request_key'),0));
      SELECT id INTO cid FROM public.claims WHERE (submitted_by_user_id=uid OR claimant_id=uid) AND request_key=(payload->>'request_key')::uuid;
      IF cid IS NOT NULL AND EXISTS(SELECT 1 FROM public.claims WHERE id=cid AND status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION')) THEN
        RETURN jsonb_build_object('id',cid);
      END IF;
    END IF;
    IF cid IS NOT NULL THEN
      SELECT * INTO c FROM public.claims WHERE id=cid FOR UPDATE;
      IF c.id IS NULL OR (c.submitted_by_user_id<>uid AND c.claimant_id<>uid) OR c.status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION') THEN
        RAISE EXCEPTION 'This claim cannot be edited' USING ERRCODE='42501';
      END IF;
      IF payload->>'version' IS NULL OR c.version<>(payload->>'version')::integer THEN
        RAISE EXCEPTION 'This claim changed. Refresh it before saving' USING ERRCODE='PT409';
      END IF;
    END IF;

    IF NOT EXISTS(SELECT 1 FROM public.ministries WHERE id=(payload->>'ministry_id')::uuid AND is_active) THEN
      RAISE EXCEPTION 'Choose an active ministry';
    END IF;
    IF jsonb_typeof(payload->'expenses') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid receipt list'; END IF;
    IF jsonb_array_length(payload->'expenses')>100 THEN RAISE EXCEPTION 'Invalid receipt list'; END IF;

    IF action='submit_claim' THEN
      IF NOT COALESCE((payload->>'declaration_accepted')::boolean,false) OR
        length(trim(COALESCE(payload->>'claimant_name','')))=0 OR length(trim(COALESCE(payload->>'purpose','')))=0 OR
        jsonb_array_length(payload->'expenses')=0 THEN
        RAISE EXCEPTION 'Complete the claimant name, purpose, receipts, and accept the declaration';
      END IF;
    END IF;

    previous_status=COALESCE(c.status,'DRAFT');
    IF cid IS NULL THEN
      INSERT INTO public.claims(
        submitted_by_user_id, claimant_id, claimant_name, claimant_email, claimant_phone,
        ministry_id, claim_date, purpose, internal_reference, request_key
      )
      VALUES(
        uid, uid, trim(COALESCE(payload->>'claimant_name','')),
        NULLIF(trim(COALESCE(payload->>'claimant_email','')),''),
        NULLIF(trim(COALESCE(payload->>'claimant_phone','')),''),
        (payload->>'ministry_id')::uuid,
        (payload->>'claim_date')::date,
        trim(payload->>'purpose'),
        NULLIF(trim(COALESCE(payload->>'internal_reference','')),''),
        NULLIF(payload->>'request_key','')::uuid
      )
      RETURNING id INTO cid;
    ELSE
      UPDATE public.claims SET
        submitted_by_user_id=COALESCE(c.submitted_by_user_id, uid),
        claimant_name=COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_name','')),''), c.claimant_name),
        claimant_email=NULLIF(trim(COALESCE(payload->>'claimant_email','')),''),
        claimant_phone=NULLIF(trim(COALESCE(payload->>'claimant_phone','')),''),
        ministry_id=(payload->>'ministry_id')::uuid,
        claim_date=(payload->>'claim_date')::date,
        purpose=trim(payload->>'purpose'),
        internal_reference=NULLIF(trim(COALESCE(payload->>'internal_reference','')),''),
        version=version+1,
        updated_at=now()
      WHERE id=cid;
    END IF;

    DELETE FROM public.claim_attachments WHERE claim_id=cid;
    DELETE FROM public.claim_expenses WHERE claim_id=cid;

    FOR item IN SELECT * FROM jsonb_array_elements(payload->'expenses') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.expense_categories WHERE id=(item->>'expense_category_id')::uuid AND is_active) THEN
        RAISE EXCEPTION 'Choose an active expense category';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.cost_centres WHERE id=(item->>'cost_centre_id')::uuid AND is_active AND (ministry_id IS NULL OR ministry_id=(payload->>'ministry_id')::uuid)) THEN
        RAISE EXCEPTION 'Choose an active cost centre matching the ministry';
      END IF;
      IF action='submit_claim' AND ((item->>'amount')::numeric<=0 OR length(trim(COALESCE(item->>'description','')))=0 OR
        (COALESCE((config->>'require_vendor_name')::boolean,false) AND length(trim(COALESCE(item->>'vendor','')))=0)) THEN
        RAISE EXCEPTION 'Each receipt needs a description, positive amount, and required vendor';
      END IF;
      IF (item->>'amount')::numeric <> round((item->>'amount')::numeric,2) THEN
        RAISE EXCEPTION 'Amounts must have at most two decimal places';
      END IF;

      INSERT INTO public.claim_expenses(
        claim_id, expense_date, expense_category_id, cost_centre_id, vendor, description, amount, sort_order
      )
      VALUES(
        cid, (item->>'expense_date')::date, (item->>'expense_category_id')::uuid,
        (item->>'cost_centre_id')::uuid, NULLIF(trim(COALESCE(item->>'vendor','')),''),
        trim(COALESCE(item->>'description','')), (item->>'amount')::numeric,
        COALESCE((item->>'sort_order')::integer, 0)
      )
      RETURNING id INTO row_id;

      -- Check individual receipt attachment if requirement is enabled
      IF action='submit_claim' AND COALESCE((config->>'require_receipt_for_all_expenses')::boolean,true) THEN
        IF (item->'attachment' IS NULL OR jsonb_typeof(item->'attachment') = 'null') AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(payload->'attachments','[]')) att
          WHERE att->>'temp_id' = item->>'temp_id' OR att->>'expense_temp_id' = item->>'temp_id' OR att->>'expense_id' = item->>'id'
        ) THEN
          RAISE EXCEPTION 'Receipt #%: Please upload the supporting receipt', COALESCE(item->>'sort_order','1');
        END IF;
      END IF;

      -- Save attached file for this receipt if embedded on item
      IF item ? 'attachment' AND item->'attachment' IS NOT NULL AND jsonb_typeof(item->'attachment') = 'object' THEN
        IF split_part(item->'attachment'->>'storage_path','/',1)<>uid::text OR NOT EXISTS(
          SELECT 1 FROM storage.objects o WHERE o.bucket_id='receipts' AND o.name=item->'attachment'->>'storage_path'
            AND (o.metadata->>'size')::bigint>0 AND (o.metadata->>'size')::bigint<=COALESCE((config->>'max_file_size_mb')::integer,10)*1048576
        ) THEN
          RAISE EXCEPTION 'Receipt file is missing, too large, or belongs to another account' USING ERRCODE='42501';
        END IF;

        INSERT INTO public.claim_attachments(claim_id, expense_id, storage_path, original_filename, mime_type, file_size, file_category, uploaded_by)
        SELECT cid, row_id, o.name, item->'attachment'->>'original_filename', o.metadata->>'mimetype', (o.metadata->>'size')::bigint, COALESCE(item->'attachment'->>'file_category','RECEIPT'), uid
        FROM storage.objects o WHERE o.bucket_id='receipts' AND o.name=item->'attachment'->>'storage_path'
        ON CONFLICT (storage_path) DO UPDATE SET expense_id = row_id;
      END IF;

      -- Also handle any matching attachments from payload->'attachments' by temp_id
      FOR entity IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'attachments','[]'))
        WHERE value->>'temp_id' = item->>'temp_id' OR value->>'expense_temp_id' = item->>'temp_id' OR value->>'expense_id' = item->>'id' LOOP
        IF split_part(entity->>'storage_path','/',1)<>uid::text OR NOT EXISTS(
          SELECT 1 FROM storage.objects o WHERE o.bucket_id='receipts' AND o.name=entity->>'storage_path'
            AND (o.metadata->>'size')::bigint>0 AND (o.metadata->>'size')::bigint<=COALESCE((config->>'max_file_size_mb')::integer,10)*1048576
        ) THEN
          RAISE EXCEPTION 'Receipt file is missing, too large, or belongs to another account' USING ERRCODE='42501';
        END IF;

        INSERT INTO public.claim_attachments(claim_id, expense_id, storage_path, original_filename, mime_type, file_size, file_category, uploaded_by)
        SELECT cid, row_id, o.name, entity->>'original_filename', o.metadata->>'mimetype', (o.metadata->>'size')::bigint, COALESCE(entity->>'file_category','RECEIPT'), uid
        FROM storage.objects o WHERE o.bucket_id='receipts' AND o.name=entity->>'storage_path'
        ON CONFLICT (storage_path) DO UPDATE SET expense_id = row_id;
      END LOOP;
    END LOOP;

    -- Authoritative server total calculation
    SELECT COALESCE(SUM(amount), 0) INTO total FROM public.claim_expenses WHERE claim_id=cid;
    UPDATE public.claims SET total_amount=total WHERE id=cid;

    IF action='submit_claim' THEN
      UPDATE public.claims SET claim_number=COALESCE(claim_number,public.generate_claim_number()),declaration_accepted=true,
        declaration_timestamp=now(),submitted_at=COALESCE(submitted_at,now()),resubmitted_at=CASE WHEN previous_status='RETURNED_FOR_CLARIFICATION' THEN now() END,
        clarification_reason=NULL,rejection_reason=NULL,status='SUBMITTED',updated_at=now() WHERE id=cid;
      PERFORM private.build_workflow(cid);
      INSERT INTO public.approval_actions(claim_id,actor_id,actor_role,action,previous_status,new_status)
      SELECT cid,uid,'MINISTRY_LEADER',CASE WHEN previous_status='RETURNED_FOR_CLARIFICATION' THEN 'RESUBMIT' ELSE 'SUBMIT' END,previous_status,status FROM public.claims WHERE id=cid;
      PERFORM private.notify_claim(cid,'Claim submitted');
    END IF;
    RETURN jsonb_build_object('id',cid);
  END IF;

  IF action IN ('approve','return','reject','verify','pay','correct','comment') THEN
    SELECT * INTO c FROM public.claims WHERE id=(payload->>'claim_id')::uuid FOR UPDATE;
    IF c.id IS NULL OR NOT private.can_read_claim(c.id) THEN RAISE EXCEPTION 'Claim not accessible' USING ERRCODE='42501'; END IF;
    IF action<>'comment' AND (payload->>'version' IS NULL OR c.version<>(payload->>'version')::integer) THEN RAISE EXCEPTION 'This claim changed. Refresh it before continuing' USING ERRCODE='PT409'; END IF;
    previous_status=c.status;
    submitter=COALESCE(c.submitted_by_user_id, c.claimant_id);
    SELECT st.* INTO s FROM public.claim_workflow_steps st JOIN public.claim_workflows w ON w.id=st.workflow_id AND w.is_current
    WHERE st.claim_id=c.id AND st.status='IN_PROGRESS' FOR UPDATE OF st;
    
    IF action IN ('approve','return','reject') THEN
      IF (submitter=uid OR c.claimant_id=uid) AND NOT admin THEN RAISE EXCEPTION 'You cannot approve your own submission' USING ERRCODE='42501'; END IF;
      IF s.id IS NULL OR NOT (admin OR (s.assigned_user_id IS NOT NULL AND s.assigned_user_id=uid) OR
        (s.assigned_user_id IS NULL AND private.has_role(s.approver_role))) THEN RAISE EXCEPTION 'You cannot approve this step' USING ERRCODE='42501'; END IF;
      IF action IN ('return','reject') AND length(trim(COALESCE(payload->>'reason','')))=0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
      IF action='approve' THEN
        IF s.approver_role='FINANCE_OFFICER' AND NOT EXISTS(SELECT 1 FROM public.finance_reviews WHERE claim_id=c.id AND status='VERIFIED' AND created_at>=COALESCE(c.resubmitted_at,c.submitted_at)) THEN RAISE EXCEPTION 'Verify receipts and allocations before finance approval'; END IF;
        UPDATE public.claim_workflow_steps SET status='COMPLETED',completed_at=now(),completed_by=uid,action_taken='APPROVE',comments=payload->>'reason' WHERE id=s.id;
        SELECT * INTO next_step FROM public.claim_workflow_steps WHERE workflow_id=s.workflow_id AND status='PENDING' ORDER BY sequence LIMIT 1;
        IF next_step.id IS NULL THEN c.status='APPROVED_FOR_PAYMENT';
        ELSE
          UPDATE public.claim_workflow_steps SET status='IN_PROGRESS',started_at=now() WHERE id=next_step.id;
          c.status=CASE next_step.approver_role WHEN 'FINANCE_OFFICER' THEN 'PENDING_FINANCE_REVIEW' WHEN 'FINAL_APPROVER' THEN 'PENDING_FINAL_APPROVAL' ELSE 'PENDING_MINISTRY_APPROVAL' END;
        END IF;
        action_code='APPROVE';
      ELSE
        c.status=CASE WHEN action='return' THEN 'RETURNED_FOR_CLARIFICATION' ELSE 'REJECTED' END;
        action_code=CASE WHEN action='return' THEN 'RETURN_FOR_CLARIFICATION' ELSE 'REJECT' END;
        UPDATE public.claim_workflow_steps SET status=CASE WHEN action='return' THEN 'RETURNED' ELSE 'REJECTED' END,completed_at=now(),completed_by=uid,comments=payload->>'reason',action_taken=action_code WHERE id=s.id;
        UPDATE public.claims SET clarification_reason=CASE WHEN action='return' THEN payload->>'reason' END,
          rejection_reason=CASE WHEN action='reject' THEN payload->>'reason' END,returned_by=CASE WHEN action='return' THEN uid END,
          returned_at=CASE WHEN action='return' THEN now() END WHERE id=c.id;
      END IF;
    ELSIF action='verify' THEN
      IF NOT (finance OR admin) OR submitter=uid OR c.claimant_id=uid OR c.status<>'PENDING_FINANCE_REVIEW' THEN RAISE EXCEPTION 'Finance verification is not allowed' USING ERRCODE='42501'; END IF;
      INSERT INTO public.finance_reviews(claim_id,reviewer_id,receipts_verified,category_verified,cost_centre_verified,notes)
      VALUES(c.id,uid,true,true,true,payload->>'reason'); action_code='VERIFY';
    ELSIF action='pay' THEN
      IF NOT (finance OR admin) OR submitter=uid OR c.claimant_id=uid OR c.status<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Payment is not allowed' USING ERRCODE='42501'; END IF;
      IF (payload->>'amount')::numeric IS DISTINCT FROM c.total_amount OR length(trim(COALESCE(payload->>'payment_reference','')))=0 THEN RAISE EXCEPTION 'Payment must match the approved total and include a reference'; END IF;
      INSERT INTO public.payments(claim_id,amount,payment_date,payment_reference,payment_method,notes,processed_by)
      VALUES(c.id,c.total_amount,(payload->>'payment_date')::date,trim(payload->>'payment_reference'),payload->>'payment_method',payload->>'notes',uid);
      c.status='PAID'; action_code='PAY';
    ELSIF action='correct' THEN
      IF NOT (finance OR admin) OR c.status='PAID' OR length(trim(COALESCE(payload->>'reason','')))=0 THEN RAISE EXCEPTION 'Correction not allowed or reason missing' USING ERRCODE='42501'; END IF;
      UPDATE public.claims SET internal_reference=COALESCE(payload->>'internal_reference',internal_reference) WHERE id=c.id;
      action_code='ADMIN_OVERRIDE';
    ELSE
      IF length(trim(COALESCE(payload->>'content','')))=0 OR length(payload->>'content')>5000 THEN RAISE EXCEPTION 'Comment must contain 1 to 5000 characters'; END IF;
      IF payload->>'visibility'='FINANCE_INTERNAL' AND NOT (finance OR admin) THEN RAISE EXCEPTION 'Internal notes are restricted' USING ERRCODE='42501'; END IF;
      IF payload->>'visibility' NOT IN ('PUBLIC_WORKFLOW','FINANCE_INTERNAL') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
      INSERT INTO public.claim_comments(claim_id,author_id,author_role,content,visibility) VALUES(c.id,uid,
        CASE WHEN admin THEN 'SYSTEM_ADMIN' WHEN finance THEN 'FINANCE_OFFICER' ELSE 'MINISTRY_LEADER' END,trim(payload->>'content'),payload->>'visibility');
      RETURN jsonb_build_object('id',c.id);
    END IF;
    UPDATE public.claims SET status=c.status,version=version+1,updated_at=now(),current_step_sequence=COALESCE(next_step.sequence,current_step_sequence) WHERE id=c.id;
    INSERT INTO public.approval_actions(claim_id,workflow_step_id,actor_id,actor_role,action,comment,previous_status,new_status)
    VALUES(c.id,s.id,uid,CASE WHEN admin THEN 'SYSTEM_ADMIN' WHEN finance THEN 'FINANCE_OFFICER' ELSE COALESCE(s.approver_role,'MINISTRY_LEADER') END,action_code,payload->>'reason',previous_status,c.status);
    PERFORM private.notify_claim(c.id,'Claim updated');
    RETURN jsonb_build_object('id',c.id);
  END IF;

  IF action='profile' THEN
    row_id=(payload->>'id')::uuid; entity=payload->'data';
    IF row_id<>uid AND NOT admin THEN RAISE EXCEPTION 'Profile access denied' USING ERRCODE='42501'; END IF;
    IF admin THEN
      PERFORM pg_advisory_xact_lock(710001);
      IF EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=row_id AND r.code='SYSTEM_ADMIN') AND
        ((entity ? 'roles' AND NOT (entity->'roles' ? 'SYSTEM_ADMIN')) OR COALESCE(entity->>'status','ACTIVE')<>'ACTIVE') AND
        (SELECT count(*) FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id WHERE p.status='ACTIVE' AND r.code='SYSTEM_ADMIN')<=1 THEN RAISE EXCEPTION 'Keep at least one active system administrator'; END IF;
      UPDATE public.profiles SET full_name=COALESCE(entity->>'full_name',full_name),status=COALESCE(entity->>'status',status),
        ministry_id=CASE WHEN entity ? 'ministry_id' THEN NULLIF(entity->>'ministry_id','')::uuid ELSE ministry_id END WHERE id=row_id;
      IF entity ? 'roles' THEN
        IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(entity->'roles') code WHERE NOT EXISTS(SELECT 1 FROM public.roles r WHERE r.code=code)) THEN RAISE EXCEPTION 'Unknown role'; END IF;
        DELETE FROM public.user_roles WHERE user_id=row_id;
        INSERT INTO public.user_roles(user_id,role_id) SELECT row_id,id FROM public.roles WHERE code IN (SELECT jsonb_array_elements_text(entity->'roles'));
      END IF;
    END IF;
    UPDATE public.profiles SET phone=COALESCE(entity->>'phone',phone),updated_at=now() WHERE id=row_id;
    RETURN jsonb_build_object('id',row_id);
  END IF;

  IF action='read_notifications' THEN
    UPDATE public.notifications SET is_read=true WHERE user_id=uid AND (payload->>'id' IS NULL OR id=(payload->>'id')::uuid);
    RETURN '{}';
  END IF;
  IF NOT admin THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF action='setting' THEN
    IF payload->>'key' IS NULL OR payload->>'key' NOT IN ('claim_numbering','approval_thresholds','organization_profile','notification_settings','claim_form_config') OR jsonb_typeof(payload->'value') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid setting'; END IF;
    IF payload->>'key'='approval_thresholds' AND NOT COALESCE((payload->'value'->>'final_approval_threshold')::numeric BETWEEN 0 AND 999999999,false) THEN RAISE EXCEPTION 'Invalid approval threshold'; END IF;
    IF payload->>'key'='claim_form_config' AND (NOT COALESCE((payload->'value'->>'max_file_size_mb')::integer BETWEEN 1 AND 20,false) OR NOT COALESCE((payload->'value'->>'max_attachment_count')::integer BETWEEN 1 AND 30,false)) THEN RAISE EXCEPTION 'Use 1-20 MB and 1-30 attachments'; END IF;
    INSERT INTO public.system_settings(key,value,updated_by) VALUES(payload->>'key',payload->'value',uid)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=uid,updated_at=now();
    RETURN '{}';
  END IF;
  IF action IN ('master_save','master_delete') THEN
    table_name=payload->>'table';
    IF table_name NOT IN ('ministries','expense_categories','cost_centres','approval_rules') THEN RAISE EXCEPTION 'Unknown table'; END IF;
    row_id=COALESCE(NULLIF(payload->>'id','')::uuid,gen_random_uuid());
    IF action='master_delete' THEN
      IF table_name<>'approval_rules' THEN RAISE EXCEPTION 'Deactivate master data instead of deleting it'; END IF;
      DELETE FROM public.approval_rules WHERE id=row_id;
    ELSE
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',table_name) INTO entity USING row_id;
      entity=COALESCE(entity,jsonb_build_object('created_at',now(),'is_active',true,'display_order',0,'min_amount',0,'sequence',1,'priority',0)) ||
        (payload->'data') || jsonb_build_object('id',row_id,'updated_at',now());
      IF table_name='approval_rules' AND ((entity->>'min_amount')::numeric<0 OR (entity->>'sequence')::integer<1 OR (entity->>'max_amount')::numeric<(entity->>'min_amount')::numeric) THEN RAISE EXCEPTION 'Invalid approval rule range or sequence'; END IF;
      IF payload->>'id' IS NULL THEN
        EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I,$1)',table_name,table_name) USING entity;
      ELSE
        IF table_name='ministries' THEN
          UPDATE public.ministries SET code=entity->>'code',name=entity->>'name',description=entity->>'description',leader_id=NULLIF(entity->>'leader_id','')::uuid,is_active=(entity->>'is_active')::boolean,updated_at=now() WHERE id=row_id;
        ELSIF table_name='expense_categories' THEN
          UPDATE public.expense_categories SET code=entity->>'code',name=entity->>'name',description=entity->>'description',display_order=(entity->>'display_order')::integer,is_active=(entity->>'is_active')::boolean,updated_at=now() WHERE id=row_id;
        ELSIF table_name='cost_centres' THEN
          UPDATE public.cost_centres SET code=entity->>'code',name=entity->>'name',description=entity->>'description',ministry_id=NULLIF(entity->>'ministry_id','')::uuid,is_active=(entity->>'is_active')::boolean,updated_at=now() WHERE id=row_id;
        ELSE
          UPDATE public.approval_rules SET name=entity->>'name',description=entity->>'description',ministry_id=NULLIF(entity->>'ministry_id','')::uuid,
            expense_category_id=NULLIF(entity->>'expense_category_id','')::uuid,min_amount=(entity->>'min_amount')::numeric,max_amount=NULLIF(entity->>'max_amount','')::numeric,
            sequence=(entity->>'sequence')::integer,approver_role=entity->>'approver_role',approver_user_id=NULLIF(entity->>'approver_user_id','')::uuid,
            is_active=(entity->>'is_active')::boolean,priority=(entity->>'priority')::integer,updated_at=now() WHERE id=row_id;
        END IF;
      END IF;
    END IF;
    RETURN jsonb_build_object('id',row_id);
  END IF;
  RAISE EXCEPTION 'Unknown command';
END $$;

-- snapshot: Project claims with submitter, claimant snapshot, and receipt cost centres
CREATE OR REPLACE FUNCTION private.snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; admin boolean; finance boolean;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  admin=private.has_role('SYSTEM_ADMIN'); finance=private.has_role('FINANCE_OFFICER');
  SELECT jsonb_build_object(
    'user_id',auth.uid(),
    'profiles',COALESCE((SELECT jsonb_agg(
      (CASE WHEN p.id=auth.uid() OR admin OR finance THEN to_jsonb(p)-'bank_name'-'bank_account_number' ELSE to_jsonb(p)-'bank_name'-'bank_account_number'-'phone'-'email' END) ||
      jsonb_build_object('roles',COALESCE((SELECT jsonb_agg(r.code) FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p.id),'[]'))
    ) FROM public.profiles p),'[]'),
    'ministries',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY name) FROM public.ministries m),'[]'),
    'categories',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY display_order,name) FROM public.expense_categories e),'[]'),
    'costCentres',COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc),'[]'),
    'approvalRules',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY sequence) FROM public.approval_rules r WHERE admin),'[]'),
    'systemSettings',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.system_settings s),'[]'),
    'notifications',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY created_at DESC) FROM public.notifications n WHERE user_id=auth.uid()),'[]'),
    'auditLogs',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT * FROM public.audit_logs WHERE admin OR finance ORDER BY created_at DESC LIMIT 1000) a),'[]'),
    'claims',COALESCE((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'submitted_by', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=COALESCE(c.submitted_by_user_id, c.claimant_id)),
      'claimant', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=c.claimant_id),
      'expenses',COALESCE((SELECT jsonb_agg(to_jsonb(e) || jsonb_build_object(
        'cost_centre', (SELECT to_jsonb(cc) FROM public.cost_centres cc WHERE cc.id=e.cost_centre_id),
        'attachments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.claim_attachments a WHERE a.expense_id=e.id), '[]')
      ) ORDER BY sort_order) FROM public.claim_expenses e WHERE claim_id=c.id),'[]'),
      'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.claim_attachments a WHERE claim_id=c.id),'[]'),
      'workflow_steps',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY sequence) FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id AND w.is_current WHERE s.claim_id=c.id),'[]'),
      'approval_actions',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at DESC) FROM public.approval_actions a WHERE claim_id=c.id),'[]'),
      'comments',COALESCE((SELECT jsonb_agg(to_jsonb(cm) ORDER BY created_at) FROM public.claim_comments cm WHERE claim_id=c.id AND (visibility='PUBLIC_WORKFLOW' OR admin OR (visibility='FINANCE_INTERNAL' AND finance))),'[]'),
      'finance_review',(SELECT to_jsonb(f) FROM public.finance_reviews f WHERE claim_id=c.id ORDER BY created_at DESC LIMIT 1),
      'payment',(SELECT to_jsonb(p) FROM public.payments p WHERE claim_id=c.id)
    ) ORDER BY c.created_at DESC) FROM public.claims c WHERE private.can_read_claim(c.id)),'[]')
  ) INTO result;
  RETURN result;
END $$;
