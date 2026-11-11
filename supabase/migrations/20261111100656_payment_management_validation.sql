-- Payment management refinements. No financial record or frozen batch is rewritten.
BEGIN;
ALTER TABLE public.recurring_payments ADD CONSTRAINT recurring_fixed_amount_required
 CHECK(amount_mode<>'FIXED' OR (fixed_amount IS NOT NULL AND fixed_amount>0)) NOT VALID;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.recurring_payments WHERE amount_mode='FIXED' AND (fixed_amount IS NULL OR fixed_amount<=0)) THEN ALTER TABLE public.recurring_payments VALIDATE CONSTRAINT recurring_fixed_amount_required;END IF;END $$;
CREATE OR REPLACE FUNCTION private.enforce_v2_role_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND is_payee_only) THEN RAISE EXCEPTION 'Saved payees do not have user roles';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.roles WHERE id=NEW.role_id AND code IN ('TEAM_LEAD','FINANCE')) THEN RAISE EXCEPTION 'Only TEAM_LEAD and FINANCE are assignable roles';END IF;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION private.guard_recurring_payee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF (NEW.status<>'ACTIVE' OR NEW.payment_method<>'JOMPAY') AND EXISTS(SELECT 1 FROM public.recurring_payments WHERE payee_id=NEW.id AND is_active) THEN RAISE EXCEPTION 'Deactivate this payee’s recurring schedules before deactivating it or changing its payment method.';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_recurring_payee BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_recurring_payee();
CREATE OR REPLACE FUNCTION private.save_payee_v2(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE p public.profiles;cid uuid=nullif(payload->>'id','')::uuid;method text=COALESCE(payload->>'payment_method','BANK_TRANSFER');bank text;acct text;
BEGIN
 payload=payload || jsonb_build_object('jompay_biller_code',trim(payload->>'jompay_biller_code'),'jompay_reference_1',trim(payload->>'jompay_reference_1'),'jompay_reference_2',trim(payload->>'jompay_reference_2'));
 IF nullif(trim(payload->>'full_name'),'') IS NULL THEN RAISE EXCEPTION 'Supplier name required'; END IF;
 IF cid IS NOT NULL THEN
 SELECT * INTO p FROM public.profiles WHERE id=cid FOR UPDATE;
 IF payload?'expected_payment_revision' AND p.payment_revision IS DISTINCT FROM (payload->>'expected_payment_revision')::integer THEN RAISE EXCEPTION 'Payment details changed. Close and reopen the supplier before saving.' USING ERRCODE='PT409';END IF;
 IF p.id IS NULL OR NOT p.is_payee_only OR NOT (private.has_role('FINANCE') OR p.created_by_user_id=auth.uid()) THEN RAISE EXCEPTION 'Supplier editing not allowed' USING ERRCODE='42501'; END IF;
 END IF;
 IF (method='JOMPAY' OR p.payment_method='JOMPAY') AND NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Only Finance can create or edit JomPAY payees' USING ERRCODE='42501'; END IF;
 IF method NOT IN ('BANK_TRANSFER','JOMPAY') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
 bank=private.resolve_canonical_swift_code(COALESCE(payload->>'bank_code',payload->>'bank_name'));
 acct=regexp_replace(trim(payload->>'bank_account_number'),'[\s\-]','','g');
 IF method='BANK_TRANSFER' AND (bank IS NULL OR COALESCE(acct,'')!~'^[0-9]{6,20}$' OR nullif(trim(payload->>'bank_account_holder_name'),'') IS NULL) THEN RAISE EXCEPTION 'Bank, account holder name and account number required'; END IF;
 IF method='JOMPAY' AND (COALESCE(payload->>'jompay_biller_code','')!~'^[0-9]+$' OR nullif(trim(payload->>'jompay_reference_1'),'') IS NULL OR nullif(trim(payload->>'jompay_biller_name'),'') IS NULL) THEN RAISE EXCEPTION 'Biller name, numeric Biller Code and Reference 1 required'; END IF;
 -- Serialize creation to avoid duplicate normalized names and payment destinations.
 PERFORM pg_advisory_xact_lock(720003);
 IF cid IS NULL THEN
 SELECT id INTO cid FROM public.profiles WHERE is_payee_only AND lower(trim(full_name))=lower(trim(payload->>'full_name')) AND payment_method=method AND
 CASE WHEN method='JOMPAY' THEN jompay_biller_code=payload->>'jompay_biller_code' AND jompay_reference_1=payload->>'jompay_reference_1'
 ELSE bank_code=bank AND private.decrypt_bank_account(bank_account_number)=acct END LIMIT 1;
 IF cid IS NOT NULL THEN RETURN jsonb_build_object('id',cid); END IF;
 INSERT INTO public.profiles(email,full_name,is_payee_only,created_by_user_id) VALUES('payee-'||gen_random_uuid()::text||'@harvestgen.org',trim(payload->>'full_name'),true,auth.uid()) RETURNING id INTO cid;
 END IF;
 UPDATE public.profiles SET full_name=trim(payload->>'full_name'),phone=CASE WHEN payload?'phone' THEN payload->>'phone' ELSE phone END,payment_method=method,
 bank_code=CASE WHEN method='BANK_TRANSFER' THEN bank END,bank_name=CASE WHEN method='BANK_TRANSFER' THEN (SELECT bank_name FROM public.bank_directory WHERE swift_code=bank) END,
 bank_account_holder_name=CASE WHEN method='BANK_TRANSFER' THEN trim(payload->>'bank_account_holder_name') END,bank_account_number=CASE WHEN method='BANK_TRANSFER' THEN private.encrypt_bank_account(acct) END,
 jompay_biller_name=CASE WHEN method='JOMPAY' THEN trim(payload->>'jompay_biller_name') END,jompay_biller_code=CASE WHEN method='JOMPAY' THEN trim(payload->>'jompay_biller_code') END,
 jompay_reference_1=CASE WHEN method='JOMPAY' THEN trim(payload->>'jompay_reference_1') END,jompay_reference_2=CASE WHEN method='JOMPAY' THEN nullif(trim(payload->>'jompay_reference_2'),'') END,
 bank_updated_at=now(),updated_at=now() WHERE id=cid;
 RETURN jsonb_build_object('id',cid);
END $$;

CREATE OR REPLACE FUNCTION private.redact_workspace_snapshot(p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE nested_key text;result jsonb=p_snapshot;finance boolean=private.has_role('FINANCE');arr jsonb;entry jsonb;inst jsonb;rows jsonb;
BEGIN
 IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';END IF;
 IF result?'profiles' THEN
 SELECT COALESCE(jsonb_agg(CASE WHEN finance OR p->>'id'=auth.uid()::text OR p->>'created_by_user_id'=auth.uid()::text THEN
 p || jsonb_build_object('bank_account_number',private.decrypt_bank_account(p->>'bank_account_number'))
 ELSE p-'bank_name'-'bank_code'-'bank_account_holder_name'-'bank_account_number'-'beneficiary_new_ic'-'beneficiary_old_ic'-'beneficiary_business_reg'-'beneficiary_others'-'beneficiary_address'-'phone'-'email'-'jompay_biller_code'-'jompay_reference_1'-'jompay_reference_2' END),'[]') INTO arr FROM jsonb_array_elements(result->'profiles') p;
 result=jsonb_set(result,'{profiles}',arr);END IF;
 IF result?'ministries' THEN
 SELECT COALESCE(jsonb_agg(CASE WHEN finance OR (private.has_role('TEAM_LEAD') AND EXISTS(SELECT 1 FROM public.ministry_team_leads t WHERE t.ministry_id=(m->>'id')::uuid AND t.user_id=auth.uid())) THEN m ELSE m-'budgets' END),'[]') INTO arr FROM jsonb_array_elements(result->'ministries') m;
 result=jsonb_set(result,'{ministries}',arr);END IF;
 IF result?'claims' THEN
 arr='[]';
 FOR entry IN SELECT value FROM jsonb_array_elements(result->'claims') LOOP
 IF finance OR entry->>'claimant_id'=auth.uid()::text OR EXISTS(SELECT 1 FROM public.profiles payee WHERE payee.id=(entry->>'claimant_id')::uuid AND payee.created_by_user_id=auth.uid()) THEN
 entry=entry || jsonb_build_object('bank_account_number',private.decrypt_bank_account(entry->>'bank_account_number'));
 IF jsonb_typeof(entry->'approved_snapshot')='object' THEN entry=jsonb_set(entry,'{approved_snapshot,bank_account_number}',COALESCE(to_jsonb(private.decrypt_bank_account(entry->'approved_snapshot'->>'bank_account_number')),'null'::jsonb));END IF;
 ELSE entry=entry-'bank_name'-'bank_code'-'bank_account_holder_name'-'bank_account_number'-'beneficiary_new_ic'-'beneficiary_old_ic'-'beneficiary_business_reg'-'beneficiary_others'-'beneficiary_address'-'approved_snapshot'-'jompay_details';END IF;
 IF finance THEN
 entry=entry || jsonb_build_object('payee_verification_required',COALESCE(entry->>'payee_payment_method','BANK_TRANSFER')<>'JOMPAY' AND (entry->>'payment_details_verified_at' IS NULL) AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(entry->>'claimant_id')::uuid AND p.verified_payment_revision=p.payment_revision AND p.payment_revision=COALESCE((entry->>'payee_payment_revision')::integer,1) AND
 (p.payment_method='JOMPAY' OR private.decrypt_bank_account(p.bank_account_number)=private.decrypt_bank_account(entry->>'bank_account_number'))));
 END IF;
 IF entry->>'recurring_schedule_id' IS NOT NULL THEN
 entry=entry || jsonb_build_object('recurring_previous_amount',(SELECT nullif(c.total_amount,0) FROM public.recurring_billing_periods bp JOIN public.claims c ON c.id=bp.claim_id WHERE bp.schedule_id=(entry->>'recurring_schedule_id')::uuid AND bp.period=(date_trunc('month',(entry->>'recurring_due_date')::date)-interval '1 month')::date));
 END IF;
 FOREACH nested_key IN ARRAY ARRAY['claimant','submitted_by'] LOOP
 IF jsonb_typeof(entry->nested_key)='object' AND NOT finance AND entry->nested_key->>'id'<>auth.uid()::text THEN entry=jsonb_set(entry,ARRAY[nested_key],(entry->nested_key)-'bank_account_number'-'jompay_biller_code'-'jompay_reference_1'-'jompay_reference_2');END IF;
 END LOOP;
 arr=arr||jsonb_build_array(entry);END LOOP;
 result=jsonb_set(result,'{claims}',arr);END IF;
 IF result?'reimbursementBatches' THEN
 arr='[]';IF finance THEN
 FOR entry IN SELECT value FROM jsonb_array_elements(result->'reimbursementBatches') LOOP
 SELECT COALESCE(jsonb_agg(i || jsonb_build_object('beneficiary_account_number',private.decrypt_bank_account(i->>'beneficiary_account_number'))),'[]') INTO rows FROM jsonb_array_elements(entry->'instructions') i;
 arr=arr||jsonb_build_array(entry||jsonb_build_object('instructions',rows));END LOOP;END IF;
 result=jsonb_set(result,'{reimbursementBatches}',arr);END IF;
 IF NOT finance THEN result=result-'auditLogs'-'signupInvitations';END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION private.run_recurring_payments(p_today date DEFAULT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE s public.recurring_payments;p public.profiles;v_period date;due date;cid uuid;generated integer=0;reminded integer=0;record_row record;
BEGIN
 PERFORM pg_advisory_xact_lock(720004);
 FOR s IN SELECT * FROM public.recurring_payments WHERE is_active AND (amount_mode='VARIABLE' OR fixed_amount>0) AND start_date<=p_today+14 AND (end_date IS NULL OR end_date>=start_date) ORDER BY id LOOP
 SELECT * INTO p FROM public.profiles WHERE id=s.payee_id AND status='ACTIVE' AND payment_method='JOMPAY';
 IF p.id IS NULL THEN CONTINUE;END IF;
 -- Catch up every missed period since the active start; includes next month if its due date is within 14 days.
 FOR v_period IN SELECT d::date FROM generate_series(date_trunc('month',s.start_date)::date,date_trunc('month',p_today+14)::date,interval '1 month') d LOOP
 due=v_period+LEAST(s.due_day,extract(day FROM (v_period+interval '1 month - 1 day'))::integer)-1;
 IF due<s.start_date OR (s.end_date IS NOT NULL AND due>s.end_date) OR p_today<due-14 OR EXISTS(SELECT 1 FROM public.recurring_billing_periods WHERE schedule_id=s.id AND recurring_billing_periods.period=v_period) THEN CONTINUE; END IF;
 INSERT INTO public.claims(submitted_by_user_id,claimant_id,claimant_name,ministry_id,claim_date,purpose,status,payee_payment_method,payee_payment_revision,jompay_details,recurring_schedule_id,recurring_due_date,total_amount)
 VALUES(s.owner_id,p.id,p.full_name,s.ministry_id,p_today,s.utility||' – '||to_char(v_period,'Mon YYYY'),'DRAFT','JOMPAY',p.payment_revision,
 jsonb_build_object('biller_name',p.jompay_biller_name,'biller_code',p.jompay_biller_code,'reference_1',p.jompay_reference_1,'reference_2',p.jompay_reference_2),s.id,due,COALESCE(s.fixed_amount,0)) RETURNING id INTO cid;
 -- Existing expense rows use zero as the storage representation of blank in a Draft only.
 INSERT INTO public.claim_expenses(claim_id,expense_date,expense_category_id,description,amount,sort_order) VALUES(cid,p_today,s.expense_category_id,'',COALESCE(s.fixed_amount,0),1);
 INSERT INTO public.recurring_billing_periods(schedule_id,period,due_date,claim_id) VALUES(s.id,v_period,due,cid);
 INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
 SELECT pr.id,cid,'RECURRING_DRAFT','Recurring bill draft ready',s.utility||' bill due '||due::text,'/claims/'||cid::text FROM public.profiles pr
 WHERE pr.status='ACTIVE' AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=pr.id AND r.code='FINANCE');
 generated=generated+1;
 END LOOP;END LOOP;
 FOR record_row IN SELECT b.id,b.claim_id,s.utility FROM public.recurring_billing_periods b JOIN public.recurring_payments s ON s.id=b.schedule_id JOIN public.claims c ON c.id=b.claim_id
 WHERE s.is_active AND s.amount_mode='VARIABLE' AND b.reminded_at IS NULL AND p_today>=b.due_date-7 AND c.status='DRAFT' AND c.total_amount=0 LOOP
 INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
 SELECT pr.id,record_row.claim_id,'RECURRING_AMOUNT_REMINDER','Enter the bill amount',record_row.utility||' draft still needs an amount.','/claims/'||record_row.claim_id::text FROM public.profiles pr
 WHERE pr.status='ACTIVE' AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=pr.id AND r.code='FINANCE');
 UPDATE public.recurring_billing_periods SET reminded_at=now() WHERE id=record_row.id;reminded=reminded+1;
 END LOOP;
 RETURN jsonb_build_object('generated',generated,'reminded',reminded,'local_date',p_today);
