-- Enable Recurring Payments for Bank Account Transfers (both Users and Directory Payees)
BEGIN;

-- Relax utility and amount_mode constraints to allow custom titles and fixed/variable modes for Bank Transfers
ALTER TABLE public.recurring_payments DROP CONSTRAINT IF EXISTS recurring_payments_utility_check;
ALTER TABLE public.recurring_payments DROP CONSTRAINT IF EXISTS recurring_payments_check2;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_payments_utility_nonempty') THEN
    ALTER TABLE public.recurring_payments ADD CONSTRAINT recurring_payments_utility_nonempty CHECK (length(trim(utility)) > 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.guard_recurring_payee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF (NEW.status<>'ACTIVE' OR NEW.payment_method IS DISTINCT FROM OLD.payment_method OR NEW.payment_method NOT IN ('JOMPAY','BANK_TRANSFER')) AND EXISTS(SELECT 1 FROM public.recurring_payments WHERE payee_id=NEW.id AND is_active) THEN
   RAISE EXCEPTION 'Deactivate this payee’s recurring schedules before deactivating it or changing its payment method.';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.save_recurring_payment_v4(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE target uuid;payee public.profiles;category uuid;mode text;utility text;amount numeric;due integer;starts date;ends date;
BEGIN
 IF NOT private.has_role('FINANCE') THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
 SELECT * INTO payee FROM public.profiles WHERE id=(payload->>'payee_id')::uuid AND status='ACTIVE' AND payment_method IN ('JOMPAY','BANK_TRANSFER');
 IF payee.id IS NULL THEN RAISE EXCEPTION 'Choose an active user or payee';END IF;

 utility=trim(COALESCE(payload->>'utility',''));
 mode=payload->>'amount_mode';

 IF payee.payment_method='JOMPAY' THEN
  IF NOT payee.is_payee_only THEN RAISE EXCEPTION 'JomPAY requires a supplier payee';END IF;
  IF utility NOT IN ('Unifi','Indah Water','TNB','Air Selangor') THEN RAISE EXCEPTION 'Choose one of the four supported utility bills';END IF;
  IF mode IS DISTINCT FROM (CASE WHEN utility IN ('Unifi','Indah Water') THEN 'FIXED' ELSE 'VARIABLE' END) THEN RAISE EXCEPTION 'Unifi and Indah Water use fixed amounts; TNB and Air Selangor use variable amounts';END IF;
 ELSIF payee.payment_method='BANK_TRANSFER' THEN
  IF payee.bank_account_number IS NULL OR trim(payee.bank_account_number)='' OR payee.bank_account_holder_name IS NULL OR trim(payee.bank_account_holder_name)='' THEN
   RAISE EXCEPTION 'Bank transfer payee requires bank name, account number and account holder name';
  END IF;
  IF utility='' THEN RAISE EXCEPTION 'Enter a recurring bill or payment title';END IF;
  IF mode NOT IN ('FIXED','VARIABLE') THEN RAISE EXCEPTION 'Choose fixed or variable amount';END IF;
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
 PERFORM pg_advisory_xact_lock(720004);
 IF COALESCE((payload->>'is_active')::boolean,true) AND EXISTS(SELECT 1 FROM public.recurring_payments WHERE payee_id=payee.id AND is_active AND id<>target) THEN RAISE EXCEPTION 'This payee already has an active recurring schedule. Edit it or deactivate it first.';END IF;

 INSERT INTO public.recurring_payments(id,utility,payee_id,ministry_id,expense_category_id,amount_mode,fixed_amount,due_day,start_date,end_date,is_active,owner_id)
 VALUES(target,utility,payee.id,(payload->>'ministry_id')::uuid,category,mode,amount,due,starts,ends,COALESCE((payload->>'is_active')::boolean,true),auth.uid())
 ON CONFLICT(id) DO UPDATE SET utility=excluded.utility,payee_id=excluded.payee_id,ministry_id=excluded.ministry_id,expense_category_id=excluded.expense_category_id,amount_mode=excluded.amount_mode,fixed_amount=excluded.fixed_amount,due_day=excluded.due_day,start_date=excluded.start_date,end_date=excluded.end_date,is_active=excluded.is_active,updated_at=now();

 RETURN jsonb_build_object('id',target);
END $$;

CREATE OR REPLACE FUNCTION private.run_recurring_payments(p_today date DEFAULT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE s public.recurring_payments;p public.profiles;v_period date;due date;cid uuid;generated integer=0;reminded integer=0;record_row record;
BEGIN
 PERFORM pg_advisory_xact_lock(720004);
 FOR s IN SELECT * FROM public.recurring_payments WHERE is_active AND start_date<=p_today+14 AND (end_date IS NULL OR end_date>=start_date) ORDER BY id LOOP
 SELECT * INTO p FROM public.profiles WHERE id=s.payee_id AND status='ACTIVE' AND payment_method IN ('JOMPAY','BANK_TRANSFER');
 IF p.id IS NULL THEN CONTINUE;END IF;
 -- Catch up every missed period since the active start; includes next month if its due date is within 14 days.
 FOR v_period IN SELECT d::date FROM generate_series(date_trunc('month',s.start_date)::date,date_trunc('month',p_today+14)::date,interval '1 month') d LOOP
 due=v_period+LEAST(s.due_day,extract(day FROM (v_period+interval '1 month - 1 day'))::integer)-1;
 IF due<s.start_date OR (s.end_date IS NOT NULL AND due>s.end_date) OR p_today<due-14 OR EXISTS(SELECT 1 FROM public.recurring_billing_periods WHERE schedule_id=s.id AND recurring_billing_periods.period=v_period) THEN CONTINUE; END IF;
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
   CASE WHEN p.payment_method='BANK_TRANSFER' THEN p.bank_code ELSE NULL END,
   CASE WHEN p.payment_method='BANK_TRANSFER' THEN p.bank_account_holder_name ELSE NULL END,
   CASE WHEN p.payment_method='BANK_TRANSFER' THEN p.bank_account_number ELSE NULL END,
   s.id,
   due,
   COALESCE(s.fixed_amount,0)
 ) RETURNING id INTO cid;
 -- Existing expense rows use zero as the storage representation of blank in a Draft only.
 INSERT INTO public.claim_expenses(claim_id,expense_date,expense_category_id,description,amount,sort_order)
 VALUES(cid,p_today,s.expense_category_id,'',COALESCE(s.fixed_amount,0),1);
 INSERT INTO public.recurring_billing_periods(schedule_id,period,due_date,claim_id) VALUES(s.id,v_period,due,cid);
 -- Notify Finance
 INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
 SELECT pr.id,cid,'RECURRING_DRAFT','Recurring bill draft ready',s.utility||' bill due '||due::text,'/claims/'||cid::text FROM public.profiles pr
 WHERE pr.status='ACTIVE' AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=pr.id AND r.code='FINANCE');
 -- If payee is a registered member/user (not payee_only), also notify them
 IF NOT p.is_payee_only THEN
   INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
   VALUES(p.id,cid,'RECURRING_DRAFT','Recurring claim draft ready',s.utility||' claim due '||due::text,'/claims/'||cid::text);
 END IF;
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

-- Update private.command router
CREATE OR REPLACE FUNCTION private.command(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles;
BEGIN
 IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';END IF;
 IF action='deactivate_recurring_payment' THEN PERFORM pg_advisory_xact_lock(720004);END IF;
 IF action='save_recurring_payment' THEN RETURN private.save_recurring_payment_v4(payload);END IF;
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

REVOKE ALL ON FUNCTION private.save_recurring_payment_v4(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.run_recurring_payments(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.command(text,jsonb) TO authenticated;

COMMIT;
