-- Enable the supplied Alliance JomPay_Bulk_Sample_B1.xlsx contract.
-- Additive: keep old batch snapshots, fingerprints and template versions unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION private.finalize_jompay_v2(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE ids uuid[];c public.claims;bid uuid;iid uuid;line integer=0;amount bigint;cfg jsonb;j jsonb;num text;
BEGIN
 IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(720001);
 IF payload->>'request_key' IS NOT NULL THEN SELECT id INTO bid FROM public.reimbursement_batches WHERE request_key=(payload->>'request_key')::uuid;IF bid IS NOT NULL THEN RETURN jsonb_build_object('id',bid); END IF;END IF;
 IF jsonb_typeof(payload->'claim_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'claim_ids')=0 THEN RAISE EXCEPTION 'Select approved JomPAY claims'; END IF;
 SELECT array_agg(DISTINCT value::uuid) INTO ids FROM jsonb_array_elements_text(payload->'claim_ids');
 IF (SELECT count(*) FROM (SELECT id FROM public.claims WHERE id=ANY(ids) ORDER BY id FOR UPDATE) x)<>cardinality(ids) THEN RAISE EXCEPTION 'Claim missing'; END IF;
 FOR c IN SELECT * FROM public.claims WHERE id=ANY(ids) LOOP
 IF c.status<>'APPROVED_FOR_PAYMENT' OR c.payee_payment_method<>'JOMPAY' OR c.active_batch_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.payments WHERE claim_id=c.id) OR EXISTS(SELECT 1 FROM public.reimbursement_instruction_claims WHERE claim_id=c.id AND is_active) THEN RAISE EXCEPTION 'Select eligible JomPAY claims only' USING ERRCODE='PT409'; END IF;
 j=c.approved_snapshot->'jompay';
 IF COALESCE(j->>'biller_code','')!~'^[0-9]+$' OR nullif(trim(j->>'reference_1'),'') IS NULL THEN RAISE EXCEPTION 'Invalid frozen JomPAY Biller Code or Reference 1'; END IF;
 END LOOP;
 SELECT sum(round(total_amount*100)::bigint) INTO amount FROM public.claims WHERE id=ANY(ids);
 SELECT value INTO cfg FROM public.system_settings WHERE key='jompay_export_config';
 num='HG-JOMPAY-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.reimbursement_batch_seq')::text,4,'0');
 INSERT INTO public.reimbursement_batches(batch_number,status,template_version,payment_method,claim_count,transfer_count,total_amount_cents,total_amount,content_digest_sha256,created_by,request_key,notes)
 VALUES(num,'FINALIZED','JOMPAY_BULK_B1_XLSX_V1','JOMPAY',cardinality(ids),cardinality(ids),amount,amount/100.0,encode(extensions.digest((SELECT jsonb_agg(approved_snapshot ORDER BY id)::text FROM public.claims WHERE id=ANY(ids)),'sha256'),'hex'),auth.uid(),nullif(payload->>'request_key','')::uuid,payload->>'notes') RETURNING id INTO bid;
 -- Deliberately one instruction per bill: never group by payee.
 FOR c IN SELECT * FROM public.claims WHERE id=ANY(ids) ORDER BY created_at,id LOOP
 line=line+1;j=c.approved_snapshot->'jompay' || jsonb_build_object('fail_email_1',cfg->>'fail_email_1','fail_email_2',COALESCE(cfg->>'fail_email_2',''));
 INSERT INTO public.reimbursement_batch_instructions(batch_id,line_order,payment_description,payment_mode,beneficiary_user_id,beneficiary_name,beneficiary_account_number,beneficiary_bank_name,beneficiary_bank_code,amount_cents,amount,claim_count,status,jompay_snapshot)
 VALUES(bid,line,private.next_payment_description(),'JOMPAY',c.claimant_id,j->>'biller_name','','','',round(c.total_amount*100)::bigint,c.total_amount,1,'RESERVED',j) RETURNING id INTO iid;
 INSERT INTO public.reimbursement_instruction_claims(batch_id,instruction_id,claim_id,allocated_amount_cents,allocated_amount,is_active) VALUES(bid,iid,c.id,round(c.total_amount*100)::bigint,c.total_amount,true);
 UPDATE public.claims SET active_batch_id=bid,active_instruction_id=iid,reimbursement_status='RESERVED_IN_BATCH',version=version+1 WHERE id=c.id;
 END LOOP;
 UPDATE public.reimbursement_batches SET content_digest_sha256=encode(extensions.digest((SELECT jsonb_agg(jsonb_build_object('line_order',line_order,'amount_cents',amount_cents,'claim_count',claim_count,'jompay',jompay_snapshot) ORDER BY line_order)::text FROM public.reimbursement_batch_instructions WHERE batch_id=bid),'sha256'),'hex') WHERE id=bid;
 INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data) VALUES(auth.uid(),'FINALIZE_JOMPAY_BATCH','reimbursement_batches',bid::text,jsonb_build_object('claim_count',line,'total_amount_cents',amount));
 RETURN jsonb_build_object('id',bid,'batch_number',num);
