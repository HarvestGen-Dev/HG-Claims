-- ============================================================================
-- Migration: 20261103000001_bulk_reimbursement_batches.sql
-- Description: Alliance Bank BIFF8 Bulk Reimbursement Workflow, Canonical 31-Bank
-- Directory, Payee Bank Details on Profiles/Claims, Transactional Batching,
-- Running P{YY}{NNNN} Sequence, and Transfer-Level Reconciliation.
-- ============================================================================

-- 1. Canonical 31-Bank Directory (seeded from SBP_Sample - Copy.xls "Bank List")
CREATE TABLE IF NOT EXISTS public.bank_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL UNIQUE,
  swift_code TEXT NOT NULL UNIQUE,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('LIP', 'LGP')),
  template_version TEXT NOT NULL DEFAULT 'SBP_BIFF8_V1',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bank_directory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read bank directory" ON public.bank_directory;
CREATE POLICY "Authenticated users can read bank directory"
  ON public.bank_directory FOR SELECT TO authenticated USING (true);

INSERT INTO public.bank_directory (bank_name, swift_code, payment_mode, display_order) VALUES
  ('Maybank / Malayan Banking Berhad', 'MBBEMYKL', 'LGP', 1),
  ('CIMB Bank', 'CIBBMYKL', 'LGP', 2),
  ('CIMB Islamic Bank', 'CTBBMYKL', 'LGP', 3),
  ('Public Bank', 'PBBEMYKL', 'LGP', 4),
  ('Public Islamic Bank', 'PIBEMYK1', 'LGP', 5),
  ('RHB Bank', 'RHBBMYKL', 'LGP', 6),
  ('RHB Islamic Bank', 'RHBAMYKL', 'LGP', 7),
  ('Hong Leong Bank', 'HLBBMYKL', 'LGP', 8),
  ('Hong Leong Islamic Bank', 'HLIBMYKL', 'LGP', 9),
  ('AmBank', 'ARBKMYKL', 'LGP', 10),
  ('Affin Bank', 'PHBMMYKL', 'LGP', 11),
  ('Alliance Bank', 'MFBBMYKL', 'LIP', 12),
  ('Bank Islam Malaysia', 'BIMBMYKL', 'LGP', 13),
  ('Bank Muamalat Malaysia', 'BMMBMYKL', 'LGP', 14),
  ('Bank Rakyat', 'BKRMMYKL', 'LGP', 15),
  ('Bank Simpanan Nasional (BSN)', 'BSNAMYK1', 'LGP', 16),
  ('Agrobank', 'AGOBMYKL', 'LGP', 17),
  ('OCBC Bank Malaysia', 'OCBCMYKL', 'LGP', 18),
  ('OCBC Al-Amin', 'OABBMYKL', 'LGP', 19),
  ('HSBC Bank Malaysia', 'HBMBMYKL', 'LGP', 20),
  ('HSBC Amanah', 'HMABMYKL', 'LGP', 21),
  ('Standard Chartered Malaysia', 'SCBLMYKX', 'LGP', 22),
  ('UOB Malaysia', 'UOVBMYKL', 'LGP', 23),
  ('Bank of China Malaysia', 'BKCHMYKL', 'LGP', 24),
  ('Citibank Malaysia', 'CITIMYKL', 'LGP', 25),
  ('Deutsche Bank Malaysia', 'DEUTMYKL', 'LGP', 26),
  ('J.P. Morgan Chase Bank Malaysia', 'CHASMYKX', 'LGP', 27),
  ('Mizuho Bank Malaysia', 'MHCBMYKA', 'LGP', 28),
  ('Sumitomo Mitsui Banking Corporation Malaysia', 'SMBCMYKL', 'LGP', 29),
  ('Bank of America Malaysia', 'BOFAMY2X', 'LGP', 30),
  ('Kuwait Finance House Malaysia', 'KFHOMYKL', 'LGP', 31)
ON CONFLICT (swift_code) DO UPDATE SET
  bank_name = EXCLUDED.bank_name,
  payment_mode = EXCLUDED.payment_mode,
  display_order = EXCLUDED.display_order,
  is_active = TRUE;

