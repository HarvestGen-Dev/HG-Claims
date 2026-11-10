-- Run only on the isolated upgrade fixture database, after the v2 migration.
DO $$
DECLARE row record;before_snapshot jsonb;after_snapshot jsonb;v_claim_id uuid;v_batch_id uuid;
BEGIN
 FOR row IN SELECT * FROM private.v2_upgrade_fixture WHERE kind IN ('SYSTEM_ADMIN','FINANCE_OFFICER') LOOP
 IF NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=row.entity_id AND r.code='FINANCE') THEN RAISE EXCEPTION 'Finance role migration failed';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.user_roles ur JOIN private.v2_upgrade_fixture f ON f.entity_id=ur.user_id WHERE f.kind='CLAIMANT') THEN RAISE EXCEPTION 'Baseline member still has an assigned role';END IF;
 SELECT entity_id,frozen INTO v_claim_id,before_snapshot FROM private.v2_upgrade_fixture WHERE kind='CLAIM';
 SELECT approved_snapshot INTO after_snapshot FROM public.claims WHERE id=v_claim_id;
 IF before_snapshot IS DISTINCT FROM after_snapshot THEN RAISE EXCEPTION 'Historical frozen snapshot changed';END IF;
 IF (SELECT total_amount FROM public.claims WHERE id=v_claim_id)<>10 OR (SELECT status FROM public.claims WHERE id=v_claim_id)<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Historical claim changed';END IF;
 SELECT entity_id INTO v_batch_id FROM private.v2_upgrade_fixture WHERE kind='BATCH';
 IF (SELECT content_digest_sha256 FROM public.reimbursement_batches WHERE id=v_batch_id)<>repeat('a',64) OR (SELECT status FROM public.reimbursement_batches WHERE id=v_batch_id)<>'EXPORTED' THEN RAISE EXCEPTION 'Historical batch changed';END IF;
 IF private.decrypt_bank_account((SELECT beneficiary_account_number FROM public.reimbursement_batch_instructions WHERE batch_id=v_batch_id))<>'000123456789' THEN RAISE EXCEPTION 'Historical encrypted account unreadable';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.reimbursement_instruction_claims WHERE claim_id=v_claim_id AND batch_id=v_batch_id AND is_active) THEN RAISE EXCEPTION 'Historical reservation lost';END IF;
 IF private.encrypt_bank_account('000987654321') NOT LIKE 'enc:v2:%' THEN RAISE EXCEPTION 'New encryption key not used';END IF;
 RAISE NOTICE 'PASS: legacy roles, baseline access, historical claims, encrypted snapshots, batches and reservations preserved';
END $$;
