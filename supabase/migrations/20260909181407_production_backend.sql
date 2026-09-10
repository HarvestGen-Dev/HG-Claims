-- All writes use authenticated transactional commands. No browser has table-write privileges.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_claim_number(), public.instantiate_claim_workflow(uuid),
  public.has_role(uuid,text), public.is_admin(uuid), public.recalculate_claim_total() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.recalculate_claim_total() SET search_path = '';
ALTER FUNCTION public.generate_claim_number() SET search_path = '';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user FOREIGN KEY (id) REFERENCES auth.users(id);
ALTER TABLE public.claims ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE public.claims ADD COLUMN request_key uuid;
CREATE UNIQUE INDEX claims_request_key ON public.claims(claimant_id, request_key);
CREATE UNIQUE INDEX workflow_one_current ON public.claim_workflows(claim_id) WHERE is_current;
CREATE UNIQUE INDEX attachment_storage_path ON public.claim_attachments(storage_path);
CREATE INDEX workflow_assignee ON public.claim_workflow_steps(assigned_user_id, status);
CREATE INDEX comments_claim_visibility ON public.claim_comments(claim_id, visibility);
CREATE INDEX workflow_claim_current ON public.claim_workflows(claim_id, is_current);
CREATE INDEX reviews_claim ON public.finance_reviews(claim_id);
ALTER TABLE public.claim_expenses DROP CONSTRAINT claim_expenses_amount_check;
ALTER TABLE public.claim_expenses ADD CONSTRAINT claim_expenses_amount_check CHECK (amount >= 0);

CREATE FUNCTION private.has_role(role_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    JOIN public.profiles p ON p.id=ur.user_id
    WHERE p.id=auth.uid() AND p.status='ACTIVE' AND r.code=role_code
  );
$$;
CREATE FUNCTION private.active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='ACTIVE');
$$;
CREATE FUNCTION private.can_read_claim(claim_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.active_user() AND EXISTS (
    SELECT 1 FROM public.claims c WHERE c.id=claim_id AND (
      c.claimant_id=auth.uid() OR (c.status <> 'DRAFT' AND (
        private.has_role('SYSTEM_ADMIN') OR private.has_role('FINANCE_OFFICER') OR
        EXISTS (SELECT 1 FROM public.claim_workflow_steps s WHERE s.claim_id=c.id AND
          (s.assigned_user_id=auth.uid() OR (s.assigned_user_id IS NULL AND private.has_role(s.approver_role))))
      ))
    )
  );
$$;

CREATE FUNCTION private.provision_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Authorization is never taken from user-editable metadata.
  INSERT INTO public.profiles(id,email,full_name)
  VALUES (NEW.id,NEW.email,COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles(user_id,role_id) SELECT NEW.id,id FROM public.roles WHERE code='CLAIMANT';
  RETURN NEW;
END $$;
CREATE TRIGGER provision_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.provision_profile();

CREATE FUNCTION private.audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE before_value jsonb; after_value jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_value=to_jsonb(OLD) - 'bank_account_number'; END IF;
  IF TG_OP <> 'DELETE' THEN after_value=to_jsonb(NEW) - 'bank_account_number'; END IF;
  INSERT INTO public.audit_logs(actor_id,actor_name,actor_email,action,entity_type,entity_id,before_data,after_data)
  VALUES (auth.uid(),(SELECT full_name FROM public.profiles WHERE id=auth.uid()),
    (SELECT email FROM public.profiles WHERE id=auth.uid()),TG_OP,TG_TABLE_NAME,
    COALESCE(after_value->>'id',before_value->>'id'),before_value,after_value);
  RETURN NULL;
END $$;
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['profiles','user_roles','ministries','expense_categories','cost_centres',
    'approval_rules','system_settings','claims','claim_expenses','claim_attachments','claim_workflows',
    'claim_workflow_steps','approval_actions','finance_reviews','payments','claim_comments'] LOOP
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.audit_change()',name);
  END LOOP;
END $$;

CREATE FUNCTION private.build_workflow(claim_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.claims; w uuid; seq integer=0; rule record; assignee uuid; threshold numeric; step_role text;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT c FROM public.claims WHERE id=claim_id;
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
    IF assignee=c.claimant_id OR (assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=assignee AND status='ACTIVE')) THEN
      RAISE EXCEPTION 'The workflow needs an active approver other than the claimant';
    END IF;
    IF assignee IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id WHERE p.status='ACTIVE' AND p.id<>c.claimant_id AND r.code=rule.approver_role) THEN
      RAISE EXCEPTION 'No eligible approver is configured for %',rule.approver_role;
    END IF;
    INSERT INTO public.claim_workflow_steps(workflow_id,claim_id,sequence,step_name,approver_role,assigned_user_id,status,started_at)
    VALUES(w,c.id,seq,rule.name,rule.approver_role,assignee,CASE WHEN seq=1 THEN 'IN_PROGRESS' ELSE 'PENDING' END,CASE WHEN seq=1 THEN now() END);
  END LOOP;
  IF seq=0 THEN
    SELECT leader_id INTO assignee FROM public.ministries WHERE id=c.ministry_id;
    IF assignee IS NULL OR assignee=c.claimant_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=assignee AND status='ACTIVE') THEN
      RAISE EXCEPTION 'Assign an active ministry leader other than the claimant before submitting';
    END IF;
    INSERT INTO public.claim_workflow_steps(workflow_id,claim_id,sequence,step_name,approver_role,assigned_user_id,status,started_at)
    VALUES(w,c.id,1,'Ministry approval','MINISTRY_LEADER',assignee,'IN_PROGRESS',now());
    FOREACH step_role IN ARRAY CASE WHEN c.total_amount>threshold THEN ARRAY['FINANCE_OFFICER','FINAL_APPROVER'] ELSE ARRAY['FINANCE_OFFICER'] END LOOP
      IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id WHERE p.status='ACTIVE' AND p.id<>c.claimant_id AND r.code=step_role) THEN
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