-- Helper function to resolve canonical bank code from bank_code or legacy bank_name
CREATE OR REPLACE FUNCTION private.resolve_canonical_swift_code(p_code_or_name text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_norm text;
  v_code text;
BEGIN
  v_norm := lower(trim(COALESCE(p_code_or_name, '')));
  IF v_norm = '' THEN RETURN NULL; END IF;

  SELECT swift_code INTO v_code
  FROM public.bank_directory
  WHERE is_active
    AND (lower(swift_code) = v_norm OR lower(bank_name) = v_norm)
  LIMIT 1;

  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  -- Legacy alias resolution for backward compatibility
  IF v_norm LIKE '%maybank%' OR v_norm LIKE '%malayan banking%' THEN RETURN 'MBBEMYKL'; END IF;
  IF v_norm LIKE '%cimb islamic%' THEN RETURN 'CTBBMYKL'; END IF;
  IF v_norm LIKE '%cimb%' THEN RETURN 'CIBBMYKL'; END IF;
  IF v_norm LIKE '%public islamic%' THEN RETURN 'PIBEMYK1'; END IF;
  IF v_norm LIKE '%public bank%' THEN RETURN 'PBBEMYKL'; END IF;
  IF v_norm LIKE '%rhb islamic%' THEN RETURN 'RHBAMYKL'; END IF;
  IF v_norm LIKE '%rhb%' THEN RETURN 'RHBBMYKL'; END IF;
  IF v_norm LIKE '%hong leong islamic%' THEN RETURN 'HLIBMYKL'; END IF;
  IF v_norm LIKE '%hong leong%' THEN RETURN 'HLBBMYKL'; END IF;
  IF v_norm LIKE '%ambank%' THEN RETURN 'ARBKMYKL'; END IF;
  IF v_norm LIKE '%affin%' THEN RETURN 'PHBMMYKL'; END IF;
  IF v_norm LIKE '%alliance%' THEN RETURN 'MFBBMYKL'; END IF;
  IF v_norm LIKE '%bank islam%' THEN RETURN 'BIMBMYKL'; END IF;
  IF v_norm LIKE '%muamalat%' THEN RETURN 'BMMBMYKL'; END IF;
  IF v_norm LIKE '%rakyat%' THEN RETURN 'BKRMMYKL'; END IF;
  IF v_norm LIKE '%simpanan nasional%' OR v_norm = 'bsn' THEN RETURN 'BSNAMYK1'; END IF;
  IF v_norm LIKE '%agrobank%' OR v_norm LIKE '%pertanian%' THEN RETURN 'AGOBMYKL'; END IF;
  IF v_norm LIKE '%ocbc al-amin%' THEN RETURN 'OABBMYKL'; END IF;
  IF v_norm LIKE '%ocbc%' THEN RETURN 'OCBCMYKL'; END IF;
  IF v_norm LIKE '%hsbc amanah%' THEN RETURN 'HMABMYKL'; END IF;
  IF v_norm LIKE '%hsbc%' THEN RETURN 'HBMBMYKL'; END IF;
  IF v_norm LIKE '%standard chartered%' THEN RETURN 'SCBLMYKX'; END IF;
  IF v_norm LIKE '%uob%' OR v_norm LIKE '%united overseas%' THEN RETURN 'UOVBMYKL'; END IF;
  IF v_norm LIKE '%bank of china%' THEN RETURN 'BKCHMYKL'; END IF;
  IF v_norm LIKE '%citibank%' THEN RETURN 'CITIMYKL'; END IF;
  IF v_norm LIKE '%deutsche%' THEN RETURN 'DEUTMYKL'; END IF;
  IF v_norm LIKE '%morgan%' THEN RETURN 'CHASMYKX'; END IF;
  IF v_norm LIKE '%mizuho%' THEN RETURN 'MHCBMYKA'; END IF;
  IF v_norm LIKE '%sumitomo%' OR v_norm LIKE '%smbc%' THEN RETURN 'SMBCMYKL'; END IF;
  IF v_norm LIKE '%bank of america%' THEN RETURN 'BOFAMY2X'; END IF;
  IF v_norm LIKE '%kuwait%' THEN RETURN 'KFHOMYKL'; END IF;

  RETURN NULL;
END $$;

-- 2. Extend public.profiles with structured payee bank details
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bank_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_new_ic TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_old_ic TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_business_reg TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_others TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_address TEXT,
  ADD COLUMN IF NOT EXISTS bank_updated_at TIMESTAMPTZ;

-- Backfill profiles.bank_code and bank_account_holder_name where bank_name exists
UPDATE public.profiles
SET
  bank_code = COALESCE(bank_code, private.resolve_canonical_swift_code(bank_name)),
  bank_account_holder_name = COALESCE(NULLIF(trim(bank_account_holder_name), ''), full_name)
WHERE bank_name IS NOT NULL OR bank_account_number IS NOT NULL;

-- 3. Annual running counter for Payment Description (e.g. P260001)
CREATE TABLE IF NOT EXISTS public.payment_description_counters (
  fiscal_year INTEGER PRIMARY KEY,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_description_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.next_payment_description(p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_seq integer;
  v_yy text;
BEGIN
  INSERT INTO public.payment_description_counters (fiscal_year, last_sequence, updated_at)
  VALUES (p_year, 1, now())
  ON CONFLICT (fiscal_year) DO UPDATE
    SET last_sequence = public.payment_description_counters.last_sequence + 1,
        updated_at = now()
  RETURNING last_sequence INTO v_seq;

  v_yy := right(p_year::text, 2);
  RETURN 'P' || v_yy || lpad(v_seq::text, GREATEST(4, length(v_seq::text)), '0');
END $$;

-- 4. Reimbursement Batches & Instructions Tables
CREATE SEQUENCE IF NOT EXISTS public.reimbursement_batch_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.reimbursement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'FINALIZED' CHECK (status IN (
    'FINALIZED',
    'EXPORTED',
    'SUBMITTED_TO_BANK',
    'PARTIALLY_SETTLED',
    'SETTLED',
    'REJECTED',
    'VOIDED'
  )),
  template_version TEXT NOT NULL DEFAULT 'SBP_BIFF8_V1',
  claim_count INTEGER NOT NULL CHECK (claim_count > 0),
  transfer_count INTEGER NOT NULL CHECK (transfer_count > 0),
  total_amount_cents BIGINT NOT NULL CHECK (total_amount_cents > 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  content_digest_sha256 TEXT NOT NULL,
  exported_file_hash_sha256 TEXT,
  exported_filename TEXT,
  exported_at TIMESTAMPTZ,
  exported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  bank_uploaded_at TIMESTAMPTZ,
  bank_upload_reference TEXT,
  bank_uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  settled_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  void_reason TEXT,
  notes TEXT,
  request_key UUID UNIQUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reimbursement_batch_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.reimbursement_batches(id) ON DELETE CASCADE,
  line_order INTEGER NOT NULL,
  payment_description TEXT NOT NULL UNIQUE,
  payment_reference TEXT,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('LIP', 'LGP')),
  beneficiary_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  beneficiary_name TEXT NOT NULL,
  beneficiary_account_number TEXT NOT NULL,
  beneficiary_bank_name TEXT NOT NULL,
  beneficiary_bank_code TEXT NOT NULL,
  beneficiary_new_ic TEXT,
  beneficiary_old_ic TEXT,
  beneficiary_business_reg TEXT,
  beneficiary_others TEXT,
  beneficiary_address TEXT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  claim_count INTEGER NOT NULL CHECK (claim_count > 0),
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN (
    'RESERVED',
    'EXPORTED',
    'SUBMITTED_TO_BANK',
    'PAID',
    'FAILED',
    'VOIDED'
  )),
  bank_reference TEXT,
  bank_acknowledged_at TIMESTAMPTZ,
  failure_reason TEXT,
  reconciled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, line_order)
);

