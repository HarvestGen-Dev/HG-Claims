-- ============================================================================
-- Migration: 20261108153000_allow_finance_self_approval.sql
-- Description: Allow Finance Officers and System Administrators to verify, approve,
-- pay, and reconcile their own claims and bulk reimbursement instructions.
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('private.command(text,jsonb)'::regprocedure);
  old_approve text := $old$      IF submitter=uid OR c.claimant_id=uid THEN RAISE EXCEPTION 'You cannot approve your own submission' USING ERRCODE='42501'; END IF;$old$;
  new_approve text := $new$      IF (submitter=uid OR c.claimant_id=uid) AND NOT (finance OR admin) THEN RAISE EXCEPTION 'You cannot approve your own submission' USING ERRCODE='42501'; END IF;$new$;

  old_verify text := $old$      IF NOT (finance OR admin) OR submitter=uid OR c.claimant_id=uid OR c.status<>'PENDING_FINANCE_REVIEW' THEN RAISE EXCEPTION 'Finance verification is not allowed' USING ERRCODE='42501'; END IF;$old$;
  new_verify text := $new$      IF NOT (finance OR admin) OR c.status<>'PENDING_FINANCE_REVIEW' THEN RAISE EXCEPTION 'Finance verification is not allowed' USING ERRCODE='42501'; END IF;$new$;

  old_pay text := $old$      IF NOT (finance OR admin) OR submitter=uid OR c.claimant_id=uid OR c.status<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Payment is not allowed' USING ERRCODE='42501'; END IF;$old$;
  new_pay text := $new$      IF NOT (finance OR admin) OR c.status<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Payment is not allowed' USING ERRCODE='42501'; END IF;$new$;

  old_reconcile text := $old$      IF v_inst.beneficiary_user_id = uid AND NOT admin THEN$old$;
  new_reconcile text := $new$      IF v_inst.beneficiary_user_id = uid AND NOT (finance OR admin) THEN$new$;
BEGIN
  IF strpos(definition, old_approve) = 0 THEN
    RAISE EXCEPTION 'Unexpected approve check definition in private.command';
  END IF;
  IF strpos(definition, old_verify) = 0 THEN
    RAISE EXCEPTION 'Unexpected verify check definition in private.command';
  END IF;
  IF strpos(definition, old_pay) = 0 THEN
    RAISE EXCEPTION 'Unexpected pay check definition in private.command';
  END IF;
  IF strpos(definition, old_reconcile) = 0 THEN
    RAISE EXCEPTION 'Unexpected reconcile check definition in private.command';
  END IF;

  definition := replace(definition, old_approve, new_approve);
  definition := replace(definition, old_verify, new_verify);
  definition := replace(definition, old_pay, new_pay);
  definition := replace(definition, old_reconcile, new_reconcile);

  EXECUTE definition;
END $migration$;

COMMIT;
