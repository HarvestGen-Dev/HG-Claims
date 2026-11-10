-- Additive v2 foundation. Historical status/role catalog values remain readable.
BEGIN;
INSERT INTO public.roles(code,name,description) VALUES ('FINANCE','Finance','Finance and system management')
ON CONFLICT(code) DO UPDATE SET name=excluded.name;
INSERT INTO public.audit_logs(action,entity_type,entity_id,before_data)
SELECT 'V2_ROLE_MIGRATION','user_roles',ur.user_id::text,jsonb_build_object('role',r.code)
FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE r.code IN ('CLAIMANT','FINANCE_OFFICER','SYSTEM_ADMIN');
INSERT INTO public.user_roles(user_id,role_id)
SELECT DISTINCT ur.user_id,(SELECT id FROM public.roles WHERE code='FINANCE')
FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE r.code IN ('FINANCE_OFFICER','SYSTEM_ADMIN')
ON CONFLICT(user_id,role_id) DO NOTHING;
DELETE FROM public.user_roles WHERE role_id IN (SELECT id FROM public.roles WHERE code NOT IN ('FINANCE','TEAM_LEAD'));
CREATE OR REPLACE FUNCTION private.enforce_v2_role_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.roles WHERE id=NEW.role_id AND code IN ('TEAM_LEAD','FINANCE')) THEN RAISE EXCEPTION 'Only TEAM_LEAD and FINANCE are assignable roles';END IF;RETURN NEW;
END $$;
CREATE TRIGGER enforce_v2_role_assignment BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION private.enforce_v2_role_assignment();
INSERT INTO public.user_roles(user_id,role_id) SELECT DISTINCT t.user_id,(SELECT id FROM public.roles WHERE code='TEAM_LEAD') FROM public.ministry_team_leads t JOIN public.profiles p ON p.id=t.user_id WHERE NOT p.is_payee_only ON CONFLICT(user_id,role_id) DO NOTHING;
-- Legacy aliases apply only inside historical functions, never as assignable grants.
CREATE OR REPLACE FUNCTION private.has_role(role_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id JOIN public.profiles p ON p.id=ur.user_id
 WHERE p.id=auth.uid() AND p.status='ACTIVE' AND r.code=CASE WHEN role_code IN ('SYSTEM_ADMIN','FINANCE_OFFICER') THEN 'FINANCE' ELSE role_code END);
$$;
ALTER TABLE public.ministries ADD COLUMN require_team_lead_approval boolean NOT NULL DEFAULT false,
 ADD COLUMN context_kind text CHECK(context_kind IN ('SPEAKER','EVENT','MISSION','MEETING'));
-- Only exact known team names are mapped; ambiguous historical entries are preserved.
UPDATE public.ministries SET context_kind=CASE lower(trim(name))
 WHEN 'speakers & guests' THEN 'SPEAKER' WHEN 'events (church-wide)' THEN 'EVENT'
 WHEN 'missions & outreach' THEN 'MISSION' WHEN 'leadership & development' THEN 'MEETING' END;
ALTER TABLE public.signup_invitations DROP CONSTRAINT signup_invitations_role_code_check;
ALTER TABLE public.signup_invitations ALTER COLUMN role_code DROP NOT NULL;
UPDATE public.signup_invitations SET role_code=CASE WHEN role_code IN ('SYSTEM_ADMIN','FINANCE_OFFICER') THEN 'FINANCE' WHEN role_code='TEAM_LEAD' THEN 'TEAM_LEAD' END;
ALTER TABLE public.signup_invitations ADD CHECK(role_code IS NULL OR role_code IN ('TEAM_LEAD','FINANCE'));
CREATE OR REPLACE FUNCTION public.nlcc_redeem_invitation(token_hash text,user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE i public.signup_invitations;
BEGIN
 SELECT * INTO i FROM public.signup_invitations si WHERE si.token_hash=nlcc_redeem_invitation.token_hash FOR UPDATE;
 IF i.id IS NULL OR NOT i.is_active OR i.expires_at<=now() OR i.use_count>=i.max_uses THEN RAISE EXCEPTION 'Invalid or expired invitation';END IF;
 UPDATE public.profiles SET onboarding_completed_at=NULL WHERE id=user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account profile missing';END IF;
 IF i.role_code IS NOT NULL THEN INSERT INTO public.user_roles(user_id,role_id) SELECT user_id,id FROM public.roles WHERE code=i.role_code ON CONFLICT DO NOTHING;END IF;
 UPDATE public.signup_invitations SET use_count=use_count+1,last_used_at=now(),is_active=use_count+1<max_uses WHERE id=i.id;
END $$;
REVOKE ALL ON FUNCTION public.nlcc_redeem_invitation(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nlcc_redeem_invitation(text,uuid) TO service_role;
INSERT INTO public.ministries(code,name,context_kind)
SELECT v.code,v.name,v.kind FROM (VALUES('V2_SPEAKERS','Speakers & Guests','SPEAKER'),('V2_EVENTS','Events (church-wide)','EVENT'),('V2_MISSIONS','Missions & Outreach','MISSION'),('V2_LEADERSHIP','Leadership & Development','MEETING')) v(code,name,kind)
WHERE NOT EXISTS(SELECT 1 FROM public.ministries m WHERE lower(trim(m.name))=lower(trim(v.name))) ON CONFLICT(code) DO NOTHING;
CREATE TABLE public.claim_dropdown_values(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('SPEAKER','EVENT','MISSION','MEETING')),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX claim_dropdown_unique_name ON public.claim_dropdown_values(kind,lower(trim(name)));
ALTER TABLE public.claim_dropdown_values ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.claim_dropdown_values TO authenticated;
CREATE POLICY dropdown_read ON public.claim_dropdown_values FOR SELECT TO authenticated USING(private.active_user());
ALTER TABLE public.claims ALTER COLUMN ministry_id DROP NOT NULL;
ALTER TABLE public.claims ADD COLUMN context_kind text CHECK(context_kind IN ('SPEAKER','EVENT','MISSION','MEETING')),
 ADD COLUMN context_value_id uuid REFERENCES public.claim_dropdown_values(id), ADD COLUMN context_name text,
 ADD COLUMN payee_payment_method text NOT NULL DEFAULT 'BANK_TRANSFER' CHECK(payee_payment_method IN ('BANK_TRANSFER','JOMPAY')),
 ADD COLUMN payee_payment_revision integer NOT NULL DEFAULT 1,
 ADD COLUMN jompay_details jsonb, ADD COLUMN payment_details_verified_at timestamptz, ADD COLUMN payment_details_verified_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.claim_expenses ADD COLUMN beneficiary_type text CHECK(beneficiary_type IN ('INTERNAL','EXTERNAL')),
 ADD COLUMN invoice_number text;
ALTER TABLE public.claim_attachments DROP CONSTRAINT IF EXISTS attachment_storage_path;
DROP INDEX IF EXISTS public.attachment_storage_path;
CREATE UNIQUE INDEX attachments_claim_path ON public.claim_attachments(claim_id,storage_path);
ALTER TABLE public.profiles ADD COLUMN payment_method text NOT NULL DEFAULT 'BANK_TRANSFER' CHECK(payment_method IN ('BANK_TRANSFER','JOMPAY')),
 ADD COLUMN jompay_biller_name text, ADD COLUMN jompay_biller_code text, ADD COLUMN jompay_reference_1 text, ADD COLUMN jompay_reference_2 text,
 ADD COLUMN payment_revision integer NOT NULL DEFAULT 1, ADD COLUMN verified_payment_revision integer,
 ADD COLUMN payment_verified_at timestamptz, ADD COLUMN payment_verified_by uuid REFERENCES public.profiles(id);
CREATE TABLE private.payment_detail_changes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payee_id uuid NOT NULL REFERENCES public.profiles(id),actor_id uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),old_value jsonb,new_value jsonb);
ALTER TABLE private.payment_detail_changes ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.claim_classification_changes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),claim_id uuid NOT NULL REFERENCES public.claims(id),editor_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),field text NOT NULL,old_value jsonb,new_value jsonb);
ALTER TABLE public.claim_classification_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claim_classification_changes FROM anon,authenticated;
ALTER TABLE public.reimbursement_batches ADD COLUMN payment_method text NOT NULL DEFAULT 'BANK_TRANSFER' CHECK(payment_method IN ('BANK_TRANSFER','JOMPAY'));
ALTER TABLE public.reimbursement_batch_instructions ADD COLUMN jompay_snapshot jsonb;
ALTER TABLE public.reimbursement_batch_instructions DROP CONSTRAINT reimbursement_batch_instructions_payment_mode_check;
ALTER TABLE public.reimbursement_batch_instructions ADD CHECK(payment_mode IN ('LIP','LGP','JOMPAY'));
ALTER TABLE public.payments DROP CONSTRAINT payments_payment_method_check;
ALTER TABLE public.payments ADD CHECK(payment_method IN ('BANK_TRANSFER','CHEQUE','CASH','ONLINE_BANKING','DUITNOW','OTHER','JOMPAY'));
-- New categories have stable codes; historical references and labels are retained.
INSERT INTO public.expense_categories(code,name,display_order) VALUES
 ('V2_FOOD','Food & drinks',1),('V2_TRANSPORT','Transport, parking & toll',2),('V2_ACCOMMODATION','Accommodation',3),
 ('V2_SPEAKER','Speaker fee / honorarium',4),('V2_GIFTS','Gifts & appreciation',5),
 ('V2_MEMBER_CARE','Member care (flowers, wreaths, hospital visits, condolence)',6),('V2_SUPPLIES','Supplies & consumables',7),
 ('V2_PRINTING','Printing & stationery',8),('V2_EQUIPMENT','Equipment or item to keep',9),('V2_REPAIR','Repair & servicing',10),
 ('V2_TRAINING','Training, conference & course fees',11),('V2_SUBSCRIPTION','Subscription & software',12),
 ('V2_SETUP','Event setup & rental',13),('V2_SUPPORT','Support or donation (person or church)',14),('V2_OTHER','Other (must explain)',15),('V2_UTILITIES','Utilities',16)
