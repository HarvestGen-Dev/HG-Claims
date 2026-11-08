-- Migration: 20261108211000_include_user_id_in_snapshot.sql
-- Description:
-- 1. Ensure private.snapshot() includes 'user_id', uid and 'signupInvitations'.
-- 2. Ensure private.domain_snapshot('iam') includes 'user_id', uid.

BEGIN;

CREATE OR REPLACE FUNCTION private.snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
  admin boolean;
  finance boolean;
  result jsonb;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  uid := auth.uid();
  admin := private.has_role('SYSTEM_ADMIN');
  finance := private.has_role('FINANCE_OFFICER');

  SELECT jsonb_build_object(
    'user_id', uid,
    'profiles', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'roles', COALESCE((
            SELECT jsonb_agg(r.code)
            FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = p.id
          ), '[]'::jsonb)
        )
      )
      FROM public.profiles p
      WHERE admin OR p.status = 'ACTIVE' OR p.id = uid
    ), '[]'::jsonb),
    'ministries', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(m) || jsonb_build_object(
          'team_lead_ids', COALESCE((
            SELECT jsonb_agg(mtl.user_id)
            FROM public.ministry_team_leads mtl
            WHERE mtl.ministry_id = m.id
          ), '[]'::jsonb),
          'budgets', COALESCE((
            SELECT jsonb_agg(to_jsonb(mb) ORDER BY mb.year DESC)
            FROM public.ministry_budgets mb
            WHERE mb.ministry_id = m.id
          ), '[]'::jsonb)
        )
        ORDER BY m.name
      )
      FROM public.ministries m
    ), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY display_order, name) FROM public.expense_categories c), '[]'::jsonb),
    'costCentres', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc), '[]'::jsonb),
    'approvalRules', COALESCE((SELECT jsonb_agg(to_jsonb(ar) ORDER BY sequence) FROM public.approval_rules ar WHERE admin), '[]'::jsonb),
    'systemSettings', COALESCE((SELECT jsonb_agg(to_jsonb(ss)) FROM public.system_settings ss), '[]'::jsonb),
    'signupInvitations', CASE
      WHEN admin THEN COALESCE((
        SELECT jsonb_agg(to_jsonb(i) - 'token_hash' ORDER BY created_at DESC)
        FROM public.signup_invitations i
      ), '[]'::jsonb)
      ELSE '[]'::jsonb
    END,
    'reimbursementBatches', COALESCE((
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
    'claims', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'disbursement_voucher', COALESCE(
            (
              SELECT rbi.payment_description
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = c.active_instruction_id
            ),
            (
              SELECT rbi.payment_description
              FROM public.reimbursement_instruction_claims ric
              JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
              WHERE ric.claim_id = c.id
              ORDER BY ric.created_at DESC
              LIMIT 1
            ),
            (
              SELECT substring(COALESCE(pay.payment_reference, pay.notes) from 'P[0-9]{6}')
              FROM public.payments pay
              WHERE pay.claim_id = c.id
              ORDER BY pay.created_at DESC
              LIMIT 1
            )
          ),
          'batch_number', COALESCE(
            (
              SELECT rb.batch_number
              FROM public.reimbursement_batches rb
              WHERE rb.id = c.active_batch_id
            ),
            (
              SELECT rb.batch_number
              FROM public.reimbursement_instruction_claims ric
              JOIN public.reimbursement_batches rb ON rb.id = ric.batch_id
              WHERE ric.claim_id = c.id
              ORDER BY ric.created_at DESC
              LIMIT 1
            )
          ),
          'disbursement_line_order', COALESCE(
            (
              SELECT rbi.line_order
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = c.active_instruction_id
            ),
            (
              SELECT rbi.line_order
              FROM public.reimbursement_instruction_claims ric
              JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
              WHERE ric.claim_id = c.id
              ORDER BY ric.created_at DESC
              LIMIT 1
            )
          ),
          'expenses', COALESCE((
            SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order)
            FROM public.claim_expenses e
            WHERE e.claim_id = c.id
          ), '[]'::jsonb),
          'attachments', COALESCE((
            SELECT jsonb_agg(to_jsonb(a))
            FROM public.claim_attachments a
            WHERE a.claim_id = c.id
          ), '[]'::jsonb),
          'workflow_steps', COALESCE((
            SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence)
            FROM public.claim_workflow_steps s
            JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
            WHERE s.claim_id = c.id
          ), '[]'::jsonb),
          'approval_actions', COALESCE((
            SELECT jsonb_agg(to_jsonb(act) ORDER BY act.created_at ASC)
            FROM public.approval_actions act
            WHERE act.claim_id = c.id
          ), '[]'::jsonb),
          'finance_review', (
            SELECT to_jsonb(f)
            FROM public.finance_reviews f
            WHERE f.claim_id = c.id
              AND f.created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
            ORDER BY f.created_at DESC
            LIMIT 1
          ),
          'payment', (
            SELECT to_jsonb(p)
            FROM public.payments p
            WHERE p.claim_id = c.id
          )
        ) ORDER BY c.created_at DESC
      )
      FROM public.claims c
      WHERE private.can_read_claim(c.id)
    ), '[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(to_jsonb(n))
      FROM (
        SELECT * FROM public.notifications
        WHERE user_id = uid
        ORDER BY created_at DESC
        LIMIT 100
      ) n
    ), '[]'::jsonb),
    'auditLogs', CASE
      WHEN admin THEN COALESCE((
        SELECT jsonb_agg(to_jsonb(al) ORDER BY created_at DESC)
        FROM (SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT 500) al
      ), '[]'::jsonb)
      ELSE '[]'::jsonb
    END
  ) INTO result;

  RETURN private.redact_workspace_snapshot(result);