END $$;


CREATE OR REPLACE FUNCTION private.payment_history_for_finance(p_payee uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE h record;a jsonb;b jsonb;changed jsonb;rows jsonb='[]';
BEGIN
 IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
 FOR h IN SELECT d.*,p.full_name AS actor_name FROM private.payment_detail_changes d LEFT JOIN public.profiles p ON p.id=d.actor_id WHERE d.payee_id=p_payee ORDER BY d.created_at DESC,d.id LOOP
 a=COALESCE(h.old_value,'{}')||jsonb_build_object('account',private.decrypt_bank_account(h.old_value->>'account'));
 b=COALESCE(h.new_value,'{}')||jsonb_build_object('account',private.decrypt_bank_account(h.new_value->>'account'));
 SELECT COALESCE(jsonb_agg(k ORDER BY k),'[]') INTO changed FROM jsonb_object_keys(a||b) keys(k) WHERE a->k IS DISTINCT FROM b->k;
 a=a||jsonb_build_object('account',CASE WHEN nullif(a->>'account','') IS NULL THEN NULL ELSE '****'||right(a->>'account',4) END);
 b=b||jsonb_build_object('account',CASE WHEN nullif(b->>'account','') IS NULL THEN NULL ELSE '****'||right(b->>'account',4) END);
 rows=rows||jsonb_build_array(jsonb_build_object('id',h.id,'created_at',h.created_at,'actor_name',h.actor_name,'old_value',a,'new_value',b,'changed_fields',changed));
 END LOOP;RETURN jsonb_build_object('changes',rows);
END $$;
CREATE OR REPLACE FUNCTION private.save_recurring_payment_v3(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE target uuid;payee public.profiles;category uuid;mode text;utility text;amount numeric;due integer;starts date;ends date;
BEGIN
 IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
 utility=payload->>'utility';mode=payload->>'amount_mode';
 IF utility IS NULL OR utility NOT IN ('Unifi','Indah Water','TNB','Air Selangor') THEN RAISE EXCEPTION 'Choose one of the four supported utility bills';END IF;
 IF mode IS DISTINCT FROM (CASE WHEN utility IN ('Unifi','Indah Water') THEN 'FIXED' ELSE 'VARIABLE' END) THEN RAISE EXCEPTION 'Unifi and Indah Water use fixed amounts; TNB and Air Selangor use variable amounts';END IF;
 IF mode='FIXED' THEN
  IF COALESCE(payload->>'fixed_amount','')!~'^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'Enter a positive fixed amount with at most two decimal places';END IF;
  amount=(payload->>'fixed_amount')::numeric;
  IF amount<=0 OR amount>=10000000000 THEN RAISE EXCEPTION 'Enter a valid positive fixed amount';END IF;
 ELSIF nullif(payload->>'fixed_amount','') IS NOT NULL THEN RAISE EXCEPTION 'Variable bills must not have a fixed amount';END IF;
 IF COALESCE(payload->>'due_day','')!~'^[0-9]{1,2}$' THEN RAISE EXCEPTION 'Enter a whole due day from 1 to 31';END IF;
 due=(payload->>'due_day')::integer;IF due NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Enter a due day from 1 to 31';END IF;
 starts=nullif(payload->>'start_date','')::date;ends=nullif(payload->>'end_date','')::date;
 IF starts IS NULL OR (ends IS NOT NULL AND ends<starts) THEN RAISE EXCEPTION 'Enter a start date and an end date on or after it';END IF;
 SELECT * INTO payee FROM public.profiles WHERE id=(payload->>'payee_id')::uuid AND is_payee_only AND status='ACTIVE' AND payment_method='JOMPAY';
 IF payee.id IS NULL THEN RAISE EXCEPTION 'Choose an active JomPAY payee from the supplier directory';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ministries WHERE id=(payload->>'ministry_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Choose an active Team';END IF;
 SELECT id INTO category FROM public.expense_categories WHERE is_active AND CASE WHEN nullif(payload->>'expense_category_id','') IS NULL THEN code='V2_UTILITIES' ELSE id=(payload->>'expense_category_id')::uuid END;
 IF category IS NULL THEN RAISE EXCEPTION 'Choose an active expense classification';END IF;
 target=COALESCE(nullif(payload->>'id','')::uuid,gen_random_uuid());
 PERFORM pg_advisory_xact_lock(720004);
 IF COALESCE((payload->>'is_active')::boolean,true) AND EXISTS(SELECT 1 FROM public.recurring_payments WHERE payee_id=payee.id AND is_active AND id<>target) THEN RAISE EXCEPTION 'This payee already has an active recurring schedule. Edit it or deactivate it first.';END IF;
 INSERT INTO public.recurring_payments(id,utility,payee_id,ministry_id,expense_category_id,amount_mode,fixed_amount,due_day,start_date,end_date,is_active,owner_id)
 VALUES(target,utility,payee.id,(payload->>'ministry_id')::uuid,category,mode,amount,due,starts,ends,COALESCE((payload->>'is_active')::boolean,true),auth.uid())
 ON CONFLICT(id) DO UPDATE SET utility=excluded.utility,payee_id=excluded.payee_id,ministry_id=excluded.ministry_id,expense_category_id=excluded.expense_category_id,amount_mode=excluded.amount_mode,fixed_amount=excluded.fixed_amount,due_day=excluded.due_day,start_date=excluded.start_date,end_date=excluded.end_date,is_active=excluded.is_active,updated_at=now();
 RETURN jsonb_build_object('id',target);
END $$;
ALTER FUNCTION private.command(text,jsonb) RENAME TO command_before_payment_management;
REVOKE ALL ON FUNCTION private.command_before_payment_management(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.command(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles;
BEGIN
 IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';END IF;
 IF action='deactivate_recurring_payment' THEN PERFORM pg_advisory_xact_lock(720004);END IF;
 IF action='save_recurring_payment' THEN RETURN private.save_recurring_payment_v3(payload);END IF;
 IF action='payment_detail_history' THEN RETURN private.payment_history_for_finance((payload->>'id')::uuid);END IF;
 IF action='verify_payee' THEN
  IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
  SELECT * INTO p FROM public.profiles WHERE id=(payload->>'id')::uuid FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Payee not found';END IF;
  IF p.payment_method='JOMPAY' THEN RAISE EXCEPTION 'JomPAY payees do not require verification';END IF;
  IF p.payment_revision IS DISTINCT FROM (payload->>'payment_revision')::integer THEN RAISE EXCEPTION 'Payment details changed. Refresh and review again.' USING ERRCODE='PT409';END IF;
  IF p.verified_payment_revision=p.payment_revision THEN RETURN jsonb_build_object('id',p.id);END IF;
 END IF;
 IF action='verify_claim_payment' AND EXISTS(SELECT 1 FROM public.claims WHERE id=(payload->>'claim_id')::uuid AND payee_payment_method='JOMPAY') THEN
  IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
  RAISE EXCEPTION 'JomPAY payment details do not require verification';
 END IF;
 RETURN private.command_before_payment_management(action,payload);
END $$;
CREATE OR REPLACE FUNCTION public.nlcc_command(action text,payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.command(action,payload);$$;
REVOKE ALL ON FUNCTION private.guard_recurring_payee(),private.payment_history_for_finance(uuid),private.save_recurring_payment_v3(jsonb),private.command(text,jsonb),private.save_payee_v2(jsonb),private.run_recurring_payments(date),private.redact_workspace_snapshot(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.guard_recurring_payee(),private.payment_history_for_finance(uuid),private.save_recurring_payment_v3(jsonb),private.save_payee_v2(jsonb),private.run_recurring_payments(date),private.redact_workspace_snapshot(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.nlcc_command(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.command(text,jsonb),public.nlcc_command(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