ON CONFLICT(code) DO NOTHING;
UPDATE public.system_settings SET value=value || '{"require_receipt_for_all_expenses":false,"require_vendor_name":false}'::jsonb WHERE key='claim_form_config';
INSERT INTO public.system_settings(key,value,description) VALUES('jompay_export_config','{"fail_email_1":"jonchiam@harvestgen.org","fail_email_2":""}','JomPAY failure notifications') ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.can_read_claim(claim_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.active_user() AND EXISTS(SELECT 1 FROM public.claims c WHERE c.id=claim_id AND
 (COALESCE(c.submitted_by_user_id,c.claimant_id)=auth.uid() OR private.has_role('FINANCE') OR
 (c.status<>'DRAFT' AND private.has_role('TEAM_LEAD') AND EXISTS(SELECT 1 FROM public.ministry_team_leads t WHERE t.user_id=auth.uid() AND t.ministry_id=c.ministry_id))));
$$;
DROP POLICY IF EXISTS "Authenticated users can read ministry budgets" ON public.ministry_budgets;
CREATE POLICY budget_read_scoped ON public.ministry_budgets FOR SELECT TO authenticated USING(private.active_user() AND
 (private.has_role('FINANCE') OR (private.has_role('TEAM_LEAD') AND EXISTS(SELECT 1 FROM public.ministry_team_leads t WHERE t.user_id=auth.uid() AND t.ministry_id=ministry_budgets.ministry_id))));
CREATE OR REPLACE FUNCTION private.enforce_claim_payee_access() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF NEW.claimant_id=auth.uid() OR private.has_role('FINANCE') OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.claimant_id AND p.is_payee_only AND p.status='ACTIVE') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Choose yourself or an active supplier' USING ERRCODE='42501';
END $$;
-- New ciphertext uses a generated database-private key. Historical AES remains readable.
CREATE TABLE private.payment_encryption_keys(version text PRIMARY KEY,key_material text NOT NULL);
ALTER TABLE private.payment_encryption_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.payment_encryption_keys FROM PUBLIC,anon,authenticated;
INSERT INTO private.payment_encryption_keys VALUES('legacy',private.get_encryption_key()),('v2',encode(extensions.gen_random_bytes(32),'hex'));
CREATE OR REPLACE FUNCTION private.get_encryption_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT key_material FROM private.payment_encryption_keys WHERE version='v2'; $$;
CREATE OR REPLACE FUNCTION private.encrypt_bank_account(p_account text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF nullif(trim(p_account),'') IS NULL THEN RETURN NULL;END IF;
 IF p_account LIKE 'enc:aes:%' OR p_account LIKE 'enc:v2:%' THEN RETURN p_account;END IF;
 RETURN 'enc:v2:'||encode(extensions.pgp_sym_encrypt(regexp_replace(trim(p_account),'[\s\-]','','g'),private.get_encryption_key()),'hex');
END $$;
CREATE OR REPLACE FUNCTION private.decrypt_bank_account(p_account text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_account LIKE 'enc:v2:%' THEN RETURN extensions.pgp_sym_decrypt(decode(substring(p_account FROM 8),'hex'),private.get_encryption_key());
 ELSIF p_account LIKE 'enc:aes:%' THEN RETURN extensions.pgp_sym_decrypt(decode(substring(p_account FROM 9),'hex'),(SELECT key_material FROM private.payment_encryption_keys WHERE version='legacy'));
 END IF;RETURN p_account;
END $$;
REVOKE ALL ON FUNCTION private.get_encryption_key(),private.encrypt_bank_account(text),private.decrypt_bank_account(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.payment_details_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE a jsonb; b jsonb;
BEGIN
 IF TG_OP='INSERT' THEN NEW.payment_revision=1;NEW.verified_payment_revision=NULL;RETURN NEW; END IF;
 a=jsonb_build_object('method',OLD.payment_method,'bank',OLD.bank_code,'holder',OLD.bank_account_holder_name,'account',private.decrypt_bank_account(OLD.bank_account_number),'biller',OLD.jompay_biller_name,'code',OLD.jompay_biller_code,'r1',OLD.jompay_reference_1,'r2',OLD.jompay_reference_2);
 b=jsonb_build_object('method',NEW.payment_method,'bank',NEW.bank_code,'holder',NEW.bank_account_holder_name,'account',private.decrypt_bank_account(NEW.bank_account_number),'biller',NEW.jompay_biller_name,'code',NEW.jompay_biller_code,'r1',NEW.jompay_reference_1,'r2',NEW.jompay_reference_2);
 IF a IS DISTINCT FROM b THEN
  NEW.payment_revision=OLD.payment_revision+1;NEW.verified_payment_revision=NULL;NEW.payment_verified_at=NULL;NEW.payment_verified_by=NULL;
  INSERT INTO private.payment_detail_changes(payee_id,actor_id,old_value,new_value)
  VALUES(NEW.id,auth.uid(),a || jsonb_build_object('account',OLD.bank_account_number),b || jsonb_build_object('account',private.encrypt_bank_account(b->>'account')));
 END IF;
 NEW.bank_account_number=private.encrypt_bank_account(private.decrypt_bank_account(NEW.bank_account_number));
 RETURN NEW;
END $$;
CREATE TRIGGER payment_details_revision BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.payment_details_revision();

CREATE OR REPLACE FUNCTION private.validate_claim_context(p_team uuid,p_kind text,p_value uuid,p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE required_kind text;
BEGIN
 SELECT context_kind INTO required_kind FROM public.ministries WHERE id=p_team AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active Team'; END IF;
 IF required_kind IS NOT NULL AND (p_kind IS DISTINCT FROM required_kind OR nullif(trim(p_name),'') IS NULL) THEN RAISE EXCEPTION 'Complete the required team-specific field'; END IF;
 IF p_kind IS NOT NULL AND p_kind NOT IN ('SPEAKER','EVENT','MISSION','MEETING') THEN RAISE EXCEPTION 'Invalid team context'; END IF;
 IF required_kind IS NULL AND p_kind IS NOT NULL AND p_kind<>'EVENT' THEN RAISE EXCEPTION 'Only optional Event applies to this Team'; END IF;
 IF p_kind IS NOT NULL AND nullif(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'Enter the context name'; END IF;
 IF p_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.claim_dropdown_values WHERE id=p_value AND kind=p_kind AND is_active AND name=p_name) THEN RAISE EXCEPTION 'Choose an active dropdown value or Other'; END IF;
END $$;
CREATE OR REPLACE FUNCTION private.validate_claim_item(p_item jsonb,p_submit boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE code text; amount numeric;
BEGIN
 amount=nullif(p_item->>'amount','')::numeric;
 IF amount IS NOT NULL AND (amount<0 OR amount<>round(amount,2) OR amount>9999999999.99) THEN RAISE EXCEPTION 'Enter a valid amount with at most two decimal places'; END IF;
 IF NOT p_submit THEN RETURN; END IF;
 IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'Each item needs a positive amount'; END IF;
 IF nullif(p_item->>'expense_date','') IS NULL THEN RAISE EXCEPTION 'Each item needs a date'; END IF;
 SELECT e.code INTO code FROM public.expense_categories e WHERE e.id=nullif(p_item->>'expense_category_id','')::uuid AND e.is_active;
 IF code IS NULL THEN RAISE EXCEPTION 'Choose What was it? for each item'; END IF;
 IF code='V2_OTHER' AND nullif(trim(p_item->>'description'),'') IS NULL THEN RAISE EXCEPTION 'Other requires an explanation'; END IF;
 IF code IN ('V2_FOOD','V2_TRANSPORT','V2_ACCOMMODATION','V2_GIFTS','V2_MEMBER_CARE','V2_SUPPORT') AND COALESCE(p_item->>'beneficiary_type','') NOT IN ('INTERNAL','EXTERNAL') THEN RAISE EXCEPTION 'Who was it for? is required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION private.build_workflow(claim_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE c public.claims; w uuid; needs_lead boolean; lead_self boolean; seq integer=1;
BEGIN
 SELECT * INTO STRICT c FROM public.claims WHERE id=claim_id;
 SELECT require_team_lead_approval INTO needs_lead FROM public.ministries WHERE id=c.ministry_id;
 SELECT EXISTS(SELECT 1 FROM public.ministry_team_leads t JOIN public.profiles p ON p.id=t.user_id JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id AND r.code='TEAM_LEAD'
 WHERE t.ministry_id=c.ministry_id AND p.status='ACTIVE') INTO lead_self;
 IF needs_lead AND NOT lead_self THEN RAISE EXCEPTION 'Team Lead approval is enabled but no active Team Lead is assigned. Contact Finance.'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.ministry_team_leads t JOIN public.user_roles ur ON ur.user_id=t.user_id JOIN public.roles r ON r.id=ur.role_id AND r.code='TEAM_LEAD' WHERE t.ministry_id=c.ministry_id AND t.user_id=COALESCE(c.submitted_by_user_id,c.claimant_id)) INTO lead_self;
 UPDATE public.claim_workflows SET is_current=false WHERE public.claim_workflows.claim_id=c.id;
 INSERT INTO public.claim_workflows(claim_id,version) VALUES(c.id,COALESCE((SELECT max(version)+1 FROM public.claim_workflows WHERE public.claim_workflows.claim_id=c.id),1)) RETURNING id INTO w;
 IF needs_lead AND NOT lead_self THEN
  INSERT INTO public.claim_workflow_steps(workflow_id,claim_id,sequence,step_name,approver_role,status,started_at) VALUES(w,c.id,1,'Team Lead review','TEAM_LEAD','IN_PROGRESS',now());seq=2;
 END IF;
 INSERT INTO public.claim_workflow_steps(workflow_id,claim_id,sequence,step_name,approver_role,status,started_at)
 VALUES(w,c.id,seq,'Finance review','FINANCE',CASE WHEN seq=1 THEN 'IN_PROGRESS' ELSE 'PENDING' END,CASE WHEN seq=1 THEN now() END);
 UPDATE public.claims SET current_step_sequence=1,status=CASE WHEN seq=1 THEN 'PENDING_FINANCE_REVIEW' ELSE 'PENDING_MINISTRY_APPROVAL' END WHERE id=c.id;
END $$;

-- Reuse shared storage objects with independent attachment rows. No storage deletion on detach.
CREATE OR REPLACE FUNCTION private.attach_claim_file(p_claim uuid,p_expense uuid,p_file jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE path text=p_file->>'storage_path'; config jsonb;
BEGIN
 SELECT value INTO config FROM public.system_settings WHERE key='claim_form_config';
 IF NOT (split_part(path,'/',1)=auth.uid()::text OR EXISTS(SELECT 1 FROM public.claim_attachments a WHERE a.storage_path=path AND private.can_read_claim(a.claim_id))) THEN
 RAISE EXCEPTION 'Attachment access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.claim_attachments(claim_id,expense_id,storage_path,original_filename,mime_type,file_size,file_category,uploaded_by)
 SELECT p_claim,p_expense,o.name,COALESCE(p_file->>'original_filename','Receipt'),o.metadata->>'mimetype',(o.metadata->>'size')::bigint,
 COALESCE(p_file->>'file_category','RECEIPT'),auth.uid() FROM storage.objects o
 WHERE o.bucket_id='receipts' AND o.name=path AND (o.metadata->>'size')::bigint>0 AND (o.metadata->>'size')::bigint<=COALESCE((config->>'max_file_size_mb')::integer,10)*1048576
 ON CONFLICT(claim_id,storage_path) DO UPDATE SET expense_id=COALESCE(excluded.expense_id,public.claim_attachments.expense_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt file is missing or too large'; END IF;
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
 SELECT * INTO p FROM public.profiles WHERE id=COALESCE(nullif(payload->>'payee_profile_id','')::uuid,uid) AND status='ACTIVE';
 IF p.id IS NULL OR (p.id<>uid AND NOT p.is_payee_only AND NOT private.has_role('FINANCE')) THEN RAISE EXCEPTION 'Choose yourself or an active supplier' USING ERRCODE='42501'; END IF;
 -- Existing Draft/Returned payee snapshots stay unchanged unless the submitter explicitly refreshes the supplier.
 IF c.id IS NOT NULL AND c.claimant_id=p.id AND p.id<>uid AND NOT COALESCE((payload->>'refresh_payee_details')::boolean,false) THEN
 p.bank_code=c.bank_code;p.bank_name=c.bank_name;p.bank_account_number=c.bank_account_number;p.bank_account_holder_name=c.bank_account_holder_name;
 p.payment_method=c.payee_payment_method;p.payment_revision=c.payee_payment_revision;
 p.jompay_biller_name=c.jompay_details->>'biller_name';p.jompay_biller_code=c.jompay_details->>'biller_code';p.jompay_reference_1=c.jompay_details->>'reference_1';p.jompay_reference_2=c.jompay_details->>'reference_2';
 p.beneficiary_new_ic=c.beneficiary_new_ic;p.beneficiary_old_ic=c.beneficiary_old_ic;p.beneficiary_business_reg=c.beneficiary_business_reg;p.beneficiary_others=c.beneficiary_others;p.beneficiary_address=c.beneficiary_address;
 END IF;
 IF jsonb_typeof(payload->'expenses') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'expenses')>100 THEN RAISE EXCEPTION 'Invalid item list'; END IF;
 IF action='submit_claim' THEN
 PERFORM private.validate_claim_context(nullif(payload->>'ministry_id','')::uuid,payload->>'context_kind',nullif(payload->>'context_value_id','')::uuid,payload->>'context_name');
 IF jsonb_array_length(payload->'expenses')=0 THEN RAISE EXCEPTION 'Add at least one item'; END IF;
 END IF;
 bank=private.resolve_canonical_swift_code(COALESCE(nullif(payload->>'bank_code',''),p.bank_code,p.bank_name));
 acct=COALESCE(nullif(regexp_replace(payload->>'bank_account_number','[\s\-]','','g'),''),private.decrypt_bank_account(p.bank_account_number));
 -- Supplier details are managed centrally, never silently changed by a claimant.
 IF p.id<>uid THEN bank=p.bank_code;acct=private.decrypt_bank_account(p.bank_account_number); END IF;
 IF action='submit_claim' AND p.payment_method='BANK_TRANSFER' AND (bank IS NULL OR COALESCE(acct,'') !~ '^[0-9]{6,20}$' OR COALESCE(nullif(payload->>'bank_account_holder_name',''),p.bank_account_holder_name,p.full_name) IS NULL) THEN RAISE EXCEPTION 'Complete the bank, account number and account holder name'; END IF;
 IF action='submit_claim' AND p.payment_method='JOMPAY' AND (COALESCE(p.jompay_biller_code,'')!~'^[0-9]+$' OR nullif(trim(p.jompay_reference_1),'') IS NULL) THEN RAISE EXCEPTION 'JomPAY payee needs Biller Code and Reference 1'; END IF;
 IF cid IS NULL THEN
 INSERT INTO public.claims(submitted_by_user_id,claimant_id,claimant_name,ministry_id,claim_date,purpose,request_key)
 VALUES(uid,p.id,COALESCE(nullif(payload->>'claimant_name',''),p.full_name),nullif(payload->>'ministry_id','')::uuid,COALESCE(nullif(payload->>'claim_date','')::date,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),COALESCE(payload->>'purpose',''),nullif(payload->>'request_key','')::uuid) RETURNING id INTO cid;
 END IF;
 UPDATE public.claims SET claimant_id=p.id,claimant_name=COALESCE(payload->>'claimant_name',p.full_name),claimant_email=COALESCE(payload->>'claimant_email',p.email),claimant_phone=COALESCE(payload->>'claimant_phone',p.phone),
 bank_code=bank,bank_name=(SELECT bank_name FROM public.bank_directory WHERE swift_code=bank),bank_account_number=private.encrypt_bank_account(acct),
 bank_account_holder_name=CASE WHEN p.id<>uid THEN p.bank_account_holder_name ELSE COALESCE(nullif(payload->>'bank_account_holder_name',''),p.bank_account_holder_name,p.full_name) END,
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

CREATE OR REPLACE FUNCTION private.duplicate_claim_v2(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE original public.claims; cid uuid; key uuid=(payload->>'request_key')::uuid;
BEGIN
 IF key IS NULL THEN RAISE EXCEPTION 'Request key required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || key::text,0));
 SELECT id INTO cid FROM public.claims WHERE submitted_by_user_id=auth.uid() AND request_key=key;
 IF cid IS NOT NULL THEN RETURN jsonb_build_object('id',cid); END IF;
 SELECT * INTO original FROM public.claims WHERE id=(payload->>'claim_id')::uuid;
 IF original.id IS NULL OR NOT private.can_read_claim(original.id) OR (COALESCE(original.submitted_by_user_id,original.claimant_id)<>auth.uid() AND NOT private.has_role('FINANCE')) THEN RAISE EXCEPTION 'Only your own claims may be duplicated' USING ERRCODE='42501'; END IF;
 -- Part 1 = claimant identity/contact, payee profile, bank and beneficiary details.
 -- Part 2 = Team, date (today), purpose, reference, context and every expense item.
 INSERT INTO public.claims(submitted_by_user_id,claimant_id,claimant_name,claimant_email,claimant_phone,bank_name,bank_code,bank_account_holder_name,bank_account_number,beneficiary_new_ic,beneficiary_old_ic,beneficiary_business_reg,beneficiary_others,beneficiary_address,claim_date,purpose,status,request_key,payee_payment_method,payee_payment_revision,jompay_details)
 VALUES(auth.uid(),original.claimant_id,original.claimant_name,original.claimant_email,original.claimant_phone,original.bank_name,original.bank_code,original.bank_account_holder_name,original.bank_account_number,original.beneficiary_new_ic,original.beneficiary_old_ic,original.beneficiary_business_reg,original.beneficiary_others,original.beneficiary_address,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,'','DRAFT',key,original.payee_payment_method,original.payee_payment_revision,original.jompay_details) RETURNING id INTO cid;
 INSERT INTO public.claim_attachments(claim_id,storage_path,original_filename,mime_type,file_size,file_category,uploaded_by)
 SELECT cid,storage_path,original_filename,mime_type,file_size,file_category,auth.uid() FROM public.claim_attachments WHERE claim_id=original.id;
 INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data) VALUES(auth.uid(),'DUPLICATE_CLAIM','claims',cid::text,jsonb_build_object('source_claim_id',original.id));
 RETURN jsonb_build_object('id',cid);
END $$;

CREATE OR REPLACE FUNCTION private.review_claim_v2(action text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE c public.claims;s public.claim_workflow_steps;n public.claim_workflow_steps;uid uuid=auth.uid();finance boolean=private.has_role('FINANCE');old_status text;code text;e jsonb;before_row jsonb;after_row jsonb;field text;cat text;
BEGIN
 SELECT * INTO c FROM public.claims WHERE id=(payload->>'claim_id')::uuid FOR UPDATE;
 IF c.id IS NULL OR NOT private.can_read_claim(c.id) THEN RAISE EXCEPTION 'Claim not accessible' USING ERRCODE='42501'; END IF;
 IF c.version IS DISTINCT FROM (payload->>'version')::integer THEN RAISE EXCEPTION 'This claim changed. Refresh before continuing' USING ERRCODE='PT409'; END IF;
 old_status=c.status;
 SELECT st.* INTO s FROM public.claim_workflow_steps st JOIN public.claim_workflows w ON w.id=st.workflow_id AND w.is_current WHERE st.claim_id=c.id AND st.status='IN_PROGRESS' FOR UPDATE OF st;
 IF action='correct' THEN
 IF NOT finance OR c.status NOT IN ('PENDING_FINANCE_REVIEW','PENDING_MINISTRY_APPROVAL','APPROVED_FOR_PAYMENT') OR c.active_batch_id IS NOT NULL THEN RAISE EXCEPTION 'Classification editing is not available' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('claim_id','version','reason','ministry_id','context_kind','context_value_id','context_name','expenses','purpose','internal_reference')) THEN RAISE EXCEPTION 'Finance cannot modify amount or payee. Return the claim for correction.' USING ERRCODE='42501'; END IF;
 IF nullif(trim(payload->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Correction reason required'; END IF;
 before_row=to_jsonb(c);
 UPDATE public.claims SET ministry_id=CASE WHEN payload?'ministry_id' THEN (payload->>'ministry_id')::uuid ELSE ministry_id END,
 context_kind=CASE WHEN payload?'context_kind' THEN payload->>'context_kind' ELSE context_kind END,
 context_value_id=CASE WHEN payload?'context_value_id' THEN nullif(payload->>'context_value_id','')::uuid ELSE context_value_id END,
 context_name=CASE WHEN payload?'context_name' THEN nullif(trim(payload->>'context_name'),'') ELSE context_name END,
 purpose=COALESCE(payload->>'purpose',purpose),internal_reference=COALESCE(payload->>'internal_reference',internal_reference) WHERE id=c.id RETURNING * INTO c;
 PERFORM private.validate_claim_context(c.ministry_id,c.context_kind,c.context_value_id,c.context_name);
 after_row=to_jsonb(c);
 IF before_row->>'ministry_id' IS DISTINCT FROM after_row->>'ministry_id' AND c.status IN ('PENDING_FINANCE_REVIEW','PENDING_MINISTRY_APPROVAL') THEN PERFORM private.build_workflow(c.id);END IF;
 FOREACH field IN ARRAY ARRAY['ministry_id','context_kind','context_value_id','context_name','purpose','internal_reference'] LOOP
 IF before_row->field IS DISTINCT FROM after_row->field THEN INSERT INTO public.claim_classification_changes(claim_id,editor_id,field,old_value,new_value) VALUES(c.id,uid,field,before_row->field,after_row->field); END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'expenses','[]')) LOOP
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(e) k WHERE k NOT IN ('id','expense_category_id','beneficiary_type','description')) THEN RAISE EXCEPTION 'Finance cannot modify expense amounts' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(x) INTO before_row FROM public.claim_expenses x WHERE x.id=(e->>'id')::uuid AND claim_id=c.id;
 IF before_row IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;
 PERFORM private.validate_claim_item(before_row || e,true);
 SELECT code INTO cat FROM public.expense_categories WHERE id=COALESCE(nullif(e->>'expense_category_id','')::uuid,(before_row->>'expense_category_id')::uuid);
 UPDATE public.claim_expenses SET expense_category_id=COALESCE(nullif(e->>'expense_category_id','')::uuid,expense_category_id),
 beneficiary_type=CASE WHEN cat IN ('V2_FOOD','V2_TRANSPORT','V2_ACCOMMODATION','V2_GIFTS','V2_MEMBER_CARE','V2_SUPPORT') THEN CASE WHEN e?'beneficiary_type' THEN e->>'beneficiary_type' ELSE beneficiary_type END END,
 description=COALESCE(e->>'description',description) WHERE id=(e->>'id')::uuid RETURNING to_jsonb(claim_expenses.*) INTO after_row;
 FOREACH field IN ARRAY ARRAY['expense_category_id','beneficiary_type','description'] LOOP
 IF before_row->field IS DISTINCT FROM after_row->field THEN INSERT INTO public.claim_classification_changes(claim_id,editor_id,field,old_value,new_value) VALUES(c.id,uid,'expenses.'||(e->>'id')||'.'||field,before_row->field,after_row->field); END IF;
 END LOOP;
 END LOOP;
 code='ADMIN_OVERRIDE';
 ELSIF action='verify' THEN
 IF NOT finance OR c.status<>'PENDING_FINANCE_REVIEW' THEN RAISE EXCEPTION 'Finance verification not allowed' USING ERRCODE='42501'; END IF;
 INSERT INTO public.finance_reviews(claim_id,reviewer_id,receipts_verified,category_verified,cost_centre_verified,status,notes) VALUES(c.id,uid,true,true,true,'VERIFIED',payload->>'reason');code='VERIFY';
 ELSIF action IN ('approve','return','reject') THEN
 IF NOT ((action='return' AND finance AND c.status='APPROVED_FOR_PAYMENT' AND c.active_batch_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.payments WHERE claim_id=c.id)) OR (s.id IS NOT NULL AND ((c.status='PENDING_FINANCE_REVIEW' AND finance) OR (c.status='PENDING_MINISTRY_APPROVAL' AND private.has_role('TEAM_LEAD') AND COALESCE(c.submitted_by_user_id,c.claimant_id)<>uid AND EXISTS(SELECT 1 FROM public.ministry_team_leads t WHERE t.ministry_id=c.ministry_id AND t.user_id=uid))))) THEN RAISE EXCEPTION 'This claim is not awaiting your review' USING ERRCODE='42501'; END IF;
 IF action IN ('return','reject') AND nullif(trim(payload->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF action='approve' THEN
 UPDATE public.claim_workflow_steps SET status='COMPLETED',completed_at=now(),completed_by=uid,action_taken='APPROVE',comments=payload->>'reason' WHERE id=s.id;
 SELECT * INTO n FROM public.claim_workflow_steps WHERE workflow_id=s.workflow_id AND status='PENDING' ORDER BY sequence LIMIT 1;
 IF n.id IS NOT NULL THEN UPDATE public.claim_workflow_steps SET status='IN_PROGRESS',started_at=now() WHERE id=n.id;UPDATE public.claims SET status='PENDING_FINANCE_REVIEW',current_step_sequence=n.sequence WHERE id=c.id;
 ELSE
 IF NOT finance THEN RAISE EXCEPTION 'Only Finance can approve a claim' USING ERRCODE='42501'; END IF;
 UPDATE public.claims SET status='APPROVED_FOR_PAYMENT',reimbursement_status='ELIGIBLE',approved_by=uid,approved_at=now(),current_step_sequence=NULL,
 approved_snapshot=jsonb_build_object('approved_amount_cents',round(c.total_amount*100)::bigint,'approved_amount',c.total_amount,'currency',c.currency,'beneficiary_user_id',c.claimant_id,
 'bank_account_holder_name',c.bank_account_holder_name,'bank_name',c.bank_name,'bank_code',c.bank_code,'bank_account_number',c.bank_account_number,
 'beneficiary_new_ic',c.beneficiary_new_ic,'beneficiary_old_ic',c.beneficiary_old_ic,'beneficiary_business_reg',c.beneficiary_business_reg,'beneficiary_others',c.beneficiary_others,'beneficiary_address',c.beneficiary_address,
 'payment_method',c.payee_payment_method,'payment_revision',c.payee_payment_revision,'jompay',c.jompay_details,'approved_at',now(),'approved_by',uid) WHERE id=c.id;
 END IF;code='APPROVE';
 ELSE
 IF c.status='APPROVED_FOR_PAYMENT' THEN UPDATE public.claims SET approved_snapshot=NULL,approved_at=NULL,approved_by=NULL,reimbursement_status=NULL WHERE id=c.id;END IF;
 UPDATE public.claim_workflow_steps SET status=CASE WHEN action='return' THEN 'RETURNED' ELSE 'REJECTED' END,completed_by=uid,completed_at=now(),action_taken=action,comments=payload->>'reason' WHERE id=s.id;
 UPDATE public.claims SET status=CASE WHEN action='return' THEN 'RETURNED_FOR_CLARIFICATION' ELSE 'REJECTED' END,clarification_reason=CASE WHEN action='return' THEN payload->>'reason' ELSE clarification_reason END,rejection_reason=CASE WHEN action='reject' THEN payload->>'reason' ELSE rejection_reason END,returned_by=CASE WHEN action='return' THEN uid ELSE returned_by END,returned_at=CASE WHEN action='return' THEN now() ELSE returned_at END WHERE id=c.id;
 code=CASE WHEN action='return' THEN 'RETURN_FOR_CLARIFICATION' ELSE 'REJECT' END;
 END IF;
 ELSE RAISE EXCEPTION 'Unknown review action'; END IF;
 UPDATE public.claims SET version=version+1,updated_at=now() WHERE id=c.id;
 INSERT INTO public.approval_actions(claim_id,workflow_step_id,actor_id,actor_role,action,comment,previous_status,new_status) SELECT c.id,s.id,uid,CASE WHEN finance THEN 'FINANCE' ELSE 'TEAM_LEAD' END,code,payload->>'reason',old_status,status FROM public.claims WHERE id=c.id;
 PERFORM private.notify_claim(c.id,'Claim updated');
 RETURN jsonb_build_object('id',c.id);
END $$;

-- Preserve the existing bank batch engine; entry points are restricted by the v2 dispatcher.
CREATE OR REPLACE FUNCTION private.legacy_commands_v2(action text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  uid uuid; admin boolean; finance boolean; config jsonb;
  c public.claims%ROWTYPE; s public.claim_workflow_steps%ROWTYPE;
  next_step public.claim_workflow_steps%ROWTYPE;
  cid uuid; total numeric; action_code text; previous_status text; submitter uuid;
  row_id uuid; entity jsonb; table_name text; item jsonb;
  v_bank_code text; v_bank_name text; v_holder_name text; v_acct text;
  v_batch_id uuid; v_batch public.reimbursement_batches%ROWTYPE;
  v_inst public.reimbursement_batch_instructions%ROWTYPE;
  v_claim_ids uuid[]; v_claim_count integer; v_transfer_count integer;
  v_total_cents bigint; v_batch_num text; v_digest text; v_line_order integer;
  v_pay_desc text; v_inst_id uuid; v_group record;
  v_unsettled_count integer; v_paid_count integer; v_failed_count integer;
  v_claimant_id uuid; v_payee_prof public.profiles%ROWTYPE;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  uid=auth.uid(); admin=private.has_role('SYSTEM_ADMIN'); finance=private.has_role('FINANCE_OFFICER');
  SELECT value INTO config FROM public.system_settings WHERE key='claim_form_config';

  IF action IN ('save_draft','submit_claim') THEN
    IF payload->>'request_key' IS NOT NULL THEN
      BEGIN
        PERFORM (payload->>'request_key')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid request key format';
      END;
    END IF;

    IF NOT (admin OR private.has_role('MINISTRY_LEADER')) THEN
      RAISE EXCEPTION 'Ministry Leader or System Admin access is required to submit claims' USING ERRCODE='42501';
    END IF;
    IF payload->>'id' IS NOT NULL THEN
      cid=(payload->>'id')::uuid;
    ELSIF payload->>'request_key' IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || (payload->>'request_key'),0));
      SELECT id INTO cid FROM public.claims WHERE (submitted_by_user_id=uid OR claimant_id=uid)
        AND request_key=(payload->>'request_key')::uuid;
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

    -- Resolve linked Claimant / Payee Profile if selected from dropdown
    v_claimant_id := uid;
    IF NULLIF(trim(COALESCE(payload->>'payee_profile_id', '')), '') IS NOT NULL THEN
      SELECT * INTO v_payee_prof FROM public.profiles WHERE id = (payload->>'payee_profile_id')::uuid AND status = 'ACTIVE';
      IF v_payee_prof.id IS NOT NULL THEN
        v_claimant_id := v_payee_prof.id;
      END IF;
    ELSIF NULLIF(trim(COALESCE(payload->>'claimant_id', '')), '') IS NOT NULL THEN
      SELECT * INTO v_payee_prof FROM public.profiles WHERE id = (payload->>'claimant_id')::uuid AND status = 'ACTIVE';
      IF v_payee_prof.id IS NOT NULL AND (v_payee_prof.id = uid OR COALESCE(v_payee_prof.is_payee_only, FALSE) = TRUE) THEN
        v_claimant_id := v_payee_prof.id;
      END IF;
    END IF;
    IF v_payee_prof.id IS NULL THEN
      SELECT * INTO v_payee_prof FROM public.profiles WHERE id = v_claimant_id;
    END IF;

    v_bank_code := private.resolve_canonical_swift_code(COALESCE(
      NULLIF(trim(payload->>'bank_code'),''),
      NULLIF(trim(payload->>'bank_name'),''),
      v_payee_prof.bank_code,
      v_payee_prof.bank_name
    ));
    IF v_bank_code IS NOT NULL THEN
      SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    ELSE
      v_bank_name := COALESCE(NULLIF(trim(COALESCE(payload->>'bank_name','')),''), v_payee_prof.bank_name);
    END IF;
    v_holder_name := COALESCE(
      NULLIF(trim(COALESCE(payload->>'bank_account_holder_name','')),''),
      NULLIF(trim(COALESCE(v_payee_prof.bank_account_holder_name,'')),''),
      NULLIF(trim(COALESCE(payload->>'claimant_name','')),''),
      v_payee_prof.full_name
    );
    v_acct := COALESCE(
      NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number','')), '[\s\-]', '', 'g'), ''),
      NULLIF(regexp_replace(trim(COALESCE(v_payee_prof.bank_account_number,'')), '[\s\-]', '', 'g'), '')
    );

    IF action='submit_claim' THEN
      IF NOT COALESCE((payload->>'declaration_accepted')::boolean,false) OR
        length(trim(COALESCE(payload->>'claimant_name', v_payee_prof.full_name, '')))=0 OR length(trim(COALESCE(payload->>'purpose','')))=0 OR
        jsonb_array_length(payload->'expenses')=0 THEN
        RAISE EXCEPTION 'Complete the claimant name, purpose, receipts, and accept the declaration';
      END IF;
      IF v_acct IS NOT NULL AND v_acct !~ '^[A-Za-z0-9]{5,34}$' THEN
        RAISE EXCEPTION 'Enter a valid bank account number (5 to 34 characters)';
      END IF;
    END IF;

    previous_status=COALESCE(c.status,'DRAFT');
    IF cid IS NULL THEN
      INSERT INTO public.claims(
        submitted_by_user_id, claimant_id, claimant_name, claimant_email, claimant_phone,
        bank_name, bank_code, bank_account_holder_name, bank_account_number,
        beneficiary_new_ic, beneficiary_old_ic, beneficiary_business_reg, beneficiary_others, beneficiary_address,
        ministry_id, claim_date, purpose, internal_reference, request_key
      )
      VALUES(
        uid, v_claimant_id, COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_name','')),''), v_payee_prof.full_name, ''),
        COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_email','')),''), v_payee_prof.email),
        COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_phone','')),''), v_payee_prof.phone),
        v_bank_name, v_bank_code, v_holder_name, v_acct,
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''), v_payee_prof.beneficiary_new_ic),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_old_ic','')),''), v_payee_prof.beneficiary_old_ic),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_business_reg','')),''), v_payee_prof.beneficiary_business_reg),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_others','')),''), v_payee_prof.beneficiary_others),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''), v_payee_prof.beneficiary_address),
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
        claimant_id=v_claimant_id,
        claimant_name=COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_name','')),''), v_payee_prof.full_name, c.claimant_name),
        claimant_email=COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_email','')),''), v_payee_prof.email),
        claimant_phone=COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_phone','')),''), v_payee_prof.phone),
        bank_name=v_bank_name,
        bank_code=v_bank_code,
        bank_account_holder_name=v_holder_name,
        bank_account_number=v_acct,
        beneficiary_new_ic=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''), v_payee_prof.beneficiary_new_ic),
        beneficiary_old_ic=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_old_ic','')),''), v_payee_prof.beneficiary_old_ic),
        beneficiary_business_reg=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_business_reg','')),''), v_payee_prof.beneficiary_business_reg),
        beneficiary_others=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_others','')),''), v_payee_prof.beneficiary_others),
        beneficiary_address=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''), v_payee_prof.beneficiary_address),
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
      IF NULLIF(item->>'expense_category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.expense_categories WHERE id=(item->>'expense_category_id')::uuid AND is_active) THEN
        RAISE EXCEPTION 'Choose an active expense category';
      END IF;
      IF NULLIF(item->>'cost_centre_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centres WHERE id=(item->>'cost_centre_id')::uuid AND is_active AND (ministry_id IS NULL OR ministry_id=(payload->>'ministry_id')::uuid)) THEN
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
        cid, (item->>'expense_date')::date, NULLIF(item->>'expense_category_id','')::uuid,
        NULLIF(item->>'cost_centre_id','')::uuid, NULLIF(trim(COALESCE(item->>'vendor','')),''),
        trim(COALESCE(item->>'description','')), (item->>'amount')::numeric,
        COALESCE((item->>'sort_order')::integer, 0)
      )
      RETURNING id INTO row_id;

      IF action='submit_claim' AND COALESCE((config->>'require_receipt_for_all_expenses')::boolean,true) THEN
        IF (item->'attachment' IS NULL OR jsonb_typeof(item->'attachment') = 'null') AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(payload->'attachments','[]')) att
          WHERE att->>'temp_id' = item->>'temp_id' OR att->>'expense_temp_id' = item->>'temp_id' OR att->>'expense_id' = item->>'id'
        ) THEN
          RAISE EXCEPTION 'Receipt #%: Please upload the supporting receipt', COALESCE(item->>'sort_order','1');
        END IF;
      END IF;

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
      IF submitter=uid OR c.claimant_id=uid THEN RAISE EXCEPTION 'You cannot approve your own submission' USING ERRCODE='42501'; END IF;
      IF s.id IS NULL OR c.status<>'PENDING_FINANCE_REVIEW' OR NOT (finance OR admin) THEN
        RAISE EXCEPTION 'Finance Officer or System Admin access is required for a claim awaiting finance review' USING ERRCODE='42501';
      END IF;
      IF action IN ('return','reject') AND length(trim(COALESCE(payload->>'reason','')))=0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
      IF action='approve' THEN
        IF COALESCE((payload->>'auto_verify')::boolean, false) AND NOT EXISTS(
          SELECT 1 FROM public.finance_reviews WHERE claim_id=c.id AND status='VERIFIED' AND created_at>=COALESCE(c.resubmitted_at,c.submitted_at)
        ) THEN
          INSERT INTO public.finance_reviews(claim_id,reviewer_id,receipts_verified,category_verified,cost_centre_verified,status,notes)
          VALUES(c.id,uid,true,true,true,'VERIFIED',COALESCE(payload->>'reason','Receipts verified during approval'));
        END IF;
        IF s.approver_role='FINANCE_OFFICER' AND NOT EXISTS(SELECT 1 FROM public.finance_reviews WHERE claim_id=c.id AND status='VERIFIED' AND created_at>=COALESCE(c.resubmitted_at,c.submitted_at)) THEN RAISE EXCEPTION 'Verify receipts and allocations before finance approval'; END IF;
        UPDATE public.claim_workflow_steps SET status='COMPLETED',completed_at=now(),completed_by=uid,action_taken='APPROVE',comments=payload->>'reason' WHERE id=s.id;
        SELECT * INTO next_step FROM public.claim_workflow_steps WHERE workflow_id=s.workflow_id AND status='PENDING' ORDER BY sequence LIMIT 1;
        IF next_step.id IS NULL THEN
          c.status='APPROVED_FOR_PAYMENT';
          c.reimbursement_status='ELIGIBLE';
          c.approved_at=now();
          c.approved_by=uid;
          v_bank_code := COALESCE(c.bank_code, private.resolve_canonical_swift_code(c.bank_name));
          IF v_bank_code IS NOT NULL THEN
            SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
          ELSE
            v_bank_name := c.bank_name;
          END IF;
          c.bank_code := v_bank_code;
          c.bank_name := COALESCE(v_bank_name, c.bank_name);
          c.bank_account_holder_name := COALESCE(NULLIF(trim(c.bank_account_holder_name),''), c.claimant_name);
          c.approved_snapshot := jsonb_build_object(
            'approved_amount_cents', round(c.total_amount * 100)::bigint,
            'approved_amount', c.total_amount,
            'currency', COALESCE(c.currency, 'MYR'),
            'beneficiary_user_id', submitter,
            'bank_account_holder_name', c.bank_account_holder_name,
            'bank_name', c.bank_name,
            'bank_code', c.bank_code,
            'bank_account_number', c.bank_account_number,
            'beneficiary_new_ic', c.beneficiary_new_ic,
            'beneficiary_old_ic', c.beneficiary_old_ic,
            'beneficiary_business_reg', c.beneficiary_business_reg,
            'beneficiary_others', c.beneficiary_others,
            'beneficiary_address', c.beneficiary_address,
            'approved_at', now(),
            'approved_by', uid
          );
        ELSE
          UPDATE public.claim_workflow_steps SET status='IN_PROGRESS',started_at=now() WHERE id=next_step.id;
          c.status=CASE next_step.approver_role WHEN 'FINANCE_OFFICER' THEN 'PENDING_FINANCE_REVIEW' WHEN 'FINAL_APPROVER' THEN 'PENDING_FINAL_APPROVAL' ELSE 'PENDING_MINISTRY_APPROVAL' END;
        END IF;
        action_code='APPROVE';
      ELSE
        UPDATE public.claim_workflow_steps SET status=CASE WHEN action='return' THEN 'RETURNED' ELSE 'REJECTED' END,
          completed_at=now(),completed_by=uid,action_taken=upper(action),comments=payload->>'reason' WHERE id=s.id;
        c.status=CASE WHEN action='return' THEN 'RETURNED_FOR_CLARIFICATION' ELSE 'REJECTED' END;
        IF action='return' THEN c.clarification_reason=payload->>'reason'; c.returned_by=uid; c.returned_at=now();
        ELSE c.rejection_reason=payload->>'reason'; END IF;
        action_code=CASE WHEN action='return' THEN 'RETURN_FOR_CLARIFICATION' ELSE 'REJECT' END;
      END IF;
    ELSIF action='verify' THEN
      IF NOT (finance OR admin) OR c.status<>'PENDING_FINANCE_REVIEW' THEN RAISE EXCEPTION 'Finance verification is not allowed' USING ERRCODE='42501'; END IF;
      INSERT INTO public.finance_reviews(claim_id,reviewer_id,receipts_verified,category_verified,cost_centre_verified,notes)
      VALUES(c.id,uid,true,true,true,payload->>'reason'); action_code='VERIFY';
    ELSIF action='pay' THEN
      IF NOT (finance OR admin) OR c.status<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Payment is not allowed' USING ERRCODE='42501'; END IF;
      IF c.active_batch_id IS NOT NULL THEN RAISE EXCEPTION 'This claim is reserved in a reimbursement batch. Reconcile payment through the batch.'; END IF;
      IF (payload->>'amount')::numeric IS DISTINCT FROM c.total_amount OR length(trim(COALESCE(payload->>'payment_reference','')))=0 THEN RAISE EXCEPTION 'Payment must match the approved total and include a reference'; END IF;
      INSERT INTO public.payments(claim_id,amount,payment_date,payment_reference,payment_method,notes,processed_by)
      VALUES(c.id,c.total_amount,(payload->>'payment_date')::date,trim(payload->>'payment_reference'),payload->>'payment_method',payload->>'notes',uid);
      c.status='PAID'; c.reimbursement_status='PAID'; action_code='PAY';
    ELSIF action='correct' THEN
      IF NOT (finance OR admin) OR c.status='PAID' OR length(trim(COALESCE(payload->>'reason','')))=0 THEN RAISE EXCEPTION 'Correction not allowed or reason missing' USING ERRCODE='42501'; END IF;
      IF c.active_batch_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot modify a claim while it is reserved in an active reimbursement batch'; END IF;
      v_bank_code := COALESCE(private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(payload->>'bank_code'),''), payload->>'bank_name')), c.bank_code);
      IF v_bank_code IS NOT NULL THEN
        SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
      ELSE
        v_bank_name := COALESCE(payload->>'bank_name', c.bank_name);
      END IF;
      v_acct := COALESCE(NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number','')), '[\s\-]', '', 'g'), ''), c.bank_account_number);
      v_holder_name := COALESCE(NULLIF(trim(COALESCE(payload->>'bank_account_holder_name','')),''), c.bank_account_holder_name, c.claimant_name);
      UPDATE public.claims SET
        internal_reference=COALESCE(payload->>'internal_reference',internal_reference),
        bank_name=v_bank_name,
        bank_code=v_bank_code,
        bank_account_holder_name=v_holder_name,
        bank_account_number=v_acct,
        purpose=COALESCE(payload->>'purpose',purpose),
        approved_snapshot=CASE WHEN c.status='APPROVED_FOR_PAYMENT' THEN
          COALESCE(c.approved_snapshot, '{}'::jsonb) || jsonb_build_object(
            'bank_name', v_bank_name,
            'bank_code', v_bank_code,
            'bank_account_holder_name', v_holder_name,
            'bank_account_number', v_acct
          )
        ELSE c.approved_snapshot END
      WHERE id=c.id;
      action_code='ADMIN_OVERRIDE';
    ELSE
      IF length(trim(COALESCE(payload->>'content','')))=0 OR length(payload->>'content')>5000 THEN RAISE EXCEPTION 'Comment must contain 1 to 5000 characters'; END IF;
      IF payload->>'visibility'='FINANCE_INTERNAL' AND NOT (finance OR admin) THEN RAISE EXCEPTION 'Internal notes are restricted' USING ERRCODE='42501'; END IF;
      IF payload->>'visibility' NOT IN ('PUBLIC_WORKFLOW','FINANCE_INTERNAL') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
      INSERT INTO public.claim_comments(claim_id,author_id,author_role,content,visibility) VALUES(c.id,uid,
        CASE WHEN admin THEN 'SYSTEM_ADMIN' WHEN finance THEN 'FINANCE_OFFICER' ELSE 'MINISTRY_LEADER' END,trim(payload->>'content'),payload->>'visibility');
      RETURN jsonb_build_object('id',c.id);
    END IF;
    UPDATE public.claims SET
      status=c.status,
      reimbursement_status=c.reimbursement_status,
      bank_code=c.bank_code,
      bank_name=c.bank_name,
      bank_account_holder_name=c.bank_account_holder_name,
      approved_snapshot=c.approved_snapshot,
      approved_at=c.approved_at,
      approved_by=c.approved_by,
      clarification_reason=c.clarification_reason,
      rejection_reason=c.rejection_reason,
      returned_by=c.returned_by,
      returned_at=c.returned_at,
      version=version+1,
      updated_at=now(),
      current_step_sequence=COALESCE(next_step.sequence,current_step_sequence)
    WHERE id=c.id;
    INSERT INTO public.approval_actions(claim_id,workflow_step_id,actor_id,actor_role,action,comment,previous_status,new_status)
    VALUES(c.id,s.id,uid,CASE WHEN admin THEN 'SYSTEM_ADMIN' WHEN finance THEN 'FINANCE_OFFICER' ELSE COALESCE(s.approver_role,'MINISTRY_LEADER') END,action_code,payload->>'reason',previous_status,c.status);
    PERFORM private.notify_claim(c.id,'Claim updated');
    RETURN jsonb_build_object('id',c.id);
  END IF;

  -- ==========================================================================
  -- Bulk Reimbursement Batch Commands (Finance Officer / System Admin only)
  -- ==========================================================================
  IF action = 'finalize_reimbursement_batch' THEN
    IF NOT (finance OR admin) THEN
      RAISE EXCEPTION 'Finance Officer or System Admin access is required to create reimbursement batches' USING ERRCODE='42501';
    END IF;

    -- Idempotency check by request_key
    IF payload->>'request_key' IS NOT NULL THEN
      SELECT id INTO v_batch_id FROM public.reimbursement_batches WHERE request_key = (payload->>'request_key')::uuid;
      IF v_batch_id IS NOT NULL THEN
        RETURN jsonb_build_object('id', v_batch_id);
      END IF;
    END IF;

    IF jsonb_typeof(payload->'claim_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'claim_ids') = 0 THEN
      RAISE EXCEPTION 'Select at least one eligible approved claim to create a reimbursement batch';
    END IF;

    -- Global batch finalization lock to prevent concurrent double-reservation
    PERFORM pg_advisory_xact_lock(720001);
    IF payload->>'request_key' IS NOT NULL THEN SELECT id INTO v_batch_id FROM public.reimbursement_batches WHERE request_key=(payload->>'request_key')::uuid;IF v_batch_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_batch_id);END IF;END IF;

    SELECT array_agg(DISTINCT (val)::uuid) INTO v_claim_ids
    FROM jsonb_array_elements_text(payload->'claim_ids') val;

    v_claim_count := array_length(v_claim_ids, 1);

    -- Lock all selected claims in deterministic ID order and verify count
    IF (SELECT count(*) FROM (SELECT id FROM public.claims WHERE id = ANY(v_claim_ids) ORDER BY id FOR UPDATE) locked) <> v_claim_count THEN
      RAISE EXCEPTION 'One or more selected claims could not be found' USING ERRCODE='PT409';
    END IF;

    -- Validate every selected claim atomically
    FOR c IN SELECT * FROM public.claims WHERE id = ANY(v_claim_ids) ORDER BY id LOOP
      IF c.payee_payment_method <> 'BANK_TRANSFER' THEN RAISE EXCEPTION 'Bank Transfer and JomPAY batches must remain separate'; END IF;
      IF c.status <> 'APPROVED_FOR_PAYMENT' THEN
        RAISE EXCEPTION 'Claim % is no longer in APPROVED_FOR_PAYMENT state (current: %)', COALESCE(c.claim_number, c.id::text), c.status USING ERRCODE='PT409';
      END IF;
      IF c.active_batch_id IS NOT NULL OR COALESCE(c.reimbursement_status, 'ELIGIBLE') NOT IN ('ELIGIBLE', 'RELEASED', 'FAILED') THEN
        RAISE EXCEPTION 'Claim % is already reserved in another batch or settled', COALESCE(c.claim_number, c.id::text) USING ERRCODE='PT409';
      END IF;
      IF EXISTS (SELECT 1 FROM public.payments p WHERE p.claim_id = c.id) THEN
        RAISE EXCEPTION 'Claim % already has a payment record', COALESCE(c.claim_number, c.id::text) USING ERRCODE='PT409';
      END IF;
      IF EXISTS (SELECT 1 FROM public.reimbursement_instruction_claims ic WHERE ic.claim_id = c.id AND ic.is_active) THEN
        RAISE EXCEPTION 'Claim % is already linked to an active reimbursement instruction', COALESCE(c.claim_number, c.id::text) USING ERRCODE='PT409';
      END IF;
      IF c.total_amount <= 0 OR c.total_amount <> round(c.total_amount, 2) THEN
        RAISE EXCEPTION 'Claim % has an invalid total amount', COALESCE(c.claim_number, c.id::text);
      END IF;

      v_bank_code := COALESCE(
        c.approved_snapshot->>'bank_code',
        c.bank_code,
        private.resolve_canonical_swift_code(COALESCE(c.approved_snapshot->>'bank_name', c.bank_name))
      );
      IF v_bank_code IS NULL OR NOT EXISTS (SELECT 1 FROM public.bank_directory bd WHERE bd.swift_code = v_bank_code AND bd.is_active) THEN
        RAISE EXCEPTION 'Claim % has an missing or unsupported bank code', COALESCE(c.claim_number, c.id::text);
      END IF;

      v_acct := regexp_replace(trim(private.decrypt_bank_account(COALESCE(c.approved_snapshot->>'bank_account_number', c.bank_account_number, ''))), '[\s\-]', '', 'g');
      IF v_acct !~ '^[0-9]{6,20}$' THEN
        RAISE EXCEPTION 'Claim % has an invalid bank account number', COALESCE(c.claim_number, c.id::text);
      END IF;

      v_holder_name := trim(COALESCE(NULLIF(trim(c.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(c.bank_account_holder_name),''), c.claimant_name, ''));
      IF v_holder_name = '' THEN
        RAISE EXCEPTION 'Claim % is missing the beneficiary legal name', COALESCE(c.claim_number, c.id::text);
      END IF;
    END LOOP;

    SELECT SUM(round(total_amount * 100)::bigint) INTO v_total_cents
    FROM public.claims WHERE id = ANY(v_claim_ids);

    v_batch_num := 'HG-BATCH-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.reimbursement_batch_seq')::text, 4, '0');
    v_digest := encode(extensions.digest((SELECT jsonb_agg(jsonb_build_object('id',id,'snapshot',approved_snapshot) ORDER BY id)::text FROM public.claims WHERE id=ANY(v_claim_ids)), 'sha256'),'hex');

    INSERT INTO public.reimbursement_batches (
      batch_number, status, template_version, claim_count, transfer_count,
      total_amount_cents, total_amount, content_digest_sha256, notes, request_key, created_by
    ) VALUES (
      v_batch_num, 'FINALIZED', 'SBP_BIFF8_V1', v_claim_count, 1,
      v_total_cents, round(v_total_cents::numeric / 100, 2), v_digest,
      NULLIF(trim(COALESCE(payload->>'notes', '')), ''),
      NULLIF(payload->>'request_key', '')::uuid,
      uid
    ) RETURNING id INTO v_batch_id;

    v_line_order := 0;

    -- Group by verified beneficiary user ID + exact banking destination + optional identity fields
    FOR v_group IN
      SELECT
        COALESCE(cl.claimant_id, cl.submitted_by_user_id) AS beneficiary_user_id,
        max(trim(COALESCE(NULLIF(trim(cl.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(cl.bank_account_holder_name),''), cl.claimant_name))) AS beneficiary_name,
        regexp_replace(trim(private.decrypt_bank_account(COALESCE(cl.approved_snapshot->>'bank_account_number', cl.bank_account_number))), '[\s\-]', '', 'g') AS account_number,
        COALESCE(cl.approved_snapshot->>'bank_code', cl.bank_code, private.resolve_canonical_swift_code(COALESCE(cl.approved_snapshot->>'bank_name', cl.bank_name))) AS bank_code,
        COALESCE(cl.approved_snapshot->>'beneficiary_new_ic', cl.beneficiary_new_ic, '') AS new_ic,
        COALESCE(cl.approved_snapshot->>'beneficiary_old_ic', cl.beneficiary_old_ic, '') AS old_ic,
        COALESCE(cl.approved_snapshot->>'beneficiary_business_reg', cl.beneficiary_business_reg, '') AS biz_reg,
        COALESCE(cl.approved_snapshot->>'beneficiary_others', cl.beneficiary_others, '') AS others,
        COALESCE(cl.approved_snapshot->>'beneficiary_address', cl.beneficiary_address, '') AS address,
        SUM(round(cl.total_amount * 100)::bigint) AS group_cents,
        COUNT(*) AS group_claim_count,
        array_agg(cl.id ORDER BY cl.created_at, cl.id) AS grouped_claim_ids
      FROM public.claims cl
      WHERE cl.id = ANY(v_claim_ids)
      GROUP BY
        COALESCE(cl.claimant_id, cl.submitted_by_user_id),
        upper(regexp_replace(trim(COALESCE(NULLIF(trim(cl.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(cl.bank_account_holder_name),''), cl.claimant_name)), '\s+', ' ', 'g')),
        regexp_replace(trim(private.decrypt_bank_account(COALESCE(cl.approved_snapshot->>'bank_account_number', cl.bank_account_number))), '[\s\-]', '', 'g'),
        COALESCE(cl.approved_snapshot->>'bank_code', cl.bank_code, private.resolve_canonical_swift_code(COALESCE(cl.approved_snapshot->>'bank_name', cl.bank_name))),
        COALESCE(cl.approved_snapshot->>'beneficiary_new_ic', cl.beneficiary_new_ic, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_old_ic', cl.beneficiary_old_ic, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_business_reg', cl.beneficiary_business_reg, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_others', cl.beneficiary_others, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_address', cl.beneficiary_address, '')
      ORDER BY min(cl.created_at), min(cl.id::text)
    LOOP
      v_line_order := v_line_order + 1;
      v_pay_desc := private.next_payment_description(EXTRACT(YEAR FROM CURRENT_DATE)::integer);
      SELECT bank_name INTO STRICT v_bank_name FROM public.bank_directory WHERE swift_code = v_group.bank_code;

      INSERT INTO public.reimbursement_batch_instructions (
        batch_id, line_order, payment_description, payment_reference,
        payment_mode, beneficiary_user_id, beneficiary_name, beneficiary_account_number,
        beneficiary_bank_name, beneficiary_bank_code,
        beneficiary_new_ic, beneficiary_old_ic, beneficiary_business_reg, beneficiary_others, beneficiary_address,
        amount_cents, amount, claim_count, status
      ) VALUES (
        v_batch_id, v_line_order, v_pay_desc, NULL,
        CASE WHEN v_group.bank_code = 'MFBBMYKL' THEN 'LIP' ELSE 'LGP' END,
        v_group.beneficiary_user_id, v_group.beneficiary_name, private.encrypt_bank_account(v_group.account_number),
        v_bank_name, v_group.bank_code,
        NULLIF(v_group.new_ic, ''), NULLIF(v_group.old_ic, ''), NULLIF(v_group.biz_reg, ''), NULLIF(v_group.others, ''), NULLIF(v_group.address, ''),
        v_group.group_cents, round(v_group.group_cents::numeric / 100, 2), v_group.group_claim_count, 'RESERVED'
      ) RETURNING id INTO v_inst_id;

      INSERT INTO public.reimbursement_instruction_claims (
        batch_id, instruction_id, claim_id, allocated_amount_cents, allocated_amount, is_active
      )
      SELECT
        v_batch_id, v_inst_id, cl.id, round(cl.total_amount * 100)::bigint, cl.total_amount, TRUE
      FROM public.claims cl
      WHERE cl.id = ANY(v_group.grouped_claim_ids);

      UPDATE public.claims
      SET
        reimbursement_status = 'RESERVED_IN_BATCH',
        active_batch_id = v_batch_id,
        active_instruction_id = v_inst_id,
        version = version + 1,
        updated_at = now()
      WHERE id = ANY(v_group.grouped_claim_ids);
    END LOOP;

    UPDATE public.reimbursement_batches
    SET
      transfer_count = v_line_order,
      status = CASE WHEN COALESCE((payload->>'mark_exported')::boolean, false) THEN 'EXPORTED' ELSE status END,
      exported_at = CASE WHEN COALESCE((payload->>'mark_exported')::boolean, false) THEN now() ELSE exported_at END,
      exported_by = CASE WHEN COALESCE((payload->>'mark_exported')::boolean, false) THEN uid ELSE exported_by END,
      exported_filename = CASE WHEN COALESCE((payload->>'mark_exported')::boolean, false) THEN v_batch_num || '.xls' ELSE exported_filename END,
      updated_at = now()
    WHERE id = v_batch_id;

    IF COALESCE((payload->>'mark_exported')::boolean, false) THEN
      UPDATE public.reimbursement_batch_instructions
      SET status = 'EXPORTED', updated_at = now()
      WHERE batch_id = v_batch_id;

      UPDATE public.claims
      SET reimbursement_status = 'EXPORTED_PENDING_CONFIRMATION', updated_at = now()
      WHERE active_batch_id = v_batch_id;
    END IF;

    -- Verify invariant: SUM(instructions.amount_cents) == batch.total_amount_cents
    IF (SELECT COALESCE(SUM(amount_cents), 0) FROM public.reimbursement_batch_instructions WHERE batch_id = v_batch_id) <> v_total_cents THEN
      RAISE EXCEPTION 'Batch total invariant violation during finalization';
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      uid,
      'FINALIZE_REIMBURSEMENT_BATCH',
      'reimbursement_batches',
      v_batch_id::text,
      jsonb_build_object(
        'batch_number', v_batch_num,
        'claim_count', v_claim_count,
        'transfer_count', v_line_order,
        'total_amount_cents', v_total_cents
      )
    );

    RETURN jsonb_build_object('id', v_batch_id, 'batch_number', v_batch_num);
  END IF;

  IF action = 'record_batch_export' THEN
    IF NOT (finance OR admin) THEN RAISE EXCEPTION 'Finance access required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_batch FROM public.reimbursement_batches WHERE id = (payload->>'batch_id')::uuid FOR UPDATE;
    IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
    IF v_batch.status = 'VOIDED' THEN RAISE EXCEPTION 'Cannot export a voided batch'; END IF;
    IF COALESCE(payload->>'file_hash_sha256','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid export SHA-256';END IF;
    IF v_batch.exported_file_hash_sha256 IS NOT NULL AND v_batch.exported_file_hash_sha256<>payload->>'file_hash_sha256' THEN RAISE EXCEPTION 'Export differs from recorded frozen file';END IF;

    UPDATE public.reimbursement_batches
    SET
      status = CASE WHEN status = 'FINALIZED' THEN 'EXPORTED' ELSE status END,
      exported_file_hash_sha256 = COALESCE(exported_file_hash_sha256, payload->>'file_hash_sha256'),
      exported_filename = COALESCE(exported_filename, payload->>'filename'),
      exported_at = COALESCE(exported_at, now()),
      exported_by = COALESCE(exported_by, uid),
      updated_at = now()
    WHERE id = v_batch.id;

    UPDATE public.reimbursement_batch_instructions
    SET status = 'EXPORTED', updated_at = now()
    WHERE batch_id = v_batch.id AND status = 'RESERVED';

    UPDATE public.claims
    SET reimbursement_status = 'EXPORTED_PENDING_CONFIRMATION', updated_at = now()
    WHERE active_batch_id = v_batch.id AND reimbursement_status = 'RESERVED_IN_BATCH';

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      uid,
      'EXPORT_REIMBURSEMENT_BATCH_XLS',
      'reimbursement_batches',
      v_batch.id::text,
      jsonb_build_object('batch_number', v_batch.batch_number, 'file_hash_sha256', payload->>'file_hash_sha256')
    );

    RETURN jsonb_build_object('id', v_batch.id);
  END IF;

  IF action = 'record_batch_bank_upload' THEN
    IF NOT (finance OR admin) THEN RAISE EXCEPTION 'Finance access required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_batch FROM public.reimbursement_batches WHERE id = (payload->>'batch_id')::uuid FOR UPDATE;
    IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
    IF v_batch.status IN ('VOIDED', 'SETTLED') THEN RAISE EXCEPTION 'Batch cannot be marked uploaded in its current state'; END IF;

    UPDATE public.reimbursement_batches
    SET
      status = 'SUBMITTED_TO_BANK',
      bank_uploaded_at = now(),
      bank_upload_reference = NULLIF(trim(COALESCE(payload->>'bank_upload_reference', '')), ''),
      bank_uploaded_by = uid,
      updated_at = now()
    WHERE id = v_batch.id;

    UPDATE public.reimbursement_batch_instructions
    SET status = 'SUBMITTED_TO_BANK', updated_at = now()
    WHERE batch_id = v_batch.id AND status IN ('RESERVED', 'EXPORTED');

    UPDATE public.claims
    SET reimbursement_status = 'SUBMITTED_TO_BANK', updated_at = now()
    WHERE active_batch_id = v_batch.id AND reimbursement_status IN ('RESERVED_IN_BATCH', 'EXPORTED_PENDING_CONFIRMATION');

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      uid,
      'SUBMIT_BATCH_TO_BANK',
      'reimbursement_batches',
      v_batch.id::text,
      jsonb_build_object('batch_number', v_batch.batch_number, 'bank_upload_reference', payload->>'bank_upload_reference')
    );

    RETURN jsonb_build_object('id', v_batch.id);
  END IF;

  IF action = 'reconcile_batch_instruction' THEN
    IF NOT (finance OR admin) THEN RAISE EXCEPTION 'Finance access required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_inst FROM public.reimbursement_batch_instructions WHERE id = (payload->>'instruction_id')::uuid FOR UPDATE;
    IF v_inst.id IS NULL THEN RAISE EXCEPTION 'Payment instruction not found'; END IF;
    SELECT * INTO v_batch FROM public.reimbursement_batches WHERE id = v_inst.batch_id FOR UPDATE;
    IF v_batch.status = 'VOIDED' THEN RAISE EXCEPTION 'Cannot reconcile an instruction in a voided batch'; END IF;
    IF v_inst.status IN ('PAID', 'VOIDED', 'FAILED') THEN RAISE EXCEPTION 'This payment instruction has already been finalized (%).', v_inst.status; END IF;

    IF payload->>'outcome' = 'PAID' THEN
      IF length(trim(COALESCE(payload->>'bank_reference', ''))) = 0 THEN
        RAISE EXCEPTION 'Bank confirmation / reference number is required to mark a transfer PAID';
      END IF;
      IF false THEN
        RAISE EXCEPTION 'Dual-control policy: you cannot confirm bank payout for your own reimbursement' USING ERRCODE='42501';
      END IF;

      UPDATE public.reimbursement_batch_instructions
      SET
        status = 'PAID',
        bank_reference = trim(payload->>'bank_reference'),
        bank_acknowledged_at = now(),
        reconciled_by = uid,
        reconciled_at = now(),
        updated_at = now()
      WHERE id = v_inst.id;

      -- Record official payment for each linked claim and transition claim to PAID
      FOR c IN
        SELECT cl.* FROM public.claims cl
        JOIN public.reimbursement_instruction_claims ic ON ic.claim_id = cl.id
        WHERE ic.instruction_id = v_inst.id AND ic.is_active
        FOR UPDATE
      LOOP
        INSERT INTO public.payments (
          claim_id, amount, payment_date, payment_reference, payment_method, notes, processed_by
        ) VALUES (
          c.id,
          c.total_amount,
          COALESCE(NULLIF(payload->>'payment_date', '')::date, CURRENT_DATE),
          trim(payload->>'bank_reference') || ' (' || v_inst.payment_description || ')',
          v_batch.payment_method,
          'Batch ' || v_batch.batch_number || ' / ' || v_inst.payment_description,
          uid
        );

        UPDATE public.claims
        SET
          status = 'PAID',
          reimbursement_status = 'PAID',
          version = version + 1,
          updated_at = now()
        WHERE id = c.id;

        INSERT INTO public.approval_actions (
          claim_id, actor_id, actor_role, action, comment, previous_status, new_status
        ) VALUES (
          c.id,
          uid,
          CASE WHEN admin THEN 'SYSTEM_ADMIN' ELSE 'FINANCE_OFFICER' END,
          'PAY',
          'Settled via Batch ' || v_batch.batch_number || ' (' || v_inst.payment_description || '), Ref: ' || trim(payload->>'bank_reference'),
          'APPROVED_FOR_PAYMENT',
          'PAID'
        );
      END LOOP;

    ELSIF payload->>'outcome' = 'FAILED' THEN
      IF length(trim(COALESCE(payload->>'failure_reason', ''))) = 0 THEN
        RAISE EXCEPTION 'A failure / rejection reason is required when marking a transfer FAILED';
      END IF;

      UPDATE public.reimbursement_batch_instructions
      SET
        status = 'FAILED',
        failure_reason = trim(payload->>'failure_reason'),
        reconciled_by = uid,
        reconciled_at = now(),
        updated_at = now()
      WHERE id = v_inst.id;

      -- Release linked claims so they can be corrected and re-batched safely
      UPDATE public.reimbursement_instruction_claims
      SET is_active = FALSE
      WHERE instruction_id = v_inst.id;

      UPDATE public.claims
      SET
        reimbursement_status = 'FAILED',
        active_batch_id = NULL,
        active_instruction_id = NULL,
        version = version + 1,
        updated_at = now()
      WHERE id IN (SELECT claim_id FROM public.reimbursement_instruction_claims WHERE instruction_id = v_inst.id);
    ELSE
      RAISE EXCEPTION 'Outcome must be PAID or FAILED';
    END IF;

    -- Recompute overall batch settlement status
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('PAID', 'FAILED', 'VOIDED')),
      COUNT(*) FILTER (WHERE status = 'PAID'),
      COUNT(*) FILTER (WHERE status = 'FAILED')
    INTO v_unsettled_count, v_paid_count, v_failed_count
    FROM public.reimbursement_batch_instructions
    WHERE batch_id = v_batch.id;

    UPDATE public.reimbursement_batches
    SET
      status = CASE
        WHEN v_unsettled_count = 0 AND v_failed_count = 0 THEN 'SETTLED'
        WHEN v_unsettled_count = 0 AND v_paid_count = 0 THEN 'REJECTED'
        WHEN v_paid_count > 0 OR v_failed_count > 0 THEN 'PARTIALLY_SETTLED'
        ELSE status
      END,
      settled_at = CASE WHEN v_unsettled_count = 0 AND v_paid_count > 0 THEN now() ELSE settled_at END,
      updated_at = now()
    WHERE id = v_batch.id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      uid,
      'RECONCILE_BATCH_INSTRUCTION',
      'reimbursement_batch_instructions',
      v_inst.id::text,
      jsonb_build_object(
        'batch_id', v_batch.id,
        'payment_description', v_inst.payment_description,
        'outcome', payload->>'outcome',
        'bank_reference', payload->>'bank_reference',
        'failure_reason', payload->>'failure_reason'
      )
    );

    RETURN jsonb_build_object('id', v_batch.id, 'instruction_id', v_inst.id);
  END IF;

  IF action = 'disburse_reimbursement_batch' THEN
    IF NOT (finance OR admin) THEN RAISE EXCEPTION 'Finance Officer or System Admin access is required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_batch FROM public.reimbursement_batches WHERE id = (payload->>'batch_id')::uuid FOR UPDATE;
    IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
    IF v_batch.status = 'VOIDED' THEN RAISE EXCEPTION 'Cannot disburse a voided batch'; END IF;
    IF nullif(trim(payload->>'bank_reference'),'') IS NULL THEN RAISE EXCEPTION 'Payment completion requires a bank confirmation reference';END IF;
    IF v_batch.status = 'SETTLED' THEN
      RETURN jsonb_build_object('id', v_batch.id, 'status', (SELECT status FROM public.reimbursement_batches WHERE id=v_batch.id));
    END IF;

    FOR v_inst IN
      SELECT * FROM public.reimbursement_batch_instructions
      WHERE batch_id = v_batch.id AND status NOT IN ('PAID', 'VOIDED', 'FAILED')
      ORDER BY line_order
      FOR UPDATE
    LOOP
      UPDATE public.reimbursement_batch_instructions
      SET
        status = 'PAID',
        bank_reference = COALESCE(NULLIF(trim(COALESCE(payload->>'bank_reference', '')), ''), v_inst.payment_description),
        bank_acknowledged_at = now(),
        reconciled_by = uid,
        reconciled_at = now(),
        updated_at = now()
      WHERE id = v_inst.id;

      FOR c IN
        SELECT cl.* FROM public.claims cl
        JOIN public.reimbursement_instruction_claims ic ON ic.claim_id = cl.id
        WHERE ic.instruction_id = v_inst.id AND ic.is_active
        FOR UPDATE
      LOOP
        IF c.status <> 'PAID' THEN
          INSERT INTO public.payments (
            claim_id, amount, payment_date, payment_reference, payment_method, notes, processed_by
          ) VALUES (
            c.id,
            c.total_amount,
            COALESCE(NULLIF(payload->>'payment_date', '')::date, CURRENT_DATE),
            COALESCE(NULLIF(trim(COALESCE(payload->>'bank_reference', '')), ''), v_batch.batch_number) || ' (' || v_inst.payment_description || ')',
            v_batch.payment_method,
            'Processed via Batch ' || v_batch.batch_number || ' / ' || v_inst.payment_description,
            uid
          );

          UPDATE public.claims
          SET
            status = 'PAID',
            reimbursement_status = 'PAID',
            version = version + 1,
            updated_at = now()
          WHERE id = c.id;

          INSERT INTO public.approval_actions (
            claim_id, actor_id, actor_role, action, comment, previous_status, new_status
          ) VALUES (
            c.id,
            uid,
            CASE WHEN admin THEN 'SYSTEM_ADMIN' ELSE 'FINANCE_OFFICER' END,
            'PAY',
            'Disbursed via XLS Batch ' || v_batch.batch_number || ' (' || v_inst.payment_description || ')',
            'APPROVED_FOR_PAYMENT',
            'PAID'
          );

          PERFORM private.notify_claim(c.id, 'Claim processed');
        END IF;
      END LOOP;
    END LOOP;

    UPDATE public.reimbursement_batches
    SET
      status = CASE WHEN EXISTS(SELECT 1 FROM public.reimbursement_batch_instructions WHERE batch_id=v_batch.id AND status='FAILED') THEN 'PARTIALLY_SETTLED' ELSE 'SETTLED' END,
      settled_at = now(),
      exported_at = COALESCE(exported_at, now()),
      exported_by = COALESCE(exported_by, uid),
      updated_at = now()
    WHERE id = v_batch.id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      uid,
      'DISBURSE_REIMBURSEMENT_BATCH',
      'reimbursement_batches',
      v_batch.id::text,
      jsonb_build_object(
        'batch_number', v_batch.batch_number,
        'bank_reference', COALESCE(NULLIF(trim(COALESCE(payload->>'bank_reference', '')), ''), v_batch.batch_number)
      )
    );

    RETURN jsonb_build_object('id', v_batch.id, 'status', (SELECT status FROM public.reimbursement_batches WHERE id=v_batch.id));
  END IF;

  IF action = 'void_reimbursement_batch' THEN
    IF NOT (finance OR admin) THEN RAISE EXCEPTION 'Finance access required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_batch FROM public.reimbursement_batches WHERE id = (payload->>'batch_id')::uuid FOR UPDATE;
    IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
    IF v_batch.status IN ('SETTLED', 'VOIDED') THEN
      RAISE EXCEPTION 'Batch % cannot be voided because it is already %', v_batch.batch_number, v_batch.status;
    END IF;
    IF EXISTS (SELECT 1 FROM public.reimbursement_batch_instructions WHERE batch_id = v_batch.id AND status = 'PAID') THEN
      RAISE EXCEPTION 'Cannot void a batch that already has PAID transfers. Reconcile remaining rows individually.';
    END IF;
    IF length(trim(COALESCE(payload->>'void_reason', ''))) = 0 THEN
      RAISE EXCEPTION 'Provide a reason (including bank rejection confirmation if already exported/uploaded) to void this batch';
    END IF;

    UPDATE public.reimbursement_batches
    SET
      status = 'VOIDED',
      voided_at = now(),
      voided_by = uid,
      void_reason = trim(payload->>'void_reason'),
      updated_at = now()
    WHERE id = v_batch.id;

    UPDATE public.reimbursement_batch_instructions
    SET status = 'VOIDED', failure_reason = trim(payload->>'void_reason'), updated_at = now()
    WHERE batch_id = v_batch.id AND status <> 'PAID';

    UPDATE public.reimbursement_instruction_claims
    SET is_active = FALSE
    WHERE batch_id = v_batch.id;

    UPDATE public.claims
    SET
      reimbursement_status = 'RELEASED',
      active_batch_id = NULL,
      active_instruction_id = NULL,
      version = version + 1,
      updated_at = now()
    WHERE active_batch_id = v_batch.id AND status = 'APPROVED_FOR_PAYMENT';

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      uid,
      'VOID_REIMBURSEMENT_BATCH',
      'reimbursement_batches',
      v_batch.id::text,
      jsonb_build_object('batch_number', v_batch.batch_number, 'void_reason', trim(payload->>'void_reason'))
    );

    RETURN jsonb_build_object('id', v_batch.id);
  END IF;

  IF action='delete_claim' THEN
    SELECT * INTO c FROM public.claims WHERE id=(payload->>'id')::uuid FOR UPDATE;
    IF c.id IS NULL OR c.status NOT IN ('DRAFT','CANCELLED') OR
      NOT (admin OR c.submitted_by_user_id=uid OR c.claimant_id=uid) THEN
      RAISE EXCEPTION 'Only draft or cancelled claims can be deleted by their owner or an administrator' USING ERRCODE='42501';
    END IF;
    DELETE FROM public.claims WHERE id=c.id;
    RETURN jsonb_build_object('id',c.id);
  END IF;

  IF action='complete_onboarding' THEN
    IF length(trim(COALESCE(payload->>'full_name',''))) NOT BETWEEN 1 AND 150 THEN
      RAISE EXCEPTION 'Full name is required (maximum 150 characters)';
    END IF;
    v_bank_code := private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(payload->>'bank_code'),''), payload->>'bank_name'));
    IF v_bank_code IS NOT NULL THEN
      SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    ELSE
      v_bank_name := NULLIF(trim(COALESCE(payload->>'bank_name','')),'');
    END IF;
    v_acct := NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number','')), '[\s\-]', '', 'g'), '');
    v_holder_name := COALESCE(NULLIF(trim(COALESCE(payload->>'bank_account_holder_name','')),''), trim(payload->>'full_name'));

    UPDATE public.profiles SET
      full_name = trim(payload->>'full_name'),
      phone = NULLIF(trim(COALESCE(payload->>'phone','')),''),
      is_multi_user = CASE WHEN payload ? 'is_multi_user' THEN COALESCE((payload->>'is_multi_user')::boolean, false) ELSE is_multi_user END,
      bank_name = COALESCE(v_bank_name, bank_name),
      bank_code = COALESCE(v_bank_code, bank_code),
      bank_account_holder_name = COALESCE(v_holder_name, bank_account_holder_name),
      bank_account_number = COALESCE(v_acct, bank_account_number),
      beneficiary_new_ic = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''), beneficiary_new_ic),
      beneficiary_address = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''), beneficiary_address),
      bank_updated_at = CASE WHEN v_bank_code IS NOT NULL OR v_acct IS NOT NULL THEN now() ELSE bank_updated_at END,
      onboarding_completed_at = now(),
      updated_at = now()
    WHERE id = uid;
    RETURN jsonb_build_object('id',uid);
  END IF;

  IF action = 'create_payee_profile' THEN
    IF length(trim(COALESCE(payload->>'full_name', ''))) NOT BETWEEN 1 AND 150 THEN
      RAISE EXCEPTION 'Claimant full name is required (maximum 150 characters)';
    END IF;
    v_bank_code := private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(payload->>'bank_code'), ''), payload->>'bank_name'));
    IF v_bank_code IS NULL THEN
      RAISE EXCEPTION 'Select a valid bank from the 31-bank Alliance Bank directory';
    END IF;
    SELECT bank_name INTO STRICT v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    v_acct := NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number', '')), '[\s\-]', '', 'g'), '');
    IF v_acct IS NULL OR v_acct !~ '^[A-Za-z0-9]{5,34}$' THEN
      RAISE EXCEPTION 'Enter a valid bank account / DuitNow ID number (5 to 34 alphanumeric characters)';
    END IF;
    v_holder_name := COALESCE(NULLIF(trim(COALESCE(payload->>'bank_account_holder_name', '')), ''), trim(payload->>'full_name'));

    IF NULLIF(trim(COALESCE(payload->>'id', '')), '') IS NOT NULL THEN
      row_id := (payload->>'id')::uuid;
      UPDATE public.profiles SET
        full_name = trim(payload->>'full_name'),
        email = COALESCE(NULLIF(trim(COALESCE(payload->>'email', '')), ''), email),
        phone = COALESCE(NULLIF(trim(COALESCE(payload->>'phone', '')), ''), phone),
        ministry_id = COALESCE(NULLIF(trim(COALESCE(payload->>'ministry_id', '')), '')::uuid, ministry_id),
        bank_name = v_bank_name,
        bank_code = v_bank_code,
        bank_account_holder_name = v_holder_name,
        bank_account_number = v_acct,
        beneficiary_new_ic = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic', '')), ''), beneficiary_new_ic),
        beneficiary_address = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address', '')), ''), beneficiary_address),
        bank_updated_at = now(),
        updated_at = now()
      WHERE id = row_id AND (id = uid OR COALESCE(is_payee_only, FALSE) = TRUE OR created_by_user_id = uid OR admin OR finance);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Unable to update this bank profile' USING ERRCODE = '42501';
      END IF;
    ELSE
      INSERT INTO public.profiles (
        email, full_name, phone, ministry_id, default_ministry_id,
        status, is_multi_user, is_payee_only, created_by_user_id,
        bank_name, bank_code, bank_account_holder_name, bank_account_number,
        beneficiary_new_ic, beneficiary_address, bank_updated_at, onboarding_completed_at
      ) VALUES (
        COALESCE(NULLIF(trim(COALESCE(payload->>'email', '')), ''), 'payee-' || substring(gen_random_uuid()::text, 1, 8) || '@harvestgen.org'),
        trim(payload->>'full_name'),
        NULLIF(trim(COALESCE(payload->>'phone', '')), ''),
        NULLIF(trim(COALESCE(payload->>'ministry_id', '')), '')::uuid,
        NULLIF(trim(COALESCE(payload->>'ministry_id', '')), '')::uuid,
        'ACTIVE', FALSE, TRUE, uid,
        v_bank_name, v_bank_code, v_holder_name, v_acct,
        NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic', '')), ''),
        NULLIF(trim(COALESCE(payload->>'beneficiary_address', '')), ''),
        now(), now()
      ) RETURNING id INTO row_id;
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      uid,
      'UPSERT_PAYEE_BANK_PROFILE',
      'profiles',
      row_id::text,
      jsonb_build_object('full_name', trim(payload->>'full_name'), 'bank_code', v_bank_code)
    );

    RETURN jsonb_build_object('id', row_id);
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
    IF entity ? 'full_name' AND length(trim(COALESCE(entity->>'full_name',''))) NOT BETWEEN 1 AND 150 THEN
      RAISE EXCEPTION 'Full name is required (maximum 150 characters)';
    END IF;

    v_bank_code := private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(entity->>'bank_code'),''), entity->>'bank_name'));
    IF v_bank_code IS NOT NULL THEN
      SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    ELSE
      v_bank_name := NULLIF(trim(COALESCE(entity->>'bank_name','')),'');
    END IF;

    UPDATE public.profiles SET
      full_name=CASE WHEN entity ? 'full_name' THEN trim(entity->>'full_name') ELSE full_name END,
      phone=COALESCE(entity->>'phone',phone),
      is_multi_user=CASE WHEN entity ? 'is_multi_user' THEN COALESCE((entity->>'is_multi_user')::boolean, false) ELSE is_multi_user END,
      bank_name=CASE WHEN entity ? 'bank_name' OR entity ? 'bank_code' THEN v_bank_name ELSE bank_name END,
      bank_code=CASE WHEN entity ? 'bank_name' OR entity ? 'bank_code' THEN v_bank_code ELSE bank_code END,
      bank_account_holder_name=CASE WHEN entity ? 'bank_account_holder_name' THEN NULLIF(trim(entity->>'bank_account_holder_name'),'') ELSE bank_account_holder_name END,
      bank_account_number=CASE WHEN entity ? 'bank_account_number' THEN NULLIF(regexp_replace(trim(entity->>'bank_account_number'), '[\s\-]', '', 'g'),'') ELSE bank_account_number END,
      beneficiary_new_ic=CASE WHEN entity ? 'beneficiary_new_ic' THEN NULLIF(trim(entity->>'beneficiary_new_ic'),'') ELSE beneficiary_new_ic END,
      beneficiary_old_ic=CASE WHEN entity ? 'beneficiary_old_ic' THEN NULLIF(trim(entity->>'beneficiary_old_ic'),'') ELSE beneficiary_old_ic END,
      beneficiary_business_reg=CASE WHEN entity ? 'beneficiary_business_reg' THEN NULLIF(trim(entity->>'beneficiary_business_reg'),'') ELSE beneficiary_business_reg END,
      beneficiary_others=CASE WHEN entity ? 'beneficiary_others' THEN NULLIF(trim(entity->>'beneficiary_others'),'') ELSE beneficiary_others END,
      beneficiary_address=CASE WHEN entity ? 'beneficiary_address' THEN NULLIF(trim(entity->>'beneficiary_address'),'') ELSE beneficiary_address END,
      bank_updated_at=CASE WHEN entity ? 'bank_name' OR entity ? 'bank_code' OR entity ? 'bank_account_number' THEN now() ELSE bank_updated_at END,
      updated_at=now()
    WHERE id=row_id;
    RETURN jsonb_build_object('id',row_id);
  END IF;

  IF action='read_notifications' THEN
    UPDATE public.notifications SET is_read=true WHERE user_id=uid AND (payload->>'id' IS NULL OR id=(payload->>'id')::uuid);
    RETURN '{}';
  END IF;
  IF NOT admin THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF action='create_invitation' THEN
    IF payload->>'role_code' NOT IN ('MINISTRY_LEADER','FINANCE_OFFICER','SYSTEM_ADMIN') OR payload->>'role_code' IS NULL THEN
      RAISE EXCEPTION 'Choose a valid role';
    END IF;
    IF payload->>'token_hash' IS NULL OR payload->>'token_hash' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation token'; END IF;
    IF NOT COALESCE((payload->>'max_uses')::integer BETWEEN 1 AND 1000,false) OR
       NOT COALESCE((payload->>'expires_in_days')::integer BETWEEN 1 AND 90,false) THEN
      RAISE EXCEPTION 'Choose 1–1000 uses and an expiry of 1–90 days';
    END IF;
    IF payload->>'role_code'='MINISTRY_LEADER' AND NOT EXISTS (
      SELECT 1 FROM public.ministries WHERE id=NULLIF(payload->>'ministry_id','')::uuid AND is_active
    ) THEN RAISE EXCEPTION 'Choose an active ministry for the Ministry Leader'; END IF;
    INSERT INTO public.signup_invitations(token_hash,role_code,ministry_id,created_by,description,expires_at,max_uses,is_multi_user)
    VALUES(payload->>'token_hash',payload->>'role_code',CASE WHEN payload->>'role_code'='MINISTRY_LEADER' THEN (payload->>'ministry_id')::uuid END,
      uid,NULLIF(trim(payload->>'description'),''),now()+make_interval(days=>(payload->>'expires_in_days')::integer),(payload->>'max_uses')::integer,
      COALESCE((payload->>'is_multi_user')::boolean, false))
    RETURNING id INTO row_id;
    RETURN jsonb_build_object('id',row_id);
  END IF;
  IF action IN ('revoke_invitation','delete_invitation') THEN
    row_id=(payload->>'id')::uuid;
    IF action='revoke_invitation' THEN
      UPDATE public.signup_invitations SET is_active=false WHERE id=row_id;
    ELSE
      DELETE FROM public.signup_invitations WHERE id=row_id;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
    RETURN jsonb_build_object('id',row_id);
  END IF;
  IF action='settings' THEN
    IF jsonb_typeof(payload->'settings') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'settings')>10 THEN
      RAISE EXCEPTION 'Invalid settings'; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(payload->'settings') LOOP
      PERFORM private.command('setting',item);
    END LOOP;
    RETURN '{}';
  END IF;
  IF action='setting' THEN
    IF payload->>'key' IS NULL OR payload->>'key' NOT IN ('claim_numbering','approval_thresholds','organization_profile','notification_settings','claim_form_config') OR jsonb_typeof(payload->'value') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid setting'; END IF;
    IF payload->>'key'='approval_thresholds' AND NOT COALESCE((payload->'value'->>'final_approval_threshold')::numeric BETWEEN 0 AND 999999999,false) THEN RAISE EXCEPTION 'Invalid approval threshold'; END IF;
    IF payload->>'key'='claim_numbering' AND (length(trim(COALESCE(payload->'value'->>'prefix',''))) NOT BETWEEN 1 AND 20 OR
      NOT COALESCE((payload->'value'->>'digits')::integer BETWEEN 4 AND 8,false)) THEN RAISE EXCEPTION 'Use a prefix of 1–20 characters and 4–8 sequence digits'; END IF;
    IF payload->>'key'='claim_form_config' AND (NOT COALESCE((payload->'value'->>'max_file_size_mb')::integer BETWEEN 1 AND 50,false) OR
      NOT COALESCE((payload->'value'->>'max_attachment_count')::integer BETWEEN 1 AND 30,false)) THEN RAISE EXCEPTION 'Choose a file limit of 1–50 MB and 1–30 attachments'; END IF;
    INSERT INTO public.system_settings(key,value,updated_by) VALUES(payload->>'key',payload->'value',uid)
    ON CONFLICT (key) DO UPDATE SET value=payload->'value',updated_by=uid,updated_at=now();
    RETURN '{}';
  END IF;
  IF action='master_delete' THEN
    table_name=payload->>'table'; row_id=(payload->>'id')::uuid;
    IF table_name='approval_rules' THEN DELETE FROM public.approval_rules WHERE id=row_id;
    ELSIF table_name IN ('ministries','expense_categories','cost_centres') THEN
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE id=$1',table_name) USING row_id;
      EXCEPTION WHEN foreign_key_violation THEN
        EXECUTE format('UPDATE public.%I SET is_active=false WHERE id=$1',table_name) USING row_id;
      END;
    ELSE RAISE EXCEPTION 'Table not supported'; END IF;
    RETURN jsonb_build_object('id',row_id);
  END IF;
  IF action='master_save' THEN
    table_name=payload->>'table'; entity=payload->'data'; row_id=(payload->>'id')::uuid;
    IF table_name NOT IN ('ministries','expense_categories','cost_centres','approval_rules') THEN RAISE EXCEPTION 'Table not supported'; END IF;
    IF row_id IS NOT NULL THEN
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',table_name) INTO entity USING row_id;
      IF entity IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
      entity=entity || (payload->'data');
    END IF;
    IF row_id IS NULL THEN
      IF table_name='ministries' THEN
        INSERT INTO public.ministries(code,name,description,leader_id,is_active) VALUES(entity->>'code',entity->>'name',entity->>'description',NULLIF(entity->>'leader_id','')::uuid,COALESCE((entity->>'is_active')::boolean,true)) RETURNING id INTO row_id;
      ELSIF table_name='expense_categories' THEN
        INSERT INTO public.expense_categories(code,name,description,display_order,is_active) VALUES(entity->>'code',entity->>'name',entity->>'description',COALESCE((entity->>'display_order')::integer,0),COALESCE((entity->>'is_active')::boolean,true)) RETURNING id INTO row_id;
      ELSIF table_name='cost_centres' THEN
        INSERT INTO public.cost_centres(code,name,description,ministry_id,is_active,display_order) VALUES(entity->>'code',entity->>'name',entity->>'description',NULLIF(entity->>'ministry_id','')::uuid,COALESCE((entity->>'is_active')::boolean,true),COALESCE((entity->>'display_order')::integer,0)) RETURNING id INTO row_id;
      ELSE
        INSERT INTO public.approval_rules(name,description,ministry_id,expense_category_id,min_amount,max_amount,sequence,approver_role,approver_user_id,is_active,priority)
        VALUES(entity->>'name',entity->>'description',NULLIF(entity->>'ministry_id','')::uuid,NULLIF(entity->>'expense_category_id','')::uuid,
          (entity->>'min_amount')::numeric,NULLIF(entity->>'max_amount','')::numeric,(entity->>'sequence')::integer,entity->>'approver_role',NULLIF(entity->>'approver_user_id','')::uuid,COALESCE((entity->>'is_active')::boolean,true),COALESCE((entity->>'priority')::integer,100))
        RETURNING id INTO row_id;
      END IF;
    ELSE
      IF table_name='ministries' THEN
        UPDATE public.ministries SET code=entity->>'code',name=entity->>'name',description=entity->>'description',leader_id=NULLIF(entity->>'leader_id','')::uuid,is_active=(entity->>'is_active')::boolean,updated_at=now() WHERE id=row_id;
      ELSIF table_name='expense_categories' THEN
        UPDATE public.expense_categories SET code=entity->>'code',name=entity->>'name',description=entity->>'description',display_order=(entity->>'display_order')::integer,is_active=(entity->>'is_active')::boolean,updated_at=now() WHERE id=row_id;
      ELSIF table_name='cost_centres' THEN
        UPDATE public.cost_centres SET display_order=COALESCE((entity->>'display_order')::integer,0),code=entity->>'code',name=entity->>'name',description=entity->>'description',ministry_id=NULLIF(entity->>'ministry_id','')::uuid,is_active=(entity->>'is_active')::boolean,updated_at=now() WHERE id=row_id;
      ELSE
        UPDATE public.approval_rules SET name=entity->>'name',description=entity->>'description',ministry_id=NULLIF(entity->>'ministry_id','')::uuid,
          expense_category_id=NULLIF(entity->>'expense_category_id','')::uuid,min_amount=(entity->>'min_amount')::numeric,max_amount=NULLIF(entity->>'max_amount','')::numeric,
          sequence=(entity->>'sequence')::integer,approver_role=entity->>'approver_role',approver_user_id=NULLIF(entity->>'approver_user_id','')::uuid,
          is_active=(entity->>'is_active')::boolean,priority=(entity->>'priority')::integer,updated_at=now() WHERE id=row_id;
      END IF;
    END IF;
  END IF;
  IF action<>'master_save' THEN RAISE EXCEPTION 'Unknown workspace action'; END IF;
  RETURN jsonb_build_object('id',row_id);
