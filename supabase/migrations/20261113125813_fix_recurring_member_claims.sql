-- Validate recurring destinations and preserve the scheduled recipient through claim submission.
BEGIN;

CREATE OR REPLACE FUNCTION private.recurring_payee_ready(p public.profiles) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p.payment_method='BANK_TRANSFER' THEN
  RETURN private.resolve_canonical_swift_code(COALESCE(p.bank_code,p.bank_name)) IS NOT NULL
   AND nullif(trim(p.bank_account_holder_name),'') IS NOT NULL
   AND COALESCE(private.decrypt_bank_account(p.bank_account_number),'') ~ '^[0-9]{6,20}$';
 END IF;
 RETURN COALESCE(p.payment_method='JOMPAY' AND p.is_payee_only
  AND COALESCE(p.jompay_biller_code,'') ~ '^[0-9]+$'
  AND nullif(trim(p.jompay_reference_1),'') IS NOT NULL,false);
END $$;

CREATE OR REPLACE FUNCTION private.save_recurring_payment_v4(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE target uuid;payee public.profiles;category uuid;mode text;utility text;amount numeric;due integer;starts date;ends date;
BEGIN
 IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(720004);
 SELECT * INTO payee FROM public.profiles WHERE id=(payload->>'payee_id')::uuid AND status='ACTIVE' FOR SHARE;
 IF payee.id IS NULL THEN RAISE EXCEPTION 'Choose an active member or supplier'; END IF;
 IF NOT private.recurring_payee_ready(payee) THEN
  RAISE EXCEPTION 'This payee needs complete bank account or JomPAY details before a schedule can be saved';
 END IF;

 utility=trim(COALESCE(payload->>'utility',''));
 mode=payload->>'amount_mode';

 IF payee.payment_method='JOMPAY' THEN
  IF NOT payee.is_payee_only THEN RAISE EXCEPTION 'JomPAY requires a supplier payee';END IF;
  IF utility NOT IN ('Unifi','Indah Water','TNB','Air Selangor') THEN RAISE EXCEPTION 'Choose one of the four supported utility bills';END IF;
  IF mode IS DISTINCT FROM (CASE WHEN utility IN ('Unifi','Indah Water') THEN 'FIXED' ELSE 'VARIABLE' END) THEN RAISE EXCEPTION 'Unifi and Indah Water use fixed amounts; TNB and Air Selangor use variable amounts';END IF;
 ELSIF payee.payment_method='BANK_TRANSFER' THEN
  IF utility='' THEN RAISE EXCEPTION 'Enter a recurring bill or payment title';END IF;
  IF mode IS NULL OR mode NOT IN ('FIXED','VARIABLE') THEN RAISE EXCEPTION 'Choose fixed or variable amount';END IF;
 ELSE
  RAISE EXCEPTION 'Unsupported payment method for recurring payments';
 END IF;

 IF mode='FIXED' THEN
  IF COALESCE(payload->>'fixed_amount','')!~'^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'Enter a positive fixed amount with at most two decimal places';END IF;
  amount=(payload->>'fixed_amount')::numeric;
  IF amount<=0 OR amount>=10000000000 THEN RAISE EXCEPTION 'Enter a valid positive fixed amount';END IF;
 ELSIF nullif(payload->>'fixed_amount','') IS NOT NULL THEN
  RAISE EXCEPTION 'Variable bills must not have a fixed amount';
 END IF;

 IF COALESCE(payload->>'due_day','')!~'^[0-9]{1,2}$' THEN RAISE EXCEPTION 'Enter a whole due day from 1 to 31';END IF;
 due=(payload->>'due_day')::integer;IF due NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Enter a due day from 1 to 31';END IF;
 starts=nullif(payload->>'start_date','')::date;ends=nullif(payload->>'end_date','')::date;
 IF starts IS NULL OR (ends IS NOT NULL AND ends<starts) THEN RAISE EXCEPTION 'Enter a start date and an end date on or after it';END IF;

 IF NOT EXISTS(SELECT 1 FROM public.ministries WHERE id=(payload->>'ministry_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Choose an active Team';END IF;
 SELECT id INTO category FROM public.expense_categories WHERE is_active AND CASE WHEN nullif(payload->>'expense_category_id','') IS NULL THEN code='V2_UTILITIES' ELSE id=(payload->>'expense_category_id')::uuid END;
 IF category IS NULL THEN RAISE EXCEPTION 'Choose an active expense classification';END IF;

 target=COALESCE(nullif(payload->>'id','')::uuid,gen_random_uuid());
 IF COALESCE((payload->>'is_active')::boolean,true) AND EXISTS(SELECT 1 FROM public.recurring_payments WHERE payee_id=payee.id AND is_active AND id<>target) THEN RAISE EXCEPTION 'This payee already has an active recurring schedule. Edit it or deactivate it first.';END IF;

 INSERT INTO public.recurring_payments(id,utility,payee_id,ministry_id,expense_category_id,amount_mode,fixed_amount,due_day,start_date,end_date,is_active,owner_id)
 VALUES(target,utility,payee.id,(payload->>'ministry_id')::uuid,category,mode,amount,due,starts,ends,COALESCE((payload->>'is_active')::boolean,true),auth.uid())
 ON CONFLICT(id) DO UPDATE SET utility=excluded.utility,payee_id=excluded.payee_id,ministry_id=excluded.ministry_id,expense_category_id=excluded.expense_category_id,amount_mode=excluded.amount_mode,fixed_amount=excluded.fixed_amount,due_day=excluded.due_day,start_date=excluded.start_date,end_date=excluded.end_date,is_active=excluded.is_active,updated_at=now();

 RETURN jsonb_build_object('id',target);
END $$;

CREATE OR REPLACE FUNCTION private.run_recurring_payments(p_today date DEFAULT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE s public.recurring_payments;p public.profiles;v_period date;due date;cid uuid;generated integer=0;reminded integer=0;skipped integer=0;record_row record;
BEGIN
 PERFORM pg_advisory_xact_lock(720004);
 FOR s IN SELECT * FROM public.recurring_payments WHERE is_active AND (amount_mode='VARIABLE' OR fixed_amount>0) AND start_date<=p_today+14 AND (end_date IS NULL OR end_date>=start_date) ORDER BY id LOOP
 SELECT * INTO p FROM public.profiles WHERE id=s.payee_id AND status='ACTIVE' AND payment_method IN ('JOMPAY','BANK_TRANSFER');
 -- Catch up every missed period since the active start; includes next month if its due date is within 14 days.
 FOR v_period IN SELECT d::date FROM generate_series(date_trunc('month',s.start_date)::date,date_trunc('month',p_today+14)::date,interval '1 month') d LOOP
 due=v_period+LEAST(s.due_day,extract(day FROM (v_period+interval '1 month - 1 day'))::integer)-1;
 IF due<s.start_date OR (s.end_date IS NOT NULL AND due>s.end_date) OR p_today<due-14 OR EXISTS(SELECT 1 FROM public.recurring_billing_periods WHERE schedule_id=s.id AND recurring_billing_periods.period=v_period) THEN CONTINUE; END IF;
 IF p.id IS NULL OR NOT private.recurring_payee_ready(p) THEN
  skipped=skipped+1;
  EXIT;
 END IF;
 INSERT INTO public.claims(
   submitted_by_user_id,
   claimant_id,
   claimant_name,
   claimant_email,
   claimant_phone,
   ministry_id,
   claim_date,
   purpose,
   status,
   payee_payment_method,
   payee_payment_revision,
   jompay_details,
   bank_name,
   bank_code,
   bank_account_holder_name,
   bank_account_number,
   beneficiary_new_ic, beneficiary_old_ic, beneficiary_business_reg, beneficiary_others, beneficiary_address,
   recurring_schedule_id,
   recurring_due_date,
   total_amount
 )
 VALUES(
   CASE WHEN NOT p.is_payee_only THEN p.id ELSE s.owner_id END,
   p.id,
   p.full_name,
   p.email,
   p.phone,
   s.ministry_id,
   p_today,
   s.utility||' – '||to_char(v_period,'Mon YYYY'),
   'DRAFT',
   p.payment_method,
   p.payment_revision,
   CASE WHEN p.payment_method='JOMPAY' THEN jsonb_build_object('biller_name',p.jompay_biller_name,'biller_code',p.jompay_biller_code,'reference_1',p.jompay_reference_1,'reference_2',p.jompay_reference_2) ELSE NULL END,
   CASE WHEN p.payment_method='BANK_TRANSFER' THEN p.bank_name ELSE NULL END,
   CASE WHEN p.payment_method='BANK_TRANSFER' THEN private.resolve_canonical_swift_code(COALESCE(p.bank_code,p.bank_name)) ELSE NULL END,
   CASE WHEN p.payment_method='BANK_TRANSFER' THEN p.bank_account_holder_name ELSE NULL END,
   CASE WHEN p.payment_method='BANK_TRANSFER' THEN p.bank_account_number ELSE NULL END,
   p.beneficiary_new_ic, p.beneficiary_old_ic, p.beneficiary_business_reg, p.beneficiary_others, p.beneficiary_address,
   s.id,
   due,
   COALESCE(s.fixed_amount,0)
 ) RETURNING id INTO cid;
 -- Existing expense rows use zero as the storage representation of blank in a Draft only.
 INSERT INTO public.claim_expenses(claim_id,expense_date,expense_category_id,description,amount,sort_order)
 VALUES(cid,p_today,s.expense_category_id,'',COALESCE(s.fixed_amount,0),1);
 INSERT INTO public.recurring_billing_periods(schedule_id,period,due_date,claim_id) VALUES(s.id,v_period,due,cid);
 -- Notify Finance and the member once each, even when the member is in Finance.
 INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
 SELECT pr.id,cid,'RECURRING_DRAFT','Recurring draft ready',s.utility||' due '||due::text,'/claims/'||cid::text
 FROM public.profiles pr
 WHERE pr.status='ACTIVE' AND (
  (NOT p.is_payee_only AND pr.id=p.id)
  OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=pr.id AND r.code='FINANCE')
 );
 generated=generated+1;
 END LOOP;END LOOP;
 FOR record_row IN SELECT b.id,b.claim_id,s.utility FROM public.recurring_billing_periods b JOIN public.recurring_payments s ON s.id=b.schedule_id JOIN public.claims c ON c.id=b.claim_id
 WHERE s.is_active AND s.amount_mode='VARIABLE' AND b.reminded_at IS NULL AND p_today>=b.due_date-7 AND c.status='DRAFT' AND c.total_amount=0 LOOP
 INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
 SELECT pr.id,record_row.claim_id,'RECURRING_AMOUNT_REMINDER','Enter the bill amount',record_row.utility||' draft still needs an amount.','/claims/'||record_row.claim_id::text FROM public.profiles pr
 WHERE pr.status='ACTIVE' AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=pr.id AND r.code='FINANCE');
 UPDATE public.recurring_billing_periods SET reminded_at=now() WHERE id=record_row.id;reminded=reminded+1;
 END LOOP;
 RETURN jsonb_build_object('generated',generated,'reminded',reminded,'skipped_invalid_payees',skipped,'local_date',p_today);
END $$;

CREATE OR REPLACE FUNCTION private.save_claim_v2(action text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE uid uuid=auth.uid(); c public.claims; p public.profiles; cid uuid; eid uuid; item jsonb; a jsonb;
 cfg jsonb; acct text; bank text; cat text; previous text; total numeric=0; result jsonb; saved_attachments jsonb;
BEGIN
 IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 SELECT value INTO cfg FROM public.system_settings WHERE key='claim_form_config';
 IF payload->>'request_key' IS NOT NULL THEN
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || (payload->>'request_key')::uuid::text,0));
 SELECT id INTO cid FROM public.claims WHERE submitted_by_user_id=uid AND request_key=(payload->>'request_key')::uuid;
 IF cid IS NOT NULL AND EXISTS(SELECT 1 FROM public.claims WHERE id=cid AND status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION')) THEN RETURN jsonb_build_object('id',cid); END IF;
 END IF;
 cid=COALESCE(NULLIF(payload->>'id','')::uuid,cid);
 IF cid IS NOT NULL THEN
 SELECT * INTO c FROM public.claims WHERE id=cid FOR UPDATE;
 IF c.id IS NULL OR (COALESCE(c.submitted_by_user_id,c.claimant_id)<>uid AND NOT (private.has_role('FINANCE') AND c.recurring_schedule_id IS NOT NULL)) OR c.status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION') THEN RAISE EXCEPTION 'This claim cannot be edited' USING ERRCODE='42501'; END IF;
 IF c.version IS DISTINCT FROM (payload->>'version')::integer THEN RAISE EXCEPTION 'This claim changed. Refresh before saving' USING ERRCODE='PT409'; END IF;
 END IF;
 previous=COALESCE(c.status,'DRAFT');
 -- Recurring claims belong to the scheduled recipient and use the generated payment snapshot.
 IF c.recurring_schedule_id IS NOT NULL THEN
  IF nullif(payload->>'payee_profile_id','')::uuid IS DISTINCT FROM c.claimant_id THEN
   RAISE EXCEPTION 'The recipient of a recurring claim is set by its schedule';
  END IF;
  payload=payload || jsonb_build_object('claimant_name',c.claimant_name,'claimant_email',c.claimant_email,
   'claimant_phone',c.claimant_phone,'ministry_id',c.ministry_id,'purpose',c.purpose,
   'context_kind',c.context_kind,'context_value_id',c.context_value_id,'context_name',c.context_name);
  payload=payload-'beneficiary_new_ic'-'beneficiary_old_ic'-'beneficiary_business_reg'-'beneficiary_others'-'beneficiary_address';
 END IF;
 SELECT * INTO p FROM public.profiles WHERE id=COALESCE(nullif(payload->>'payee_profile_id','')::uuid,uid) AND status='ACTIVE';
 IF p.id IS NULL OR (p.id<>uid AND NOT p.is_payee_only AND NOT private.has_role('FINANCE')) THEN RAISE EXCEPTION 'Choose yourself or an active supplier' USING ERRCODE='42501'; END IF;
 -- Existing Draft/Returned payee snapshots stay unchanged unless the submitter explicitly refreshes the supplier.
 IF c.recurring_schedule_id IS NOT NULL OR (c.id IS NOT NULL AND c.claimant_id=p.id AND p.id<>uid AND NOT COALESCE((payload->>'refresh_payee_details')::boolean,false)) THEN
 p.bank_code=c.bank_code;p.bank_name=c.bank_name;p.bank_account_number=c.bank_account_number;p.bank_account_holder_name=c.bank_account_holder_name;
 p.payment_method=c.payee_payment_method;p.payment_revision=c.payee_payment_revision;
 p.jompay_biller_name=c.jompay_details->>'biller_name';p.jompay_biller_code=c.jompay_details->>'biller_code';p.jompay_reference_1=c.jompay_details->>'reference_1';p.jompay_reference_2=c.jompay_details->>'reference_2';
 p.beneficiary_new_ic=c.beneficiary_new_ic;p.beneficiary_old_ic=c.beneficiary_old_ic;p.beneficiary_business_reg=c.beneficiary_business_reg;p.beneficiary_others=c.beneficiary_others;p.beneficiary_address=c.beneficiary_address;
 END IF;
 IF jsonb_typeof(payload->'expenses') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'expenses')>100 THEN RAISE EXCEPTION 'Invalid item list'; END IF;
 IF action='submit_claim' THEN
 IF c.recurring_schedule_id IS NOT NULL AND c.context_kind IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.ministries WHERE id=c.ministry_id AND is_active) THEN
   RAISE EXCEPTION 'The Team for this recurring claim is inactive';
  END IF;
 ELSE
  PERFORM private.validate_claim_context(nullif(payload->>'ministry_id','')::uuid,payload->>'context_kind',nullif(payload->>'context_value_id','')::uuid,payload->>'context_name');
 END IF;
 IF jsonb_array_length(payload->'expenses')=0 THEN RAISE EXCEPTION 'Add at least one item'; END IF;
 END IF;
 bank=private.resolve_canonical_swift_code(COALESCE(nullif(payload->>'bank_code',''),p.bank_code,p.bank_name));
 acct=COALESCE(nullif(regexp_replace(payload->>'bank_account_number','[\s\-]','','g'),''),private.decrypt_bank_account(p.bank_account_number));
 -- Supplier details are managed centrally, never silently changed by a claimant.
 IF p.id<>uid OR c.recurring_schedule_id IS NOT NULL THEN
  bank=private.resolve_canonical_swift_code(COALESCE(p.bank_code,p.bank_name));
  acct=private.decrypt_bank_account(p.bank_account_number);
 END IF;
 IF action='submit_claim' AND p.payment_method='BANK_TRANSFER' AND (bank IS NULL OR COALESCE(acct,'') !~ '^[0-9]{6,20}$' OR COALESCE(nullif(payload->>'bank_account_holder_name',''),p.bank_account_holder_name,p.full_name) IS NULL) THEN RAISE EXCEPTION 'Complete the bank, account number and account holder name'; END IF;
 IF action='submit_claim' AND p.payment_method='JOMPAY' AND (COALESCE(p.jompay_biller_code,'')!~'^[0-9]+$' OR nullif(trim(p.jompay_reference_1),'') IS NULL) THEN RAISE EXCEPTION 'JomPAY payee needs Biller Code and Reference 1'; END IF;
 IF cid IS NULL THEN
 INSERT INTO public.claims(submitted_by_user_id,claimant_id,claimant_name,ministry_id,claim_date,purpose,request_key)
 VALUES(uid,p.id,COALESCE(nullif(payload->>'claimant_name',''),p.full_name),nullif(payload->>'ministry_id','')::uuid,COALESCE(nullif(payload->>'claim_date','')::date,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),COALESCE(payload->>'purpose',''),nullif(payload->>'request_key','')::uuid) RETURNING id INTO cid;
 END IF;
 UPDATE public.claims SET claimant_id=p.id,claimant_name=COALESCE(payload->>'claimant_name',p.full_name),claimant_email=COALESCE(payload->>'claimant_email',p.email),claimant_phone=COALESCE(payload->>'claimant_phone',p.phone),
 bank_code=bank,bank_name=(SELECT bank_name FROM public.bank_directory WHERE swift_code=bank),bank_account_number=private.encrypt_bank_account(acct),
 bank_account_holder_name=CASE WHEN p.id<>uid OR c.recurring_schedule_id IS NOT NULL THEN p.bank_account_holder_name ELSE COALESCE(nullif(payload->>'bank_account_holder_name',''),p.bank_account_holder_name,p.full_name) END,
 beneficiary_new_ic=COALESCE(payload->>'beneficiary_new_ic',p.beneficiary_new_ic),beneficiary_old_ic=COALESCE(payload->>'beneficiary_old_ic',p.beneficiary_old_ic),beneficiary_business_reg=COALESCE(payload->>'beneficiary_business_reg',p.beneficiary_business_reg),beneficiary_others=COALESCE(payload->>'beneficiary_others',p.beneficiary_others),beneficiary_address=COALESCE(payload->>'beneficiary_address',p.beneficiary_address),
 ministry_id=nullif(payload->>'ministry_id','')::uuid,claim_date=COALESCE(nullif(payload->>'claim_date','')::date,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),purpose=COALESCE(payload->>'purpose',''),internal_reference=nullif(payload->>'internal_reference',''),
 context_kind=payload->>'context_kind',context_value_id=nullif(payload->>'context_value_id','')::uuid,context_name=nullif(trim(payload->>'context_name'),''),
 payee_payment_method=p.payment_method,payee_payment_revision=p.payment_revision,
 jompay_details=CASE WHEN p.payment_method='JOMPAY' THEN jsonb_build_object('biller_name',p.jompay_biller_name,'biller_code',p.jompay_biller_code,'reference_1',p.jompay_reference_1,'reference_2',p.jompay_reference_2) END,
 payment_details_verified_at=NULL,payment_details_verified_by=NULL,version=version+1,updated_at=now() WHERE id=cid;
 -- Keep access to existing shared paths during replacement, then retain only selected rows.
 SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]') INTO saved_attachments FROM public.claim_attachments a WHERE claim_id=cid;
 DELETE FROM public.claim_expenses WHERE claim_id=cid;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'expenses') LOOP
 PERFORM private.validate_claim_item(item,action='submit_claim');
 IF action='submit_claim' AND COALESCE((cfg->>'require_vendor_name')::boolean,false) AND nullif(trim(item->>'vendor'),'') IS NULL THEN RAISE EXCEPTION 'Supplier / merchant is required'; END IF;
 SELECT code INTO cat FROM public.expense_categories WHERE id=nullif(item->>'expense_category_id','')::uuid;
 INSERT INTO public.claim_expenses(claim_id,expense_date,expense_category_id,vendor,description,amount,sort_order,beneficiary_type,invoice_number)
 VALUES(cid,COALESCE(nullif(item->>'expense_date','')::date,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),nullif(item->>'expense_category_id','')::uuid,nullif(trim(item->>'vendor'),''),COALESCE(item->>'description',''),COALESCE(nullif(item->>'amount','')::numeric,0),COALESCE((item->>'sort_order')::integer,0),
 CASE WHEN cat IN ('V2_FOOD','V2_TRANSPORT','V2_ACCOMMODATION','V2_GIFTS','V2_MEMBER_CARE','V2_SUPPORT') THEN nullif(item->>'beneficiary_type','') END,nullif(item->>'invoice_number','')) RETURNING id INTO eid;
 IF jsonb_typeof(item->'attachment')='object' THEN PERFORM private.attach_claim_file(cid,eid,item->'attachment'); END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'attachments','[]')) WHERE value->>'expense_temp_id'=item->>'temp_id' OR value->>'expense_id'=item->>'id' LOOP PERFORM private.attach_claim_file(cid,eid,a); END LOOP;
 END LOOP;
 FOR a IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'attachments','[]')) LOOP PERFORM private.attach_claim_file(cid,NULL,a); END LOOP;
 DELETE FROM public.claim_attachments a WHERE a.claim_id=cid AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(payload->'attachments','[]')) x WHERE x->>'storage_path'=a.storage_path) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'expenses') x WHERE x->'attachment'->>'storage_path'=a.storage_path);
 IF action='submit_claim' AND COALESCE((cfg->>'require_receipt_for_all_expenses')::boolean,false) AND NOT EXISTS(SELECT 1 FROM public.claim_attachments WHERE claim_id=cid) THEN RAISE EXCEPTION 'Attach a receipt'; END IF;
 SELECT COALESCE(sum(amount),0) INTO total FROM public.claim_expenses WHERE claim_id=cid;
 UPDATE public.claims SET total_amount=total WHERE id=cid;
 IF action='submit_claim' THEN
 UPDATE public.claims SET claim_number=COALESCE(claim_number,public.generate_claim_number()),status='SUBMITTED',submitted_at=COALESCE(submitted_at,now()),resubmitted_at=CASE WHEN previous='RETURNED_FOR_CLARIFICATION' THEN now() ELSE resubmitted_at END,clarification_reason=NULL,rejection_reason=NULL WHERE id=cid;
 PERFORM private.build_workflow(cid);
 INSERT INTO public.approval_actions(claim_id,actor_id,actor_role,action,previous_status,new_status)
 SELECT cid,uid,'MEMBER',CASE WHEN previous='RETURNED_FOR_CLARIFICATION' THEN 'RESUBMIT' ELSE 'SUBMIT' END,previous,status FROM public.claims WHERE id=cid;
 PERFORM private.notify_claim(cid,'Claim submitted');
 ELSE UPDATE public.claims SET status=CASE WHEN previous='RETURNED_FOR_CLARIFICATION' THEN previous ELSE 'DRAFT' END WHERE id=cid;
 END IF;
 RETURN jsonb_build_object('id',cid);
END $$;

REVOKE ALL ON FUNCTION private.recurring_payee_ready(public.profiles), private.save_recurring_payment_v4(jsonb), private.run_recurring_payments(date), private.save_claim_v2(text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