CREATE FUNCTION private.notify_claim(claim_id uuid, title text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.claims;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT c FROM public.claims WHERE id=claim_id;
  INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
  SELECT DISTINCT p.id,c.id,c.status,title,COALESCE(c.claim_number,'Draft') || ': ' || c.programme_event,
    CASE WHEN p.id=c.claimant_id THEN '/claims/' ELSE '/approvals/' END || c.id::text
  FROM public.profiles p WHERE p.status='ACTIVE' AND p.id<>auth.uid() AND (
    p.id=c.claimant_id OR EXISTS (
      SELECT 1 FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id AND w.is_current
      WHERE s.claim_id=c.id AND s.status='IN_PROGRESS' AND (s.assigned_user_id=p.id OR
        (s.assigned_user_id IS NULL AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p.id AND r.code=s.approver_role)))
    )
  );
END $$;

CREATE FUNCTION private.command(action text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid=auth.uid(); admin boolean; finance boolean; c public.claims; s public.claim_workflow_steps;
  next_step public.claim_workflow_steps; cid uuid; row_id uuid; item jsonb; config jsonb; total numeric;
  previous_status text; action_code text; roles_count integer; table_name text; entity jsonb; result jsonb;
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
      SELECT id INTO cid FROM public.claims WHERE claimant_id=uid AND request_key=(payload->>'request_key')::uuid;
      IF cid IS NOT NULL AND EXISTS(SELECT 1 FROM public.claims WHERE id=cid AND status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION')) THEN
        RETURN jsonb_build_object('id',cid);
      END IF;
    END IF;
    IF cid IS NOT NULL THEN
      SELECT * INTO c FROM public.claims WHERE id=cid FOR UPDATE;
      IF c.id IS NULL OR c.claimant_id<>uid OR c.status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION') THEN
        RAISE EXCEPTION 'This claim cannot be edited' USING ERRCODE='42501';
      END IF;
      IF payload->>'version' IS NULL OR c.version<>(payload->>'version')::integer THEN
        RAISE EXCEPTION 'This claim changed. Refresh it before saving' USING ERRCODE='PT409';
      END IF;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ministries WHERE id=(payload->>'ministry_id')::uuid AND is_active) OR
       NOT EXISTS(SELECT 1 FROM public.cost_centres WHERE id=(payload->>'cost_centre_id')::uuid AND is_active AND (ministry_id IS NULL OR ministry_id=(payload->>'ministry_id')::uuid)) THEN
      RAISE EXCEPTION 'Choose an active ministry and matching cost centre';
    END IF;
    IF NOT COALESCE((config->>'allow_claimant_change_ministry')::boolean,true) AND
       (payload->>'ministry_id')::uuid IS DISTINCT FROM (SELECT ministry_id FROM public.profiles WHERE id=uid) THEN
      RAISE EXCEPTION 'Ministry changes are disabled' USING ERRCODE='42501';
    END IF;
    IF jsonb_typeof(payload->'expenses') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid expense list'; END IF;
    IF jsonb_array_length(payload->'expenses')>100 THEN RAISE EXCEPTION 'Invalid expense list'; END IF;
    IF jsonb_array_length(COALESCE(payload->'attachments','[]'))>COALESCE((config->>'max_attachment_count')::integer,15) THEN RAISE EXCEPTION 'Too many attachments'; END IF;
    IF action='submit_claim' THEN
      IF NOT COALESCE((payload->>'declaration_accepted')::boolean,false) OR
        length(trim(COALESCE(payload->>'programme_event','')))=0 OR length(trim(COALESCE(payload->>'purpose','')))=0 OR
        jsonb_array_length(payload->'expenses')=0 THEN RAISE EXCEPTION 'Complete the claim and accept the declaration'; END IF;
      IF COALESCE((config->>'require_receipt_for_all_expenses')::boolean,true) AND jsonb_array_length(COALESCE(payload->'attachments','[]'))=0 THEN RAISE EXCEPTION 'A supporting receipt is required'; END IF;
      IF config ? 'allowed_payment_methods' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config->'allowed_payment_methods') pm WHERE pm->>'code'=payload->>'payment_method' AND COALESCE((pm->>'enabled')::boolean,true)) THEN RAISE EXCEPTION 'Payment method is disabled'; END IF;
    END IF;
    previous_status=COALESCE(c.status,'DRAFT');
    IF cid IS NULL THEN
      INSERT INTO public.claims(claimant_id,ministry_id,cost_centre_id,programme_event,claim_date,purpose,payment_method,internal_reference,request_key)
      VALUES(uid,(payload->>'ministry_id')::uuid,(payload->>'cost_centre_id')::uuid,payload->>'programme_event',
        (payload->>'claim_date')::date,payload->>'purpose',payload->>'payment_method',payload->>'internal_reference',NULLIF(payload->>'request_key','')::uuid)
      RETURNING id INTO cid;
    ELSE
      UPDATE public.claims SET ministry_id=(payload->>'ministry_id')::uuid,cost_centre_id=(payload->>'cost_centre_id')::uuid,
        programme_event=payload->>'programme_event',claim_date=(payload->>'claim_date')::date,purpose=payload->>'purpose',
        payment_method=payload->>'payment_method',internal_reference=payload->>'internal_reference',version=version+1,updated_at=now() WHERE id=cid;
    END IF;
    DELETE FROM public.claim_expenses WHERE claim_id=cid;
    FOR item IN SELECT * FROM jsonb_array_elements(payload->'expenses') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.expense_categories WHERE id=(item->>'expense_category_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Choose an active expense category'; END IF;
      IF action='submit_claim' AND ((item->>'amount')::numeric<=0 OR length(trim(COALESCE(item->>'description','')))=0 OR
        (COALESCE((config->>'require_vendor_name')::boolean,false) AND length(trim(COALESCE(item->>'vendor','')))=0)) THEN RAISE EXCEPTION 'Each expense needs a description, positive amount, and required vendor'; END IF;
      IF (item->>'amount')::numeric <> round((item->>'amount')::numeric,2) THEN RAISE EXCEPTION 'Amounts must have at most two decimal places'; END IF;
      INSERT INTO public.claim_expenses(claim_id,expense_date,expense_category_id,vendor,description,amount,notes,sort_order)
      VALUES(cid,(item->>'expense_date')::date,(item->>'expense_category_id')::uuid,item->>'vendor',COALESCE(item->>'description',''),
        (item->>'amount')::numeric,item->>'notes',COALESCE((item->>'sort_order')::integer,0));
    END LOOP;
    DELETE FROM public.claim_attachments WHERE claim_id=cid;
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'attachments','[]')) LOOP
      IF split_part(item->>'storage_path','/',1)<>uid::text OR NOT EXISTS(
        SELECT 1 FROM storage.objects o WHERE o.bucket_id='receipts' AND o.name=item->>'storage_path'
          AND (o.metadata->>'size')::bigint>0 AND (o.metadata->>'size')::bigint<=COALESCE((config->>'max_file_size_mb')::integer,10)*1048576
      ) THEN RAISE EXCEPTION 'Receipt is missing, too large, or belongs to another account' USING ERRCODE='42501'; END IF;
      INSERT INTO public.claim_attachments(claim_id,storage_path,original_filename,mime_type,file_size,file_category,uploaded_by)
      SELECT cid,o.name,item->>'original_filename',o.metadata->>'mimetype',(o.metadata->>'size')::bigint,COALESCE(item->>'file_category','RECEIPT'),uid
      FROM storage.objects o WHERE o.bucket_id='receipts' AND o.name=item->>'storage_path';
    END LOOP;
    IF action='submit_claim' THEN
      UPDATE public.claims SET claim_number=COALESCE(claim_number,public.generate_claim_number()),declaration_accepted=true,
        declaration_timestamp=now(),submitted_at=COALESCE(submitted_at,now()),resubmitted_at=CASE WHEN previous_status='RETURNED_FOR_CLARIFICATION' THEN now() END,
        clarification_reason=NULL,rejection_reason=NULL,status='SUBMITTED',updated_at=now() WHERE id=cid;
      PERFORM private.build_workflow(cid);
      INSERT INTO public.approval_actions(claim_id,actor_id,actor_role,action,previous_status,new_status)
      SELECT cid,uid,'CLAIMANT',CASE WHEN previous_status='RETURNED_FOR_CLARIFICATION' THEN 'RESUBMIT' ELSE 'SUBMIT' END,previous_status,status FROM public.claims WHERE id=cid;
      PERFORM private.notify_claim(cid,'Claim submitted');
    END IF;
    RETURN jsonb_build_object('id',cid);
  END IF;

  IF action IN ('approve','return','reject','verify','pay','correct','comment') THEN
    SELECT * INTO c FROM public.claims WHERE id=(payload->>'claim_id')::uuid FOR UPDATE;
    IF c.id IS NULL OR NOT private.can_read_claim(c.id) THEN RAISE EXCEPTION 'Claim not accessible' USING ERRCODE='42501'; END IF;
    IF action<>'comment' AND (payload->>'version' IS NULL OR c.version<>(payload->>'version')::integer) THEN RAISE EXCEPTION 'This claim changed. Refresh it before continuing' USING ERRCODE='PT409'; END IF;
    previous_status=c.status;
    SELECT st.* INTO s FROM public.claim_workflow_steps st JOIN public.claim_workflows w ON w.id=st.workflow_id AND w.is_current
    WHERE st.claim_id=c.id AND st.status='IN_PROGRESS' FOR UPDATE OF st;
    IF action IN ('approve','return','reject') THEN
      IF c.claimant_id=uid OR s.id IS NULL OR NOT (admin OR (s.assigned_user_id IS NOT NULL AND s.assigned_user_id=uid) OR
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
      IF NOT (finance OR admin) OR c.claimant_id=uid OR c.status<>'PENDING_FINANCE_REVIEW' THEN RAISE EXCEPTION 'Finance verification is not allowed' USING ERRCODE='42501'; END IF;
      INSERT INTO public.finance_reviews(claim_id,reviewer_id,receipts_verified,category_verified,cost_centre_verified,notes)
      VALUES(c.id,uid,true,true,true,payload->>'reason'); action_code='VERIFY';
    ELSIF action='pay' THEN
      IF NOT (finance OR admin) OR c.claimant_id=uid OR c.status<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Payment is not allowed' USING ERRCODE='42501'; END IF;
      IF (payload->>'amount')::numeric IS DISTINCT FROM c.total_amount OR length(trim(COALESCE(payload->>'payment_reference','')))=0 THEN RAISE EXCEPTION 'Payment must match the approved total and include a reference'; END IF;
      INSERT INTO public.payments(claim_id,amount,payment_date,payment_reference,payment_method,notes,processed_by)
      VALUES(c.id,c.total_amount,(payload->>'payment_date')::date,trim(payload->>'payment_reference'),payload->>'payment_method',payload->>'notes',uid);
      c.status='PAID'; action_code='PAY';
    ELSIF action='correct' THEN
      IF NOT (finance OR admin) OR c.status='PAID' OR length(trim(COALESCE(payload->>'reason','')))=0 THEN RAISE EXCEPTION 'Correction not allowed or reason missing' USING ERRCODE='42501'; END IF;
      IF payload->>'cost_centre_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centres WHERE id=(payload->>'cost_centre_id')::uuid AND is_active AND (ministry_id IS NULL OR ministry_id=c.ministry_id)) THEN RAISE EXCEPTION 'Cost centre does not match ministry'; END IF;
      UPDATE public.claims SET cost_centre_id=COALESCE((payload->>'cost_centre_id')::uuid,cost_centre_id),
        internal_reference=COALESCE(payload->>'internal_reference',internal_reference) WHERE id=c.id; action_code='ADMIN_OVERRIDE';
    ELSE
      IF length(trim(COALESCE(payload->>'content','')))=0 OR length(payload->>'content')>5000 THEN RAISE EXCEPTION 'Comment must contain 1 to 5000 characters'; END IF;
      IF payload->>'visibility'='FINANCE_INTERNAL' AND NOT (finance OR admin) THEN RAISE EXCEPTION 'Internal notes are restricted' USING ERRCODE='42501'; END IF;
      IF payload->>'visibility' NOT IN ('PUBLIC_WORKFLOW','FINANCE_INTERNAL') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
      INSERT INTO public.claim_comments(claim_id,author_id,author_role,content,visibility) VALUES(c.id,uid,
        CASE WHEN admin THEN 'SYSTEM_ADMIN' WHEN finance THEN 'FINANCE_OFFICER' ELSE 'CLAIMANT' END,trim(payload->>'content'),payload->>'visibility');
      RETURN jsonb_build_object('id',c.id);
    END IF;
    UPDATE public.claims SET status=c.status,version=version+1,updated_at=now(),current_step_sequence=COALESCE(next_step.sequence,current_step_sequence) WHERE id=c.id;
    INSERT INTO public.approval_actions(claim_id,workflow_step_id,actor_id,actor_role,action,comment,previous_status,new_status)
    VALUES(c.id,s.id,uid,CASE WHEN admin THEN 'SYSTEM_ADMIN' WHEN finance THEN 'FINANCE_OFFICER' ELSE COALESCE(s.approver_role,'CLAIMANT') END,action_code,payload->>'reason',previous_status,c.status);
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
    UPDATE public.profiles SET phone=COALESCE(entity->>'phone',phone),bank_name=COALESCE(entity->>'bank_name',bank_name),
      bank_account_number=COALESCE(entity->>'bank_account_number',bank_account_number),updated_at=now() WHERE id=row_id;
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

CREATE FUNCTION private.snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; admin boolean; finance boolean;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  admin=private.has_role('SYSTEM_ADMIN'); finance=private.has_role('FINANCE_OFFICER');
  SELECT jsonb_build_object(
    'user_id',auth.uid(),
    'profiles',COALESCE((SELECT jsonb_agg(
      (CASE WHEN p.id=auth.uid() OR admin OR finance THEN to_jsonb(p) ELSE to_jsonb(p)-'bank_name'-'bank_account_number'-'phone'-'email' END) ||
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
      'expenses',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order) FROM public.claim_expenses e WHERE claim_id=c.id),'[]'),
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

CREATE FUNCTION public.nlcc_snapshot() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.snapshot(); $$;
CREATE FUNCTION public.nlcc_command(action text,payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.command(action,payload); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.snapshot(),private.command(text,jsonb),private.active_user(),private.can_read_claim(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.nlcc_snapshot(), public.nlcc_command(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nlcc_snapshot(), public.nlcc_command(text,jsonb) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('receipts','receipts',false,20971520,ARRAY['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE FUNCTION private.can_read_receipt(path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.active_user() AND (split_part(path,'/',1)=auth.uid()::text OR EXISTS(
    SELECT 1 FROM public.claim_attachments a WHERE a.storage_path=path AND private.can_read_claim(a.claim_id)
  ));
$$;
REVOKE ALL ON FUNCTION private.can_read_receipt(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_read_receipt(text) TO authenticated;
CREATE POLICY receipt_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK
  (bucket_id='receipts' AND (select private.active_user()) AND (storage.foldername(name))[1]=(select auth.uid())::text);
CREATE POLICY receipt_read ON storage.objects FOR SELECT TO authenticated USING
  (bucket_id='receipts' AND private.can_read_receipt(name));