END $$;
REVOKE ALL ON FUNCTION private.legacy_commands_v2(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.save_payee_v2(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE p public.profiles;cid uuid=nullif(payload->>'id','')::uuid;method text=COALESCE(payload->>'payment_method','BANK_TRANSFER');bank text;acct text;
BEGIN
 IF nullif(trim(payload->>'full_name'),'') IS NULL THEN RAISE EXCEPTION 'Supplier name required'; END IF;
 IF cid IS NOT NULL THEN
 SELECT * INTO p FROM public.profiles WHERE id=cid FOR UPDATE;
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
 UPDATE public.profiles SET full_name=trim(payload->>'full_name'),phone=payload->>'phone',payment_method=method,
 bank_code=CASE WHEN method='BANK_TRANSFER' THEN bank END,bank_name=CASE WHEN method='BANK_TRANSFER' THEN (SELECT bank_name FROM public.bank_directory WHERE swift_code=bank) END,
 bank_account_holder_name=CASE WHEN method='BANK_TRANSFER' THEN trim(payload->>'bank_account_holder_name') END,bank_account_number=CASE WHEN method='BANK_TRANSFER' THEN private.encrypt_bank_account(acct) END,
 jompay_biller_name=CASE WHEN method='JOMPAY' THEN trim(payload->>'jompay_biller_name') END,jompay_biller_code=CASE WHEN method='JOMPAY' THEN trim(payload->>'jompay_biller_code') END,
 jompay_reference_1=CASE WHEN method='JOMPAY' THEN trim(payload->>'jompay_reference_1') END,jompay_reference_2=CASE WHEN method='JOMPAY' THEN nullif(trim(payload->>'jompay_reference_2'),'') END,
 bank_updated_at=now(),updated_at=now() WHERE id=cid;
 RETURN jsonb_build_object('id',cid);
END $$;

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
 VALUES(num,'FINALIZED','JOMPAY_TEMPLATE_PENDING','JOMPAY',cardinality(ids),cardinality(ids),amount,amount/100.0,encode(extensions.digest((SELECT jsonb_agg(approved_snapshot ORDER BY id)::text FROM public.claims WHERE id=ANY(ids)),'sha256'),'hex'),auth.uid(),nullif(payload->>'request_key','')::uuid,payload->>'notes') RETURNING id INTO bid;
 -- Deliberately one instruction per bill: never group by payee.
 FOR c IN SELECT * FROM public.claims WHERE id=ANY(ids) ORDER BY created_at,id LOOP
 line=line+1;j=c.approved_snapshot->'jompay' || jsonb_build_object('fail_email_1',cfg->>'fail_email_1','fail_email_2',COALESCE(cfg->>'fail_email_2',''));
 INSERT INTO public.reimbursement_batch_instructions(batch_id,line_order,payment_description,payment_mode,beneficiary_user_id,beneficiary_name,beneficiary_account_number,beneficiary_bank_name,beneficiary_bank_code,amount_cents,amount,claim_count,status,jompay_snapshot)
 VALUES(bid,line,private.next_payment_description(),'JOMPAY',c.claimant_id,j->>'biller_name','','','',round(c.total_amount*100)::bigint,c.total_amount,1,'RESERVED',j) RETURNING id INTO iid;
 INSERT INTO public.reimbursement_instruction_claims(batch_id,instruction_id,claim_id,allocated_amount_cents,allocated_amount,is_active) VALUES(bid,iid,c.id,round(c.total_amount*100)::bigint,c.total_amount,true);
 UPDATE public.claims SET active_batch_id=bid,active_instruction_id=iid,reimbursement_status='RESERVED_IN_BATCH',version=version+1 WHERE id=c.id;
 END LOOP;
 INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data) VALUES(auth.uid(),'FINALIZE_JOMPAY_BATCH','reimbursement_batches',bid::text,jsonb_build_object('claim_count',line,'total_amount_cents',amount));
 RETURN jsonb_build_object('id',bid,'batch_number',num);
END $$;

CREATE TABLE public.recurring_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),utility text NOT NULL CHECK(utility IN ('Unifi','Indah Water','TNB','Air Selangor')),
 payee_id uuid NOT NULL REFERENCES public.profiles(id),ministry_id uuid NOT NULL REFERENCES public.ministries(id),expense_category_id uuid NOT NULL REFERENCES public.expense_categories(id),
 amount_mode text NOT NULL CHECK(amount_mode IN ('FIXED','VARIABLE')),fixed_amount numeric(12,2),due_day integer NOT NULL CHECK(due_day BETWEEN 1 AND 31),
 start_date date NOT NULL,end_date date,is_active boolean NOT NULL DEFAULT true,owner_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date IS NULL OR end_date>=start_date),CHECK((amount_mode='FIXED' AND fixed_amount>0) OR (amount_mode='VARIABLE' AND fixed_amount IS NULL)),
 CHECK((utility IN ('Unifi','Indah Water') AND amount_mode='FIXED') OR (utility IN ('TNB','Air Selangor') AND amount_mode='VARIABLE')));