END $$;

ALTER FUNCTION private.command(text,jsonb) RENAME TO command_before_jompay_b1;
REVOKE ALL ON FUNCTION private.command_before_jompay_b1(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.command(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE b public.reimbursement_batches;item jsonb;
BEGIN
 IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';END IF;
 IF action IN ('setting','settings') THEN
  IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(CASE WHEN action='settings' THEN payload->'settings' ELSE jsonb_build_array(payload) END) LOOP
   IF item->>'key'='jompay_export_config' AND COALESCE(item->'value'->>'fail_email_2','')<>'' AND item->'value'->>'fail_email_2'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid second failure email or leave it blank';END IF;
  END LOOP;
 END IF;
 IF action IN ('record_batch_export','record_batch_bank_upload','disburse_reimbursement_batch') THEN
  -- Lock the same batch row as the existing engine, preserving concurrent export/void safety.
  SELECT * INTO b FROM public.reimbursement_batches WHERE id=(payload->>'batch_id')::uuid FOR UPDATE;
  IF b.payment_method='JOMPAY' THEN
   IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
   IF b.template_version NOT IN ('JOMPAY_BULK_B1_XLSX_V1','JOMPAY_TEMPLATE_PENDING') THEN RAISE EXCEPTION 'Unsupported JomPAY template version';END IF;
   IF b.status='VOIDED' THEN RAISE EXCEPTION 'Cannot process a voided JomPAY batch';END IF;
   IF action='record_batch_export' THEN
    IF payload->>'template_version' IS DISTINCT FROM 'JOMPAY_BULK_B1_XLSX_V1' THEN RAISE EXCEPTION 'Validated JomPAY B1 export required';END IF;
    IF COALESCE(payload->>'file_hash_sha256','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid export SHA-256';END IF;
    IF COALESCE(payload->>'filename','')!~'^[A-Za-z0-9_-]+[.]xlsx$' THEN RAISE EXCEPTION 'JomPAY filename must end with .xlsx';END IF;
    IF b.exported_file_hash_sha256 IS NOT NULL AND b.exported_file_hash_sha256<>payload->>'file_hash_sha256' THEN RAISE EXCEPTION 'Export differs from recorded frozen file';END IF;
    IF b.exported_filename IS NOT NULL AND b.exported_filename<>payload->>'filename' THEN RAISE EXCEPTION 'Export filename differs from recorded file';END IF;
    UPDATE public.reimbursement_batches SET
     status=CASE WHEN status='FINALIZED' THEN 'EXPORTED' ELSE status END,
     exported_file_hash_sha256=COALESCE(exported_file_hash_sha256,payload->>'file_hash_sha256'),
     exported_filename=COALESCE(exported_filename,payload->>'filename'),
     exported_at=COALESCE(exported_at,now()),exported_by=COALESCE(exported_by,auth.uid()),updated_at=now()
    WHERE id=b.id;
    UPDATE public.reimbursement_batch_instructions SET status='EXPORTED',updated_at=now() WHERE batch_id=b.id AND status='RESERVED';
    UPDATE public.claims SET reimbursement_status='EXPORTED_PENDING_CONFIRMATION',updated_at=now() WHERE active_batch_id=b.id AND reimbursement_status='RESERVED_IN_BATCH';
    INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data) VALUES(auth.uid(),'EXPORT_JOMPAY_BATCH_XLSX','reimbursement_batches',b.id::text,jsonb_build_object('file_hash_sha256',payload->>'file_hash_sha256','template_version','JOMPAY_BULK_B1_XLSX_V1','filename',payload->>'filename'));
    RETURN jsonb_build_object('id',b.id);
   END IF;
   IF b.exported_file_hash_sha256 IS NULL THEN RAISE EXCEPTION 'Export the frozen JomPAY file before recording a bank upload';END IF;
   IF action='record_batch_bank_upload' THEN
    IF b.status NOT IN ('EXPORTED','SUBMITTED_TO_BANK') THEN RAISE EXCEPTION 'JomPAY batch cannot be marked uploaded in its current state';END IF;
    IF nullif(trim(payload->>'bank_upload_reference'),'') IS NULL THEN RAISE EXCEPTION 'Bank upload reference required';END IF;
   ELSIF b.bank_uploaded_at IS NULL THEN RAISE EXCEPTION 'Record the JomPAY bank upload before confirming whole-batch completion';END IF;
   RETURN private.legacy_commands_v2(action,payload);
  END IF;
 END IF;
 RETURN private.command_before_jompay_b1(action,payload);
END $$;
REVOKE ALL ON FUNCTION private.command(text,jsonb),private.finalize_jompay_v2(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.finalize_jompay_v2(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.command(text,jsonb) TO authenticated;
-- Rebind/invalidate the public SQL wrapper after the private dispatcher rename.
CREATE OR REPLACE FUNCTION public.nlcc_command(action text,payload jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.command(action,payload); $$;
REVOKE ALL ON FUNCTION public.nlcc_command(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nlcc_command(text,jsonb) TO authenticated;
COMMIT;
