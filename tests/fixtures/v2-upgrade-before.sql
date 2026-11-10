-- Isolated test fixture only; this file is deliberately outside the repository.
CREATE TABLE private.v2_upgrade_fixture(kind text PRIMARY KEY,entity_id uuid,frozen jsonb);
DO $$
DECLARE u uuid;role text;team uuid;claim uuid;batch uuid;instruction uuid;snapshot jsonb;
BEGIN
 FOREACH role IN ARRAY ARRAY['SYSTEM_ADMIN','FINANCE_OFFICER','CLAIMANT'] LOOP
 u=gen_random_uuid();INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES(u,'upgrade-'||role||'@test.invalid','{"full_name":"Upgrade Fixture"}','{}');
 INSERT INTO public.user_roles(user_id,role_id) SELECT u,id FROM public.roles WHERE code=role;
 INSERT INTO private.v2_upgrade_fixture(kind,entity_id) VALUES(role,u);
 END LOOP;
 SELECT id INTO team FROM public.ministries LIMIT 1;
 INSERT INTO public.claims(submitted_by_user_id,claimant_id,claimant_name,ministry_id,claim_date,purpose,total_amount,status,bank_code,bank_account_holder_name,bank_account_number)
 VALUES(u,u,'Historical payee',team,'2025-12-15','Historical supplies',10,'APPROVED_FOR_PAYMENT','MBBEMYKL','Historical payee',private.encrypt_bank_account('000123456789')) RETURNING id INTO claim;
 snapshot=jsonb_build_object('approved_amount_cents',1000,'approved_amount',10,'bank_code','MBBEMYKL','bank_account_holder_name','Historical payee','bank_account_number',(SELECT bank_account_number FROM public.claims WHERE id=claim));
 UPDATE public.claims SET approved_snapshot=snapshot,reimbursement_status='RESERVED_IN_BATCH' WHERE id=claim;
 INSERT INTO public.reimbursement_batches(batch_number,status,template_version,claim_count,transfer_count,total_amount_cents,total_amount,content_digest_sha256,created_by)
 VALUES('HG-HISTORICAL-TEST','EXPORTED','SBP_BIFF8_V1',1,1,1000,10,repeat('a',64),u) RETURNING id INTO batch;
 INSERT INTO public.reimbursement_batch_instructions(batch_id,line_order,payment_description,payment_mode,beneficiary_user_id,beneficiary_name,beneficiary_account_number,beneficiary_bank_name,beneficiary_bank_code,amount_cents,amount,claim_count,status)
 VALUES(batch,1,'P250001','LGP',u,'Historical payee',private.encrypt_bank_account('000123456789'),'Maybank / Malayan Banking Berhad','MBBEMYKL',1000,10,1,'EXPORTED') RETURNING id INTO instruction;
 INSERT INTO public.reimbursement_instruction_claims(batch_id,instruction_id,claim_id,allocated_amount_cents,allocated_amount,is_active) VALUES(batch,instruction,claim,1000,10,true);
 UPDATE public.claims SET active_batch_id=batch,active_instruction_id=instruction WHERE id=claim;
 INSERT INTO private.v2_upgrade_fixture VALUES('CLAIM',claim,snapshot),('BATCH',batch,jsonb_build_object('digest',repeat('a',64)));
END $$;