CREATE TABLE public.recurring_billing_periods(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_id uuid NOT NULL REFERENCES public.recurring_payments(id),period date NOT NULL,due_date date NOT NULL,
 claim_id uuid NOT NULL UNIQUE REFERENCES public.claims(id),reminded_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(schedule_id,period));
CREATE UNIQUE INDEX recurring_one_active_payee ON public.recurring_payments(payee_id) WHERE is_active;
CREATE INDEX recurring_active ON public.recurring_payments(start_date) WHERE is_active;
CREATE INDEX recurring_period_due ON public.recurring_billing_periods(due_date) WHERE reminded_at IS NULL;
ALTER TABLE public.recurring_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_billing_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_payments,public.recurring_billing_periods FROM anon,authenticated;
ALTER TABLE public.claims ADD COLUMN recurring_schedule_id uuid REFERENCES public.recurring_payments(id),ADD COLUMN recurring_due_date date;

CREATE OR REPLACE FUNCTION private.run_recurring_payments(p_today date DEFAULT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE s public.recurring_payments;p public.profiles;v_period date;due date;cid uuid;generated integer=0;reminded integer=0;record_row record;
BEGIN
 PERFORM pg_advisory_xact_lock(720004);
 FOR s IN SELECT * FROM public.recurring_payments WHERE is_active AND start_date<=p_today+14 AND (end_date IS NULL OR end_date>=start_date) ORDER BY id LOOP
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

CREATE OR REPLACE FUNCTION private.notify_claim(claim_id uuid,title text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE c public.claims;
BEGIN
 SELECT * INTO STRICT c FROM public.claims WHERE id=claim_id;
 INSERT INTO public.notifications(user_id,claim_id,type,title,message,link)
 SELECT p.id,c.id,c.status,title,COALESCE(c.claim_number,'Draft')||': '||c.claimant_name,
 CASE WHEN p.id=COALESCE(c.submitted_by_user_id,c.claimant_id) THEN '/claims/' ELSE '/approvals/' END||c.id::text
 FROM public.profiles p WHERE p.status='ACTIVE' AND p.id<>auth.uid() AND
 (p.id=COALESCE(c.submitted_by_user_id,c.claimant_id) OR
 (c.status='PENDING_FINANCE_REVIEW' AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p.id AND r.code='FINANCE')) OR
 (c.status='PENDING_MINISTRY_APPROVAL' AND EXISTS(SELECT 1 FROM public.ministry_team_leads t JOIN public.user_roles ur ON ur.user_id=t.user_id JOIN public.roles r ON r.id=ur.role_id WHERE t.ministry_id=c.ministry_id AND t.user_id=p.id AND r.code='TEAM_LEAD')));
END $$;

CREATE OR REPLACE FUNCTION private.command(action text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE uid uuid=auth.uid();finance boolean;cid uuid;result jsonb;entity jsonb;target uuid;item jsonb;p public.profiles;bank text;acct text;field text;
BEGIN
 IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 finance=private.has_role('FINANCE');
 IF action='delete_claim' THEN
 SELECT id INTO cid FROM public.claims WHERE id=(payload->>'id')::uuid AND status IN ('DRAFT','CANCELLED') AND (COALESCE(submitted_by_user_id,claimant_id)=uid OR finance) FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'Only your own Draft may be deleted' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.recurring_billing_periods WHERE claim_id=cid) THEN RAISE EXCEPTION 'Recurring bill history is retained. Deactivate the schedule to stop future bills.';END IF;
 DELETE FROM public.claims WHERE id=cid;RETURN jsonb_build_object('id',cid);END IF;
 IF action IN ('save_draft','submit_claim') THEN RETURN private.save_claim_v2(action,payload); END IF;
 IF action='attach_receipt' THEN
 SELECT id INTO cid FROM public.claims WHERE id=(payload->>'claim_id')::uuid AND submitted_by_user_id=uid AND status IN ('DRAFT','RETURNED_FOR_CLARIFICATION','PENDING_MINISTRY_APPROVAL','PENDING_FINANCE_REVIEW') FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'The receipt could not be attached. Ask Finance to return the claim if it has already been approved.' USING ERRCODE='42501';END IF;
 PERFORM private.attach_claim_file(cid,NULL,payload->'attachment');
 UPDATE public.claims SET version=version+1 WHERE id=cid;
 RETURN jsonb_build_object('id',cid);END IF;
 IF action='duplicate_claim' THEN RETURN private.duplicate_claim_v2(payload);END IF;
 IF action IN ('approve','return','reject','verify','correct') THEN RETURN private.review_claim_v2(action,payload); END IF;
 IF action='create_payee_profile' THEN RETURN private.save_payee_v2(payload); END IF;
 IF action='verify_claim_payment' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 SELECT id INTO cid FROM public.claims WHERE id=(payload->>'claim_id')::uuid AND version=(payload->>'version')::integer FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'Claim changed. Refresh first.' USING ERRCODE='PT409';END IF;
 UPDATE public.claims SET payment_details_verified_at=now(),payment_details_verified_by=uid,version=version+1 WHERE id=cid;
 INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id) VALUES(uid,'VERIFY_CLAIM_PAYMENT_DETAILS','claims',cid::text);
 RETURN jsonb_build_object('id',cid);END IF;
 IF action='verify_payee' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=(payload->>'id')::uuid FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Payee not found'; END IF;
 IF p.payment_revision IS DISTINCT FROM (payload->>'payment_revision')::integer THEN RAISE EXCEPTION 'Payment details changed. Refresh and review again.' USING ERRCODE='PT409'; END IF;
 UPDATE public.profiles SET verified_payment_revision=payment_revision,payment_verified_at=now(),payment_verified_by=uid WHERE id=p.id;
 INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data) VALUES(uid,'VERIFY_PAYMENT_DETAILS','profiles',p.id::text,jsonb_build_object('revision',p.payment_revision));
 RETURN jsonb_build_object('id',p.id); END IF;
 IF action='payment_detail_history' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('changes',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at DESC) FROM private.payment_detail_changes x WHERE payee_id=(payload->>'id')::uuid),'[]')); END IF;
 IF action='profile' THEN
 target=(payload->>'id')::uuid;entity=payload->'data';
 IF target<>uid AND NOT finance THEN RAISE EXCEPTION 'Profile access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=target FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Profile missing'; END IF;
 IF NOT finance AND (entity?'roles' OR entity?'status' OR entity?'payment_method' OR EXISTS(SELECT 1 FROM jsonb_object_keys(entity) k WHERE k LIKE 'jompay_%')) THEN RAISE EXCEPTION 'Finance required for role or JomPAY changes' USING ERRCODE='42501'; END IF;
 IF entity?'roles' THEN
 IF jsonb_typeof(entity->'roles') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(entity->'roles') r WHERE r NOT IN ('TEAM_LEAD','FINANCE')) THEN RAISE EXCEPTION 'Only TEAM_LEAD and FINANCE can be assigned'; END IF;
 PERFORM pg_advisory_xact_lock(710001);
 IF EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=target AND r.code='FINANCE') AND NOT(entity->'roles'?'FINANCE') AND (SELECT count(*) FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id=pr.id JOIN public.roles r ON r.id=ur.role_id WHERE pr.status='ACTIVE' AND r.code='FINANCE')<=1 THEN RAISE EXCEPTION 'Keep at least one active Finance user'; END IF;
 DELETE FROM public.user_roles WHERE user_id=target;
 INSERT INTO public.user_roles(user_id,role_id) SELECT target,id FROM public.roles WHERE code IN (SELECT jsonb_array_elements_text(entity->'roles'));
 END IF;
 IF COALESCE(entity->>'status','ACTIVE')<>'ACTIVE' AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=target AND r.code='FINANCE') AND (SELECT count(*) FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id=pr.id JOIN public.roles r ON r.id=ur.role_id WHERE pr.status='ACTIVE' AND r.code='FINANCE')<=1 THEN RAISE EXCEPTION 'Keep at least one active Finance user'; END IF;
 bank=private.resolve_canonical_swift_code(COALESCE(entity->>'bank_code',entity->>'bank_name'));
 UPDATE public.profiles SET full_name=COALESCE(nullif(trim(entity->>'full_name'),''),full_name),phone=COALESCE(entity->>'phone',phone),status=CASE WHEN finance THEN COALESCE(entity->>'status',status) ELSE status END,
 bank_code=CASE WHEN entity?'bank_code' OR entity?'bank_name' THEN bank ELSE bank_code END,bank_name=CASE WHEN entity?'bank_code' OR entity?'bank_name' THEN (SELECT bank_name FROM public.bank_directory WHERE swift_code=bank) ELSE bank_name END,
 bank_account_holder_name=CASE WHEN entity?'bank_account_holder_name' THEN nullif(trim(entity->>'bank_account_holder_name'),'') ELSE bank_account_holder_name END,
 bank_account_number=CASE WHEN entity?'bank_account_number' THEN private.encrypt_bank_account(entity->>'bank_account_number') ELSE bank_account_number END,updated_at=now() WHERE id=target;
 IF EXISTS(SELECT 1 FROM public.ministries m WHERE (m.require_team_lead_approval OR EXISTS(SELECT 1 FROM public.claims cl WHERE cl.ministry_id=m.id AND cl.status='PENDING_MINISTRY_APPROVAL')) AND NOT EXISTS(SELECT 1 FROM public.ministry_team_leads t JOIN public.profiles pr ON pr.id=t.user_id JOIN public.user_roles ur ON ur.user_id=pr.id JOIN public.roles r ON r.id=ur.role_id AND r.code='TEAM_LEAD' WHERE t.ministry_id=m.id AND pr.status='ACTIVE')) THEN RAISE EXCEPTION 'Keep an active Team Lead assigned while team approval is enabled';END IF;
 RETURN jsonb_build_object('id',target);
 END IF;
 IF action='finalize_jompay_batch' THEN RETURN private.finalize_jompay_v2(payload);END IF;
 IF action IN ('run_recurring_payments','save_recurring_payment','deactivate_recurring_payment') THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 IF action='run_recurring_payments' THEN RETURN private.run_recurring_payments();END IF;
 IF action='deactivate_recurring_payment' THEN UPDATE public.recurring_payments SET is_active=false,updated_at=now() WHERE id=(payload->>'id')::uuid;RETURN jsonb_build_object('id',payload->>'id'); END IF;
 IF payload->>'amount_mode'='FIXED' AND ((payload->>'fixed_amount')::numeric<=0 OR (payload->>'fixed_amount')::numeric<>round((payload->>'fixed_amount')::numeric,2)) THEN RAISE EXCEPTION 'Fixed amounts need a positive value with at most two decimal places';END IF;
 SELECT * INTO p FROM public.profiles WHERE id=(payload->>'payee_id')::uuid AND is_payee_only AND status='ACTIVE' AND payment_method='JOMPAY';
 IF p.id IS NULL OR lower(trim(p.full_name))<>lower(trim(payload->>'utility')) THEN RAISE EXCEPTION 'Choose the matching JomPAY utility payee'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ministries WHERE id=(payload->>'ministry_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Choose an active Team'; END IF;
 IF nullif(payload->>'expense_category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.expense_categories WHERE id=(payload->>'expense_category_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Choose an active classification';END IF;
 target=COALESCE(nullif(payload->>'id','')::uuid,gen_random_uuid());
 INSERT INTO public.recurring_payments(id,utility,payee_id,ministry_id,expense_category_id,amount_mode,fixed_amount,due_day,start_date,end_date,is_active,owner_id)
 VALUES(target,payload->>'utility',p.id,(payload->>'ministry_id')::uuid,COALESCE(nullif(payload->>'expense_category_id','')::uuid,(SELECT id FROM public.expense_categories WHERE code='V2_UTILITIES')),payload->>'amount_mode',nullif(payload->>'fixed_amount','')::numeric,(payload->>'due_day')::integer,(payload->>'start_date')::date,nullif(payload->>'end_date','')::date,COALESCE((payload->>'is_active')::boolean,true),uid)
 ON CONFLICT(id) DO UPDATE SET utility=excluded.utility,payee_id=excluded.payee_id,ministry_id=excluded.ministry_id,expense_category_id=excluded.expense_category_id,amount_mode=excluded.amount_mode,fixed_amount=excluded.fixed_amount,due_day=excluded.due_day,start_date=excluded.start_date,end_date=excluded.end_date,is_active=excluded.is_active,updated_at=now();
 RETURN jsonb_build_object('id',target); END IF;
 IF action='set_ministry_budget' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501';END IF;
 IF NOT COALESCE((payload->>'year')::integer BETWEEN 2020 AND 2100,false) OR (payload->>'amount')::numeric<0 OR (payload->>'amount')::numeric<>round((payload->>'amount')::numeric,2) THEN RAISE EXCEPTION 'Enter a valid budget year and amount';END IF;
 INSERT INTO public.ministry_budgets(ministry_id,year,amount,notes,created_by) VALUES((payload->>'ministry_id')::uuid,(payload->>'year')::integer,(payload->>'amount')::numeric,payload->>'notes',uid)
 ON CONFLICT(ministry_id,year) DO UPDATE SET amount=excluded.amount,notes=excluded.notes,updated_at=now() RETURNING id INTO target;
 RETURN jsonb_build_object('id',target);END IF;
 IF action='set_ministry_team_leads' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 target=(payload->>'ministry_id')::uuid;
 IF jsonb_typeof(payload->'user_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose Team Leads'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'user_ids') u WHERE NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u::uuid AND status='ACTIVE' AND NOT is_payee_only)) THEN RAISE EXCEPTION 'Choose active users'; END IF;
 IF ((SELECT require_team_lead_approval FROM public.ministries WHERE id=target) OR EXISTS(SELECT 1 FROM public.claims WHERE ministry_id=target AND status='PENDING_MINISTRY_APPROVAL')) AND jsonb_array_length(payload->'user_ids')=0 THEN RAISE EXCEPTION 'Disable Team Lead approval before removing the last Team Lead'; END IF;
 DELETE FROM public.ministry_team_leads WHERE ministry_id=target;
 INSERT INTO public.ministry_team_leads(ministry_id,user_id) SELECT target,value::uuid FROM jsonb_array_elements_text(payload->'user_ids');
 INSERT INTO public.user_roles(user_id,role_id) SELECT value::uuid,(SELECT id FROM public.roles WHERE code='TEAM_LEAD') FROM jsonb_array_elements_text(payload->'user_ids') ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('id',target);END IF;
 IF action IN ('master_save','master_delete') AND payload->>'table'='claim_dropdown_values' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 target=COALESCE(nullif(payload->>'id','')::uuid,gen_random_uuid());entity=payload->'data';
 IF action='master_delete' THEN UPDATE public.claim_dropdown_values SET is_active=false,updated_at=now() WHERE id=target;
 ELSE
 IF EXISTS(SELECT 1 FROM public.claim_dropdown_values v WHERE v.kind=entity->>'kind' AND lower(trim(v.name))=lower(trim(entity->>'name')) AND v.id<>target) THEN RAISE EXCEPTION 'This name already exists in the list';END IF;
 INSERT INTO public.claim_dropdown_values(id,kind,name,is_active,created_by) VALUES(target,entity->>'kind',trim(entity->>'name'),COALESCE((entity->>'is_active')::boolean,true),uid)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,is_active=excluded.is_active,updated_at=now();END IF;
 RETURN jsonb_build_object('id',target);END IF;
 IF action='master_save' AND payload->>'table'='ministries' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 entity=payload->'data';target=COALESCE(nullif(payload->>'id','')::uuid,gen_random_uuid());
 IF COALESCE((entity->>'require_team_lead_approval')::boolean,false) AND NOT EXISTS(SELECT 1 FROM public.ministry_team_leads t JOIN public.profiles p ON p.id=t.user_id JOIN public.user_roles ur ON ur.user_id=p.id JOIN public.roles r ON r.id=ur.role_id AND r.code='TEAM_LEAD' WHERE t.ministry_id=target AND p.status='ACTIVE') THEN RAISE EXCEPTION 'Assign an active Team Lead before enabling approval'; END IF;
 INSERT INTO public.ministries(id,code,name,description,is_active,context_kind,require_team_lead_approval)
 VALUES(target,COALESCE(entity->>'code',(SELECT code FROM public.ministries WHERE id=target)),COALESCE(entity->>'name',(SELECT name FROM public.ministries WHERE id=target)),entity->>'description',COALESCE((entity->>'is_active')::boolean,true),nullif(entity->>'context_kind',''),COALESCE((entity->>'require_team_lead_approval')::boolean,false))
 ON CONFLICT(id) DO UPDATE SET code=COALESCE(excluded.code,ministries.code),name=COALESCE(excluded.name,ministries.name),description=COALESCE(excluded.description,ministries.description),is_active=CASE WHEN entity?'is_active' THEN excluded.is_active ELSE ministries.is_active END,context_kind=CASE WHEN entity?'context_kind' THEN excluded.context_kind ELSE ministries.context_kind END,require_team_lead_approval=CASE WHEN entity?'require_team_lead_approval' THEN excluded.require_team_lead_approval ELSE ministries.require_team_lead_approval END,updated_at=now();
 RETURN jsonb_build_object('id',target);END IF;
 IF action='create_invitation' THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 IF nullif(payload->>'role_code','') IS NOT NULL AND payload->>'role_code' NOT IN ('TEAM_LEAD','FINANCE') THEN RAISE EXCEPTION 'Invalid privileged role';END IF;
 IF COALESCE(payload->>'token_hash','')!~'^[0-9a-f]{64}$' OR NOT COALESCE((payload->>'max_uses')::integer BETWEEN 1 AND 1000,false) OR NOT COALESCE((payload->>'expires_in_days')::integer BETWEEN 1 AND 90,false) THEN RAISE EXCEPTION 'Invalid invitation settings';END IF;
 INSERT INTO public.signup_invitations(token_hash,role_code,created_by,description,expires_at,max_uses) VALUES(payload->>'token_hash',nullif(payload->>'role_code',''),uid,payload->>'description',now()+make_interval(days=>(payload->>'expires_in_days')::integer),(payload->>'max_uses')::integer) RETURNING id INTO target;
 RETURN jsonb_build_object('id',target);END IF;
 IF action IN ('setting','settings') THEN
 IF NOT finance THEN RAISE EXCEPTION 'Finance required' USING ERRCODE='42501'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(CASE WHEN action='settings' THEN payload->'settings' ELSE jsonb_build_array(payload) END) LOOP
 IF item->>'key' NOT IN ('claim_form_config','jompay_export_config','approval_thresholds','claim_numbering','organization_profile','notification_settings') OR jsonb_typeof(item->'value')<>'object' THEN RAISE EXCEPTION 'Invalid setting'; END IF;
 IF item->>'key'='claim_form_config' AND ((item->'value'?'max_file_size_mb' AND NOT COALESCE((item->'value'->>'max_file_size_mb')::integer BETWEEN 1 AND 50,false)) OR (item->'value'?'max_attachment_count' AND NOT COALESCE((item->'value'->>'max_attachment_count')::integer BETWEEN 1 AND 30,false))) THEN RAISE EXCEPTION 'Invalid file limits';END IF;
 IF item->>'key'='jompay_export_config' AND COALESCE(item->'value'->>'fail_email_1','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid failure email address'; END IF;
 UPDATE public.system_settings SET value=value || item->'value',updated_by=uid,updated_at=now() WHERE key=item->>'key';END LOOP;
 RETURN '{}';END IF;
 IF action='finalize_reimbursement_batch' THEN payload=payload || jsonb_build_object('mark_exported',false);END IF;
 -- Only supported legacy operations may reach the preserved engine.
 IF action IN ('finalize_reimbursement_batch','record_batch_export','record_batch_bank_upload','reconcile_batch_instruction','disburse_reimbursement_batch','void_reimbursement_batch','pay','master_save','master_delete','read_notifications','complete_onboarding','comment','delete_claim','revoke_invitation','delete_invitation') THEN
 IF action IN ('record_batch_export','record_batch_bank_upload','disburse_reimbursement_batch') AND EXISTS(SELECT 1 FROM public.reimbursement_batches WHERE id=(payload->>'batch_id')::uuid AND payment_method='JOMPAY') THEN RAISE EXCEPTION 'JomPAY bank upload/export is blocked until the supplied Alliance template is validated'; END IF;
 RETURN private.legacy_commands_v2(action,payload);
 END IF;
 RAISE EXCEPTION 'Unsupported action: %',action;
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
 entry=entry || jsonb_build_object('payee_verification_required',(entry->>'payment_details_verified_at' IS NULL) AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(entry->>'claimant_id')::uuid AND p.verified_payment_revision=p.payment_revision AND p.payment_revision=COALESCE((entry->>'payee_payment_revision')::integer,1) AND
 (p.payment_method='JOMPAY' OR private.decrypt_bank_account(p.bank_account_number)=private.decrypt_bank_account(entry->>'bank_account_number'))));
 END IF;
 IF entry->>'recurring_schedule_id' IS NOT NULL THEN
 entry=entry || jsonb_build_object('recurring_previous_amount',(SELECT c.total_amount FROM public.recurring_billing_periods bp JOIN public.claims c ON c.id=bp.claim_id WHERE bp.schedule_id=(entry->>'recurring_schedule_id')::uuid AND bp.period=(date_trunc('month',(entry->>'recurring_due_date')::date)-interval '1 month')::date));
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
CREATE OR REPLACE FUNCTION private.enrich_snapshot_v2(p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN private.redact_workspace_snapshot(p_snapshot) || jsonb_build_object(
 'auditLogs',CASE WHEN private.has_role('FINANCE') THEN COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at DESC) FROM (SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT 500) a),'[]') ELSE '[]'::jsonb END,
 'managedClaimValues',COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY kind,name) FROM public.claim_dropdown_values v),'[]'),
 'recurringPayments',CASE WHEN private.has_role('FINANCE') THEN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY utility) FROM public.recurring_payments r),'[]') ELSE '[]'::jsonb END);