END $$;

-- Update private.domain_snapshot for IAM to also include user_id
CREATE OR REPLACE FUNCTION private.domain_snapshot(p_domain text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
  admin boolean;
  finance boolean;
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

  IF p_domain = 'bootstrap' THEN
    RETURN private.redact_workspace_snapshot(jsonb_build_object(
      'user_id', uid,
      'profiles', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(p) || jsonb_build_object(
            'roles', COALESCE((
              SELECT jsonb_agg(r.code)
              FROM public.user_roles ur
              JOIN public.roles r ON r.id = ur.role_id
              WHERE ur.user_id = p.id
            ), '[]'::jsonb)
          )
        )
        FROM public.profiles p
        WHERE admin OR p.status = 'ACTIVE' OR p.id = uid
      ), '[]'::jsonb),
      'ministries', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(m) || jsonb_build_object(
            'team_lead_ids', COALESCE((
              SELECT jsonb_agg(mtl.user_id)
              FROM public.ministry_team_leads mtl
              WHERE mtl.ministry_id = m.id
            ), '[]'::jsonb),
            'budgets', COALESCE((
              SELECT jsonb_agg(to_jsonb(mb) ORDER BY mb.year DESC)
              FROM public.ministry_budgets mb
              WHERE mb.ministry_id = m.id
            ), '[]'::jsonb)
          )
          ORDER BY m.name
        )
        FROM public.ministries m
      ), '[]'::jsonb),
      'categories', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY display_order, name) FROM public.expense_categories e), '[]'::jsonb),
      'costCentres', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc), '[]'::jsonb),
      'approvalRules', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY sequence) FROM public.approval_rules r WHERE admin), '[]'::jsonb),
      'systemSettings', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.system_settings s), '[]'::jsonb),
      'notifications', COALESCE((
        SELECT jsonb_agg(to_jsonb(n))
        FROM (
          SELECT * FROM public.notifications
          WHERE user_id = uid
          ORDER BY created_at DESC
          LIMIT 100
        ) n
      ), '[]'::jsonb),
      'auditLogs', '[]'::jsonb,
      'signupInvitations', COALESCE((
        SELECT jsonb_agg(to_jsonb(i) - 'token_hash' ORDER BY created_at DESC)
        FROM public.signup_invitations i
        WHERE admin
      ), '[]'::jsonb),
      'reimbursementBatches', COALESCE((
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
      'claims', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(c) || jsonb_build_object(
            'disbursement_voucher', COALESCE(
              (
                SELECT rbi.payment_description
                FROM public.reimbursement_batch_instructions rbi
                WHERE rbi.id = c.active_instruction_id
              ),
              (
                SELECT rbi.payment_description
                FROM public.reimbursement_instruction_claims ric
                JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
                WHERE ric.claim_id = c.id
                ORDER BY ric.created_at DESC
                LIMIT 1
              ),
              (
                SELECT substring(COALESCE(pay.payment_reference, pay.notes) from 'P[0-9]{6}')
                FROM public.payments pay
                WHERE pay.claim_id = c.id
                ORDER BY pay.created_at DESC
                LIMIT 1
              )
            ),
            'batch_number', COALESCE(
              (
                SELECT rb.batch_number
                FROM public.reimbursement_batches rb
                WHERE rb.id = c.active_batch_id
              ),
              (
                SELECT rb.batch_number
                FROM public.reimbursement_instruction_claims ric
                JOIN public.reimbursement_batches rb ON rb.id = ric.batch_id
                WHERE ric.claim_id = c.id
                ORDER BY ric.created_at DESC
                LIMIT 1
              )
            ),
            'disbursement_line_order', COALESCE(
              (
                SELECT rbi.line_order
                FROM public.reimbursement_batch_instructions rbi
                WHERE rbi.id = c.active_instruction_id
              ),
              (
                SELECT rbi.line_order
                FROM public.reimbursement_instruction_claims ric
                JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
                WHERE ric.claim_id = c.id
                ORDER BY ric.created_at DESC
                LIMIT 1
              )
            ),
            'expenses', COALESCE((
              SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order)
              FROM public.claim_expenses e
              WHERE e.claim_id = c.id
            ), '[]'::jsonb),
            'attachments', COALESCE((
              SELECT jsonb_agg(to_jsonb(a))
              FROM public.claim_attachments a
              WHERE a.claim_id = c.id
            ), '[]'::jsonb),
            'workflow_steps', COALESCE((
              SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence)
              FROM public.claim_workflow_steps s
              JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
              WHERE s.claim_id = c.id
            ), '[]'::jsonb),
            'approval_actions', COALESCE((
              SELECT jsonb_agg(to_jsonb(act) ORDER BY act.created_at ASC)
              FROM public.approval_actions act
              WHERE act.claim_id = c.id
            ), '[]'::jsonb),
            'finance_review', (
              SELECT to_jsonb(f)
              FROM public.finance_reviews f
              WHERE f.claim_id = c.id
                AND f.created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
              ORDER BY f.created_at DESC
              LIMIT 1
            ),
            'payment', (
              SELECT to_jsonb(p)
              FROM public.payments p
              WHERE p.claim_id = c.id
            )
          ) ORDER BY c.created_at DESC
        )
        FROM public.claims c
        WHERE private.can_read_claim(c.id)
      ), '[]'::jsonb)
    ));
  END IF;

  IF p_domain = 'claims' THEN
    RETURN private.redact_workspace_snapshot(jsonb_build_object(
      'claims', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(c) || jsonb_build_object(
            'disbursement_voucher', COALESCE(
              (
                SELECT rbi.payment_description
                FROM public.reimbursement_batch_instructions rbi
                WHERE rbi.id = c.active_instruction_id
              ),
              (
                SELECT rbi.payment_description
                FROM public.reimbursement_instruction_claims ric
                JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
                WHERE ric.claim_id = c.id
                ORDER BY ric.created_at DESC
                LIMIT 1
              ),
              (
                SELECT substring(COALESCE(pay.payment_reference, pay.notes) from 'P[0-9]{6}')
                FROM public.payments pay
                WHERE pay.claim_id = c.id
                ORDER BY pay.created_at DESC
                LIMIT 1
              )
            ),
            'batch_number', COALESCE(
              (
                SELECT rb.batch_number
                FROM public.reimbursement_batches rb
                WHERE rb.id = c.active_batch_id
              ),
              (
                SELECT rb.batch_number
                FROM public.reimbursement_instruction_claims ric
                JOIN public.reimbursement_batches rb ON rb.id = ric.batch_id
                WHERE ric.claim_id = c.id
                ORDER BY ric.created_at DESC
                LIMIT 1
              )
            ),
            'disbursement_line_order', COALESCE(
              (
                SELECT rbi.line_order
                FROM public.reimbursement_batch_instructions rbi
                WHERE rbi.id = c.active_instruction_id
              ),
              (
                SELECT rbi.line_order
                FROM public.reimbursement_instruction_claims ric
                JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
                WHERE ric.claim_id = c.id
                ORDER BY ric.created_at DESC
                LIMIT 1
              )
            ),
            'expenses', COALESCE((
              SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order)
              FROM public.claim_expenses e
              WHERE e.claim_id = c.id
            ), '[]'::jsonb),
            'attachments', COALESCE((
              SELECT jsonb_agg(to_jsonb(a))
              FROM public.claim_attachments a
              WHERE a.claim_id = c.id
            ), '[]'::jsonb),
            'workflow_steps', COALESCE((
              SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence)
              FROM public.claim_workflow_steps s
              JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
              WHERE s.claim_id = c.id
            ), '[]'::jsonb),
            'approval_actions', COALESCE((
              SELECT jsonb_agg(to_jsonb(act) ORDER BY act.created_at ASC)
              FROM public.approval_actions act
              WHERE act.claim_id = c.id
            ), '[]'::jsonb),
            'finance_review', (
              SELECT to_jsonb(f)
              FROM public.finance_reviews f
              WHERE f.claim_id = c.id
                AND f.created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
              ORDER BY f.created_at DESC
              LIMIT 1
            ),
            'payment', (
              SELECT to_jsonb(p)
              FROM public.payments p
              WHERE p.claim_id = c.id
            )
          ) ORDER BY c.created_at DESC
        )
        FROM public.claims c
        WHERE private.can_read_claim(c.id)
      ), '[]'::jsonb)
    ));
  END IF;

  IF p_domain = 'master-data' THEN
    RETURN jsonb_build_object(
      'ministries', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(m) || jsonb_build_object(
            'team_lead_ids', COALESCE((
              SELECT jsonb_agg(mtl.user_id)
              FROM public.ministry_team_leads mtl
              WHERE mtl.ministry_id = m.id
            ), '[]'::jsonb),
            'budgets', COALESCE((
              SELECT jsonb_agg(to_jsonb(mb) ORDER BY mb.year DESC)
              FROM public.ministry_budgets mb
              WHERE mb.ministry_id = m.id
            ), '[]'::jsonb)
          )
          ORDER BY m.name
        )
        FROM public.ministries m
      ), '[]'::jsonb),
      'categories', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY display_order, name) FROM public.expense_categories e), '[]'::jsonb),
      'costCentres', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc), '[]'::jsonb),
      'approvalRules', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY sequence) FROM public.approval_rules r WHERE admin), '[]'::jsonb),
      'systemSettings', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.system_settings s), '[]'::jsonb)
    );
  END IF;

  IF p_domain = 'finance' THEN
    RETURN private.redact_workspace_snapshot(jsonb_build_object(
      'reimbursementBatches', COALESCE((
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
      ), '[]'::jsonb)
    ));
  END IF;

  IF p_domain = 'notifications' THEN
    RETURN jsonb_build_object(
      'notifications', COALESCE((
        SELECT jsonb_agg(to_jsonb(n))
        FROM (
          SELECT * FROM public.notifications
          WHERE user_id = uid
          ORDER BY created_at DESC
          LIMIT 100
        ) n
      ), '[]'::jsonb)
    );
  END IF;

  IF p_domain = 'iam' THEN
    RETURN private.redact_workspace_snapshot(jsonb_build_object(
      'user_id', uid,
      'profiles', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(p) || jsonb_build_object(
            'roles', COALESCE((
              SELECT jsonb_agg(r.code)
              FROM public.user_roles ur
              JOIN public.roles r ON r.id = ur.role_id
              WHERE ur.user_id = p.id
            ), '[]'::jsonb)
          )
        )
        FROM public.profiles p
        WHERE admin OR p.status = 'ACTIVE' OR p.id = uid
      ), '[]'::jsonb),
      'signupInvitations', COALESCE((
        SELECT jsonb_agg(to_jsonb(i) - 'token_hash' ORDER BY created_at DESC)
        FROM public.signup_invitations i
        WHERE admin
      ), '[]'::jsonb)
    ));
  END IF;

  RAISE EXCEPTION 'Unknown domain %', p_domain;
END $$;

COMMIT;