CREATE TABLE IF NOT EXISTS public.reimbursement_instruction_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.reimbursement_batches(id) ON DELETE CASCADE,
  instruction_id UUID NOT NULL REFERENCES public.reimbursement_batch_instructions(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT,
  allocated_amount_cents BIGINT NOT NULL CHECK (allocated_amount_cents > 0),
  allocated_amount NUMERIC(12, 2) NOT NULL CHECK (allocated_amount > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instruction_id, claim_id)
);

-- Critical invariant: a claim can belong to at most ONE active reimbursement instruction at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_claim_instruction
  ON public.reimbursement_instruction_claims (claim_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_reimbursement_batches_status ON public.reimbursement_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reimbursement_instructions_batch ON public.reimbursement_batch_instructions (batch_id, line_order);

ALTER TABLE public.reimbursement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_batch_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_instruction_claims ENABLE ROW LEVEL SECURITY;

-- 5. Extend public.claims with structured payee details & reimbursement lifecycle columns
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS bank_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_new_ic TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_old_ic TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_business_reg TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_others TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_address TEXT,
  ADD COLUMN IF NOT EXISTS reimbursement_status TEXT CHECK (reimbursement_status IN (
    'ELIGIBLE',
    'RESERVED_IN_BATCH',
    'EXPORTED_PENDING_CONFIRMATION',
    'SUBMITTED_TO_BANK',
    'PAID',
    'FAILED',
    'RELEASED'
  )),
  ADD COLUMN IF NOT EXISTS active_batch_id UUID REFERENCES public.reimbursement_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_instruction_id UUID REFERENCES public.reimbursement_batch_instructions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claims_eligible_reimbursement
  ON public.claims (status, reimbursement_status)
  WHERE status = 'APPROVED_FOR_PAYMENT';

-- Backfill existing claims for backward compatibility
UPDATE public.claims
SET
  bank_code = COALESCE(bank_code, private.resolve_canonical_swift_code(bank_name)),
  bank_account_holder_name = COALESCE(NULLIF(trim(bank_account_holder_name), ''), claimant_name),
  reimbursement_status = CASE
    WHEN status = 'PAID' THEN 'PAID'
    WHEN status = 'APPROVED_FOR_PAYMENT' AND reimbursement_status IS NULL THEN 'ELIGIBLE'
    ELSE reimbursement_status
  END
WHERE bank_code IS NULL OR bank_account_holder_name IS NULL OR status IN ('APPROVED_FOR_PAYMENT', 'PAID');

-- 6. Upgrade private.command with payee bank fields, approval snapshot, and batch operations
CREATE OR REPLACE FUNCTION private.command(action text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

    v_bank_code := private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(payload->>'bank_code'),''), payload->>'bank_name'));
    IF v_bank_code IS NOT NULL THEN
      SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    ELSE
      v_bank_name := NULLIF(trim(COALESCE(payload->>'bank_name','')),'');
    END IF;
    v_holder_name := COALESCE(NULLIF(trim(COALESCE(payload->>'bank_account_holder_name','')),''), NULLIF(trim(COALESCE(payload->>'claimant_name','')),''));
    v_acct := NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number','')), '[\s\-]', '', 'g'), '');

    IF action='submit_claim' THEN
      IF NOT COALESCE((payload->>'declaration_accepted')::boolean,false) OR
        length(trim(COALESCE(payload->>'claimant_name','')))=0 OR length(trim(COALESCE(payload->>'purpose','')))=0 OR
        jsonb_array_length(payload->'expenses')=0 THEN
        RAISE EXCEPTION 'Complete the claimant name, purpose, receipts, and accept the declaration';
      END IF;
      IF v_bank_code IS NULL THEN
        RAISE EXCEPTION 'Select a supported bank from the Harvest Generation bank directory for reimbursement';
      END IF;
      IF v_acct IS NULL OR v_acct !~ '^[0-9]{6,20}$' THEN
        RAISE EXCEPTION 'Enter a valid bank account number (6 to 20 digits)';
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
        uid, uid, trim(COALESCE(payload->>'claimant_name','')),
        NULLIF(trim(COALESCE(payload->>'claimant_email','')),''),
        NULLIF(trim(COALESCE(payload->>'claimant_phone','')),''),
        v_bank_name, v_bank_code, v_holder_name, v_acct,
        NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''),
        NULLIF(trim(COALESCE(payload->>'beneficiary_old_ic','')),''),
        NULLIF(trim(COALESCE(payload->>'beneficiary_business_reg','')),''),
        NULLIF(trim(COALESCE(payload->>'beneficiary_others','')),''),
        NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''),
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
        bank_name=v_bank_name,
        bank_code=v_bank_code,
        bank_account_holder_name=v_holder_name,
        bank_account_number=v_acct,
        beneficiary_new_ic=NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''),
        beneficiary_old_ic=NULLIF(trim(COALESCE(payload->>'beneficiary_old_ic','')),''),
        beneficiary_business_reg=NULLIF(trim(COALESCE(payload->>'beneficiary_business_reg','')),''),
        beneficiary_others=NULLIF(trim(COALESCE(payload->>'beneficiary_others','')),''),
        beneficiary_address=NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''),
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
        cid, (item->>'expense_date')::date, NULLIF(item->>'expense_category_id','')::uuid,
        (item->>'cost_centre_id')::uuid, NULLIF(trim(COALESCE(item->>'vendor','')),''),
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
      IF NOT (finance OR admin) OR submitter=uid OR c.claimant_id=uid OR c.status<>'PENDING_FINANCE_REVIEW' THEN RAISE EXCEPTION 'Finance verification is not allowed' USING ERRCODE='42501'; END IF;
      INSERT INTO public.finance_reviews(claim_id,reviewer_id,receipts_verified,category_verified,cost_centre_verified,notes)
      VALUES(c.id,uid,true,true,true,payload->>'reason'); action_code='VERIFY';
    ELSIF action='pay' THEN
      IF NOT (finance OR admin) OR submitter=uid OR c.claimant_id=uid OR c.status<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Payment is not allowed' USING ERRCODE='42501'; END IF;
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

    SELECT array_agg(DISTINCT (val)::uuid) INTO v_claim_ids
    FROM jsonb_array_elements_text(payload->'claim_ids') val;

    v_claim_count := array_length(v_claim_ids, 1);

    -- Lock all selected claims in deterministic ID order and verify count
    IF (SELECT count(*) FROM (SELECT id FROM public.claims WHERE id = ANY(v_claim_ids) ORDER BY id FOR UPDATE) locked) <> v_claim_count THEN
      RAISE EXCEPTION 'One or more selected claims could not be found' USING ERRCODE='PT409';
    END IF;

    -- Validate every selected claim atomically
    FOR c IN SELECT * FROM public.claims WHERE id = ANY(v_claim_ids) ORDER BY id LOOP
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

      v_acct := regexp_replace(trim(COALESCE(c.approved_snapshot->>'bank_account_number', c.bank_account_number, '')), '[\s\-]', '', 'g');
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
    v_digest := COALESCE(NULLIF(trim(payload->>'preview_digest'), ''), md5(array_to_string(v_claim_ids, ',') || ':' || v_total_cents::text));

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
        COALESCE(c.claimant_id, c.submitted_by_user_id) AS beneficiary_user_id,
        max(trim(COALESCE(NULLIF(trim(c.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(c.bank_account_holder_name),''), c.claimant_name))) AS beneficiary_name,
        regexp_replace(trim(COALESCE(c.approved_snapshot->>'bank_account_number', c.bank_account_number)), '[\s\-]', '', 'g') AS account_number,
        COALESCE(c.approved_snapshot->>'bank_code', c.bank_code, private.resolve_canonical_swift_code(COALESCE(c.approved_snapshot->>'bank_name', c.bank_name))) AS bank_code,
        COALESCE(c.approved_snapshot->>'beneficiary_new_ic', c.beneficiary_new_ic, '') AS new_ic,
        COALESCE(c.approved_snapshot->>'beneficiary_old_ic', c.beneficiary_old_ic, '') AS old_ic,
        COALESCE(c.approved_snapshot->>'beneficiary_business_reg', c.beneficiary_business_reg, '') AS biz_reg,
        COALESCE(c.approved_snapshot->>'beneficiary_others', c.beneficiary_others, '') AS others,
        COALESCE(c.approved_snapshot->>'beneficiary_address', c.beneficiary_address, '') AS address,
        SUM(round(c.total_amount * 100)::bigint) AS group_cents,
        COUNT(*) AS group_claim_count,
        array_agg(c.id ORDER BY c.created_at, c.id) AS grouped_claim_ids
      FROM public.claims c
      WHERE c.id = ANY(v_claim_ids)
      GROUP BY
        COALESCE(c.claimant_id, c.submitted_by_user_id),
        upper(regexp_replace(trim(COALESCE(NULLIF(trim(c.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(c.bank_account_holder_name),''), c.claimant_name)), '\s+', ' ', 'g')),
        regexp_replace(trim(COALESCE(c.approved_snapshot->>'bank_account_number', c.bank_account_number)), '[\s\-]', '', 'g'),
        COALESCE(c.approved_snapshot->>'bank_code', c.bank_code, private.resolve_canonical_swift_code(COALESCE(c.approved_snapshot->>'bank_name', c.bank_name))),
        COALESCE(c.approved_snapshot->>'beneficiary_new_ic', c.beneficiary_new_ic, ''),
        COALESCE(c.approved_snapshot->>'beneficiary_old_ic', c.beneficiary_old_ic, ''),
        COALESCE(c.approved_snapshot->>'beneficiary_business_reg', c.beneficiary_business_reg, ''),
        COALESCE(c.approved_snapshot->>'beneficiary_others', c.beneficiary_others, ''),
        COALESCE(c.approved_snapshot->>'beneficiary_address', c.beneficiary_address, '')
      ORDER BY min(c.created_at), min(c.id)
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
        v_group.beneficiary_user_id, v_group.beneficiary_name, v_group.account_number,
        v_bank_name, v_group.bank_code,
        NULLIF(v_group.new_ic, ''), NULLIF(v_group.old_ic, ''), NULLIF(v_group.biz_reg, ''), NULLIF(v_group.others, ''), NULLIF(v_group.address, ''),
        v_group.group_cents, round(v_group.group_cents::numeric / 100, 2), v_group.group_claim_count, 'RESERVED'
      ) RETURNING id INTO v_inst_id;

      INSERT INTO public.reimbursement_instruction_claims (
        batch_id, instruction_id, claim_id, allocated_amount_cents, allocated_amount, is_active
      )
      SELECT
        v_batch_id, v_inst_id, c.id, round(c.total_amount * 100)::bigint, c.total_amount, TRUE
      FROM public.claims c
      WHERE c.id = ANY(v_group.grouped_claim_ids);

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
    SET transfer_count = v_line_order, updated_at = now()
    WHERE id = v_batch_id;

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
    IF v_inst.status IN ('PAID', 'VOIDED') THEN RAISE EXCEPTION 'This payment instruction has already been finalized (%).', v_inst.status; END IF;

    IF payload->>'outcome' = 'PAID' THEN
      IF length(trim(COALESCE(payload->>'bank_reference', ''))) = 0 THEN
        RAISE EXCEPTION 'Bank confirmation / reference number is required to mark a transfer PAID';
      END IF;
      IF v_inst.beneficiary_user_id = uid AND NOT admin THEN
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
          'BANK_TRANSFER',
          'Bulk SBP Batch ' || v_batch.batch_number || ' / ' || v_inst.payment_description,
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
    INSERT INTO public.signup_invitations(token_hash,role_code,ministry_id,created_by,description,expires_at,max_uses)
    VALUES(payload->>'token_hash',payload->>'role_code',CASE WHEN payload->>'role_code'='MINISTRY_LEADER' THEN (payload->>'ministry_id')::uuid END,
      uid,NULLIF(trim(payload->>'description'),''),now()+make_interval(days=>(payload->>'expires_in_days')::integer),(payload->>'max_uses')::integer)
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

-- 7. Update private.snapshot and private.domain_snapshot to include reimbursementBatches
CREATE OR REPLACE FUNCTION private.snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; admin boolean; finance boolean;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  admin=private.has_role('SYSTEM_ADMIN'); finance=private.has_role('FINANCE_OFFICER');
  SELECT jsonb_build_object(
    'user_id',auth.uid(),
    'profiles',COALESCE((SELECT jsonb_agg(
      (CASE WHEN p.id=auth.uid() OR admin OR finance THEN to_jsonb(p) ELSE to_jsonb(p)-'bank_name'-'bank_code'-'bank_account_holder_name'-'bank_account_number'-'beneficiary_new_ic'-'beneficiary_old_ic'-'beneficiary_business_reg'-'beneficiary_others'-'beneficiary_address'-'phone'-'email' END) ||
      jsonb_build_object('roles',COALESCE((SELECT jsonb_agg(r.code) FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p.id),'[]'))
    ) FROM public.profiles p),'[]'),
    'ministries',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY name) FROM public.ministries m),'[]'),
    'categories',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY display_order,name) FROM public.expense_categories e),'[]'),
    'costCentres',COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc),'[]'),
    'approvalRules',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY sequence) FROM public.approval_rules r WHERE admin),'[]'),
    'systemSettings',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.system_settings s),'[]'),
    'notifications',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY created_at DESC) FROM public.notifications n WHERE user_id=auth.uid()),'[]'),
    'auditLogs',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT * FROM public.audit_logs WHERE admin OR finance ORDER BY created_at DESC LIMIT 1000) a),'[]'),
    'signupInvitations',COALESCE((SELECT jsonb_agg(to_jsonb(i)-'token_hash' ORDER BY created_at DESC) FROM public.signup_invitations i WHERE admin),'[]'),
    'reimbursementBatches',COALESCE((
      SELECT jsonb_agg(
        to_jsonb(b) || jsonb_build_object(
          'instructions', COALESCE((
            SELECT jsonb_agg(
              to_jsonb(inst) || jsonb_build_object(
                'claims', COALESCE((
                  SELECT jsonb_agg(to_jsonb(ic))
                  FROM public.reimbursement_instruction_claims ic
                  WHERE ic.instruction_id = inst.id
                ), '[]'::jsonb)
              ) ORDER BY inst.line_order
            )
            FROM public.reimbursement_batch_instructions inst
            WHERE inst.batch_id = b.id
          ), '[]'::jsonb)
        ) ORDER BY b.created_at DESC
      )
      FROM public.reimbursement_batches b
      WHERE admin OR finance
    ), '[]'::jsonb),
    'claims',COALESCE((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'submitted_by', (SELECT to_jsonb(p)-'bank_name'-'bank_code'-'bank_account_holder_name'-'bank_account_number'-'beneficiary_new_ic'-'beneficiary_old_ic'-'beneficiary_business_reg'-'beneficiary_others'-'beneficiary_address' FROM public.profiles p WHERE p.id=COALESCE(c.submitted_by_user_id, c.claimant_id)),
      'claimant', (SELECT to_jsonb(p)-'bank_name'-'bank_code'-'bank_account_holder_name'-'bank_account_number'-'beneficiary_new_ic'-'beneficiary_old_ic'-'beneficiary_business_reg'-'beneficiary_others'-'beneficiary_address' FROM public.profiles p WHERE p.id=c.claimant_id),
      'expenses',COALESCE((SELECT jsonb_agg(to_jsonb(e) || jsonb_build_object(
        'cost_centre', (SELECT to_jsonb(cc) FROM public.cost_centres cc WHERE cc.id=e.cost_centre_id),
        'attachments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.claim_attachments a WHERE a.expense_id=e.id), '[]')
      ) ORDER BY sort_order) FROM public.claim_expenses e WHERE claim_id=c.id),'[]'),
      'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.claim_attachments a WHERE claim_id=c.id),'[]'),
      'workflow_steps',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY sequence) FROM public.claim_workflow_steps s JOIN public.claim_workflows w ON w.id=s.workflow_id AND w.is_current WHERE s.claim_id=c.id),'[]'),
      'approval_actions',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at DESC) FROM public.approval_actions a WHERE claim_id=c.id),'[]'),
      'comments',COALESCE((SELECT jsonb_agg(to_jsonb(cm) ORDER BY created_at) FROM public.claim_comments cm WHERE claim_id=c.id AND (visibility='PUBLIC_WORKFLOW' OR admin OR (visibility='FINANCE_INTERNAL' AND finance))),'[]'),
      'finance_review',(SELECT to_jsonb(f) FROM public.finance_reviews f WHERE claim_id=c.id AND created_at>=COALESCE(c.resubmitted_at,c.submitted_at,c.created_at) ORDER BY created_at DESC LIMIT 1),
      'payment',(SELECT to_jsonb(p) FROM public.payments p WHERE claim_id=c.id)
    ) ORDER BY c.created_at DESC) FROM public.claims c WHERE private.can_read_claim(c.id)),'[]')
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.domain_snapshot(p_domain text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
  admin boolean;
  finance boolean;
  claims_json jsonb;
  batches_json jsonb;
BEGIN
  IF NOT private.active_user() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  IF p_domain IS NULL OR p_domain = 'all' THEN
    RETURN private.snapshot();
  END IF;

  uid := auth.uid();
  admin := private.has_role('SYSTEM_ADMIN');
  finance := private.has_role('FINANCE_OFFICER');

  IF p_domain = 'iam' THEN
    RETURN jsonb_build_object(
      'user_id', uid,
      'profiles', COALESCE((
        SELECT jsonb_agg(
          (CASE WHEN p.id = uid OR admin OR finance
            THEN to_jsonb(p)
            ELSE to_jsonb(p) - 'bank_name' - 'bank_code' - 'bank_account_holder_name' - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic' - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address' - 'phone' - 'email'
          END) ||
          jsonb_build_object(
            'roles',
            COALESCE((
              SELECT jsonb_agg(r.code)
              FROM public.user_roles ur
              JOIN public.roles r ON r.id = ur.role_id
              WHERE ur.user_id = p.id
            ), '[]'::jsonb)
          )
        )
        FROM public.profiles p
      ), '[]'::jsonb),
      'signupInvitations', COALESCE((
        SELECT jsonb_agg(to_jsonb(i) - 'token_hash' ORDER BY created_at DESC)
        FROM public.signup_invitations i
        WHERE admin
      ), '[]'::jsonb)
    );
  END IF;

  IF p_domain = 'master-data' THEN
    RETURN jsonb_build_object(
      'ministries', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY name) FROM public.ministries m), '[]'::jsonb),
      'categories', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY display_order, name) FROM public.expense_categories e), '[]'::jsonb),
      'costCentres', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc), '[]'::jsonb),
      'systemSettings', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.system_settings s), '[]'::jsonb)
    );
  END IF;

  IF p_domain = 'notifications' THEN
    RETURN jsonb_build_object(
      'notifications', COALESCE((
        SELECT jsonb_agg(to_jsonb(n) ORDER BY created_at DESC)
        FROM public.notifications n
        WHERE user_id = uid
      ), '[]'::jsonb),
      'auditLogs', COALESCE((
        SELECT jsonb_agg(to_jsonb(a))
        FROM (
          SELECT * FROM public.audit_logs
          WHERE admin OR finance
          ORDER BY created_at DESC
          LIMIT 1000
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  IF p_domain IN ('claims', 'finance') THEN
    SELECT COALESCE((
      SELECT jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'submitted_by', (SELECT to_jsonb(p) - 'bank_name' - 'bank_code' - 'bank_account_holder_name' - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic' - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address' FROM public.profiles p WHERE p.id = COALESCE(c.submitted_by_user_id, c.claimant_id)),
          'claimant', (SELECT to_jsonb(p) - 'bank_name' - 'bank_code' - 'bank_account_holder_name' - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic' - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address' FROM public.profiles p WHERE p.id = c.claimant_id),
          'expenses', COALESCE((
            SELECT jsonb_agg(
              to_jsonb(e) || jsonb_build_object(
                'cost_centre', (SELECT to_jsonb(cc) FROM public.cost_centres cc WHERE cc.id = e.cost_centre_id),
                'attachments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.claim_attachments a WHERE a.expense_id = e.id), '[]'::jsonb)
              ) ORDER BY sort_order
            )
            FROM public.claim_expenses e
            WHERE claim_id = c.id
          ), '[]'::jsonb),
          'attachments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.claim_attachments a WHERE claim_id = c.id), '[]'::jsonb),
          'workflow_steps', COALESCE((
            SELECT jsonb_agg(to_jsonb(s) ORDER BY sequence)
            FROM public.claim_workflow_steps s
            JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
            WHERE s.claim_id = c.id
          ), '[]'::jsonb),
          'approval_actions', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at DESC) FROM public.approval_actions a WHERE claim_id = c.id), '[]'::jsonb),
          'comments', COALESCE((
            SELECT jsonb_agg(to_jsonb(cm) ORDER BY created_at)
            FROM public.claim_comments cm
            WHERE claim_id = c.id
              AND (visibility = 'PUBLIC_WORKFLOW' OR admin OR (visibility = 'FINANCE_INTERNAL' AND finance))
          ), '[]'::jsonb),
          'finance_review', (
            SELECT to_jsonb(f)
            FROM public.finance_reviews f
            WHERE claim_id = c.id
              AND created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
            ORDER BY created_at DESC
            LIMIT 1
          ),
          'payment', (SELECT to_jsonb(p) FROM public.payments p WHERE claim_id = c.id)
        ) ORDER BY c.created_at DESC
      )
      FROM public.claims c
      WHERE private.can_read_claim(c.id)
    ), '[]'::jsonb) INTO claims_json;

    IF p_domain = 'claims' THEN
      RETURN jsonb_build_object('claims', claims_json);
    END IF;

    SELECT COALESCE((
      SELECT jsonb_agg(
        to_jsonb(b) || jsonb_build_object(
          'instructions', COALESCE((
            SELECT jsonb_agg(
              to_jsonb(inst) || jsonb_build_object(
                'claims', COALESCE((
                  SELECT jsonb_agg(to_jsonb(ic))
                  FROM public.reimbursement_instruction_claims ic
                  WHERE ic.instruction_id = inst.id
                ), '[]'::jsonb)
              ) ORDER BY inst.line_order
            )
            FROM public.reimbursement_batch_instructions inst
            WHERE inst.batch_id = b.id
          ), '[]'::jsonb)
        ) ORDER BY b.created_at DESC
      )
      FROM public.reimbursement_batches b
      WHERE admin OR finance
    ), '[]'::jsonb) INTO batches_json;

    RETURN jsonb_build_object(
      'claims', claims_json,
      'approvalRules', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY sequence) FROM public.approval_rules r WHERE admin), '[]'::jsonb),
      'reimbursementBatches', batches_json
    );
  END IF;

  RAISE EXCEPTION 'Unknown domain snapshot: %', p_domain;
END $$;