END $$;
CREATE OR REPLACE FUNCTION public.nlcc_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT private.enrich_snapshot_v2(private.snapshot()); $$;
CREATE OR REPLACE FUNCTION public.nlcc_domain_snapshot(p_domain text DEFAULT 'all') RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT private.enrich_snapshot_v2(CASE WHEN p_domain='finance' THEN private.domain_snapshot(p_domain) || private.domain_snapshot('claims') ELSE private.domain_snapshot(p_domain) END); $$;
CREATE OR REPLACE FUNCTION public.nlcc_claim_detail(p_claim_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE data jsonb;arr jsonb;
BEGIN
 data=private.get_claim_detail(p_claim_id);
 data=jsonb_build_object('claim',(private.redact_workspace_snapshot(jsonb_build_object('claims',jsonb_build_array(data->'claim'))))->'claims'->0);
 IF private.has_role('FINANCE') THEN data=data || jsonb_build_object('classification_changes',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at) FROM public.claim_classification_changes a WHERE claim_id=p_claim_id),'[]'));END IF;
 RETURN data;
END $$;
-- Sanitize general-purpose audit rows; payment identifiers are audited in private storage.
CREATE OR REPLACE FUNCTION private.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE b jsonb;a jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN b=to_jsonb(OLD)-'bank_account_number'-'approved_snapshot'-'jompay_details'-'jompay_reference_1'-'jompay_reference_2'-'jompay_biller_code';END IF;
 IF TG_OP<>'DELETE' THEN a=to_jsonb(NEW)-'bank_account_number'-'approved_snapshot'-'jompay_details'-'jompay_reference_1'-'jompay_reference_2'-'jompay_biller_code';END IF;
 INSERT INTO public.audit_logs(actor_id,actor_name,actor_email,action,entity_type,entity_id,before_data,after_data) VALUES(auth.uid(),(SELECT full_name FROM public.profiles WHERE id=auth.uid()),(SELECT email FROM public.profiles WHERE id=auth.uid()),TG_OP,TG_TABLE_NAME,COALESCE(a->>'id',b->>'id'),b,a);RETURN NULL;
END $$;
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON public.claim_dropdown_values FOR EACH ROW EXECUTE FUNCTION private.audit_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON public.recurring_payments FOR EACH ROW EXECUTE FUNCTION private.audit_change();
-- Protect new private functions and retain the single authenticated command API.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.run_recurring_payments(date),private.save_claim_v2(text,jsonb),private.review_claim_v2(text,jsonb),private.duplicate_claim_v2(jsonb),private.save_payee_v2(jsonb),private.finalize_jompay_v2(jsonb),private.attach_claim_file(uuid,uuid,jsonb),private.enrich_snapshot_v2(jsonb),private.validate_claim_context(uuid,text,uuid,text),private.validate_claim_item(jsonb,boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.command(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.nlcc_command(text,jsonb),public.nlcc_snapshot(),public.nlcc_domain_snapshot(text),public.nlcc_claim_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nlcc_command(text,jsonb),public.nlcc_snapshot(),public.nlcc_domain_snapshot(text),public.nlcc_claim_detail(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
