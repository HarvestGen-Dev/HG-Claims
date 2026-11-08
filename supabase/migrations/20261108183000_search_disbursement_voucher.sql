-- Migration: 20261108183000_search_disbursement_voucher.sql
-- Description:
-- Enables searching by disbursement voucher code (e.g. P260001) in claims queries and pagination,
-- and enhances voucher projection across paginate_claims, snapshot, and domain_snapshot.

BEGIN;

-- 1. Update private.paginate_claims
CREATE OR REPLACE FUNCTION private.paginate_claims(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid;
  v_admin boolean;
  v_finance boolean;
  v_search text;
  v_status text;
  v_ministry_id uuid;
  v_start_date date;
  v_end_date date;
  v_voucher text;
  v_sort_field text;
  v_sort_dir text;
  v_page integer;
  v_page_size integer;
  v_offset integer;
  v_total_count integer;
  v_items jsonb;
  v_redacted jsonb;
  v_summary jsonb;
BEGIN
  IF NOT private.active_user() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  v_uid := auth.uid();
  v_admin := private.has_role('SYSTEM_ADMIN');
  v_finance := private.has_role('FINANCE_OFFICER');

  v_search := lower(trim(COALESCE(p_params->>'search', '')));
  v_voucher := lower(trim(COALESCE(p_params->>'disbursement_voucher', '')));
  v_status := NULLIF(trim(COALESCE(p_params->>'status', '')), '');
  IF v_status = 'ALL' THEN
    v_status := NULL;
  END IF;

  IF NULLIF(trim(COALESCE(p_params->>'ministry_id', '')), '') IS NOT NULL
     AND trim(p_params->>'ministry_id') <> 'ALL' THEN
    v_ministry_id := (p_params->>'ministry_id')::uuid;
  END IF;

  IF NULLIF(trim(COALESCE(p_params->>'start_date', '')), '') IS NOT NULL THEN
    v_start_date := (p_params->>'start_date')::date;
  END IF;

  IF NULLIF(trim(COALESCE(p_params->>'end_date', '')), '') IS NOT NULL THEN
    v_end_date := (p_params->>'end_date')::date;
  END IF;

  v_sort_field := COALESCE(NULLIF(trim(COALESCE(p_params->>'sort_field', '')), ''), 'created_at');
  v_sort_dir := CASE WHEN lower(COALESCE(p_params->>'sort_dir', 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_page := GREATEST(1, COALESCE((p_params->>'page')::integer, 1));
  v_page_size := LEAST(100, GREATEST(1, COALESCE((p_params->>'page_size')::integer, 25)));
  v_offset := (v_page - 1) * v_page_size;

  WITH readable_claims AS (
    SELECT c.*, m.name AS ministry_name
    FROM public.claims c
    LEFT JOIN public.ministries m ON m.id = c.ministry_id
    WHERE private.can_read_claim(c.id)
  ),
  summary_agg AS (
    SELECT jsonb_build_object(
      'total_claims', COUNT(*),
      'total_amount', COALESCE(SUM(total_amount), 0),
      'pending_count', COUNT(*) FILTER (WHERE status IN ('SUBMITTED', 'PENDING_MINISTRY_APPROVAL', 'PENDING_FINANCE_REVIEW', 'PENDING_FINAL_APPROVAL')),
      'pending_amount', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('SUBMITTED', 'PENDING_MINISTRY_APPROVAL', 'PENDING_FINANCE_REVIEW', 'PENDING_FINAL_APPROVAL')), 0),
      'approved_count', COUNT(*) FILTER (WHERE status IN ('APPROVED', 'APPROVED_FOR_PAYMENT')),
      'approved_amount', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('APPROVED', 'APPROVED_FOR_PAYMENT')), 0),
      'paid_count', COUNT(*) FILTER (WHERE status = 'PAID'),
      'paid_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0),
      'returned_count', COUNT(*) FILTER (WHERE status = 'RETURNED_FOR_CLARIFICATION'),
      'rejected_count', COUNT(*) FILTER (WHERE status = 'REJECTED'),
      'draft_count', COUNT(*) FILTER (WHERE status = 'DRAFT')
    ) AS stats
    FROM readable_claims
  ),
  filtered AS (
    SELECT rc.*
    FROM readable_claims rc
    WHERE (v_ministry_id IS NULL OR rc.ministry_id = v_ministry_id)
      AND (
        v_status IS NULL
        OR (v_status = 'PENDING' AND rc.status IN ('SUBMITTED', 'PENDING_MINISTRY_APPROVAL', 'PENDING_FINANCE_REVIEW', 'PENDING_FINAL_APPROVAL'))
        OR rc.status = v_status
      )
      AND (v_start_date IS NULL OR rc.claim_date >= v_start_date)
      AND (v_end_date IS NULL OR rc.claim_date <= v_end_date)
      AND (
        v_voucher = ''
        OR rc.active_instruction_id IN (
          SELECT id FROM public.reimbursement_batch_instructions WHERE lower(payment_description) LIKE '%' || v_voucher || '%'
        )
        OR rc.id IN (
          SELECT ric.claim_id
          FROM public.reimbursement_instruction_claims ric
          JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
          WHERE lower(rbi.payment_description) LIKE '%' || v_voucher || '%'
        )
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE p.claim_id = rc.id
            AND (lower(COALESCE(p.payment_reference, '')) LIKE '%' || v_voucher || '%' OR lower(COALESCE(p.notes, '')) LIKE '%' || v_voucher || '%')
        )
      )
      AND (
        v_search = ''
        OR lower(COALESCE(rc.claim_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.purpose, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.claimant_name, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.claimant_email, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.ministry_name, '')) LIKE '%' || v_search || '%'
        OR rc.active_instruction_id IN (
          SELECT id FROM public.reimbursement_batch_instructions WHERE lower(payment_description) LIKE '%' || v_search || '%'
        )
        OR rc.id IN (
          SELECT ric.claim_id
          FROM public.reimbursement_instruction_claims ric
          JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
          WHERE lower(rbi.payment_description) LIKE '%' || v_search || '%'
        )
        OR rc.active_batch_id IN (
          SELECT id FROM public.reimbursement_batches WHERE lower(batch_number) LIKE '%' || v_search || '%'
        )
        OR rc.id IN (
          SELECT ric.claim_id
          FROM public.reimbursement_instruction_claims ric
          JOIN public.reimbursement_batches rb ON rb.id = ric.batch_id
          WHERE lower(rb.batch_number) LIKE '%' || v_search || '%'
        )
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE p.claim_id = rc.id
            AND (
              lower(COALESCE(p.payment_reference, '')) LIKE '%' || v_search || '%'
              OR lower(COALESCE(p.notes, '')) LIKE '%' || v_search || '%'
            )
        )
      )
  ),
  counted AS (
    SELECT COUNT(*)::integer AS cnt FROM filtered
  ),
  paged AS (
    SELECT f.*
    FROM filtered f
    ORDER BY
      CASE WHEN v_sort_field = 'claim_date' AND v_sort_dir = 'asc' THEN f.claim_date END ASC,
      CASE WHEN v_sort_field = 'claim_date' AND v_sort_dir = 'desc' THEN f.claim_date END DESC,
      CASE WHEN v_sort_field = 'submitted_at' AND v_sort_dir = 'asc' THEN COALESCE(f.submitted_at, f.created_at) END ASC,
      CASE WHEN v_sort_field = 'submitted_at' AND v_sort_dir = 'desc' THEN COALESCE(f.submitted_at, f.created_at) END DESC,
      CASE WHEN v_sort_field = 'total_amount' AND v_sort_dir = 'asc' THEN f.total_amount END ASC,
      CASE WHEN v_sort_field = 'total_amount' AND v_sort_dir = 'desc' THEN f.total_amount END DESC,
      CASE WHEN v_sort_field = 'status' AND v_sort_dir = 'asc' THEN f.status END ASC,
      CASE WHEN v_sort_field = 'status' AND v_sort_dir = 'desc' THEN f.status END DESC,
      CASE WHEN v_sort_field = 'claim_number' AND v_sort_dir = 'asc' THEN COALESCE(f.claim_number, '') END ASC,
      CASE WHEN v_sort_field = 'claim_number' AND v_sort_dir = 'desc' THEN COALESCE(f.claim_number, '') END DESC,
      CASE WHEN v_sort_dir = 'asc' THEN f.created_at END ASC,
      f.created_at DESC,
      f.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  )
  SELECT
    (SELECT cnt FROM counted),
    (SELECT stats FROM summary_agg),
    COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(p) - 'ministry_name') || jsonb_build_object(
          'disbursement_voucher', COALESCE(
            (
              SELECT rbi.payment_description
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = p.active_instruction_id
            ),
            (
              SELECT rbi.payment_description
              FROM public.reimbursement_instruction_claims ric
              JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
              WHERE ric.claim_id = p.id
              ORDER BY ric.created_at DESC
              LIMIT 1
            ),
            (
              SELECT substring(COALESCE(pay.payment_reference, pay.notes) from 'P[0-9]{6}')
              FROM public.payments pay
              WHERE pay.claim_id = p.id
              ORDER BY pay.created_at DESC
              LIMIT 1
            )
          ),
          'batch_number', COALESCE(
            (
              SELECT rb.batch_number
              FROM public.reimbursement_batches rb
              WHERE rb.id = p.active_batch_id
            ),
            (
              SELECT rb.batch_number
              FROM public.reimbursement_instruction_claims ric
              JOIN public.reimbursement_batches rb ON rb.id = ric.batch_id
              WHERE ric.claim_id = p.id
              ORDER BY ric.created_at DESC
              LIMIT 1
            )
          ),
          'disbursement_line_order', COALESCE(
            (
              SELECT rbi.line_order
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = p.active_instruction_id
            ),
            (
              SELECT rbi.line_order
              FROM public.reimbursement_instruction_claims ric
              JOIN public.reimbursement_batch_instructions rbi ON rbi.id = ric.instruction_id
              WHERE ric.claim_id = p.id
              ORDER BY ric.created_at DESC
              LIMIT 1
            )
          ),
          'expense_count', (SELECT COUNT(*)::integer FROM public.claim_expenses e WHERE e.claim_id = p.id),
          'attachment_count', (SELECT COUNT(*)::integer FROM public.claim_attachments a WHERE a.claim_id = p.id),
          'workflow_steps', COALESCE((
            SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence)
            FROM public.claim_workflow_steps s
            JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
            WHERE s.claim_id = p.id
          ), '[]'::jsonb),
          'finance_review', (
            SELECT to_jsonb(fr)
            FROM public.finance_reviews fr
            WHERE fr.claim_id = p.id
              AND fr.created_at >= COALESCE(p.resubmitted_at, p.submitted_at, p.created_at)
            ORDER BY fr.created_at DESC
            LIMIT 1
          ),
          'payment', (
            SELECT to_jsonb(pay)
            FROM public.payments pay
            WHERE pay.claim_id = p.id
            ORDER BY pay.created_at DESC
            LIMIT 1
          )
        )
      )
      FROM paged p
    ), '[]'::jsonb)
  INTO v_total_count, v_summary, v_items;

  v_redacted := private.redact_workspace_snapshot(jsonb_build_object('claims', v_items));
  v_items := COALESCE(v_redacted->'claims', '[]'::jsonb);

  RETURN jsonb_build_object(
    'items', v_items,
    'total_count', COALESCE(v_total_count, 0),
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', CEIL(COALESCE(v_total_count, 0)::numeric / v_page_size)::integer,
    'summary', v_summary
  );
END $$;

-- 2. Update private.snapshot
CREATE OR REPLACE FUNCTION private.snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
  admin boolean;
  result jsonb;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  uid := auth.uid();
  admin := private.has_role('SYSTEM_ADMIN');

  SELECT jsonb_build_object(
    'profiles', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'roles', COALESCE((
            SELECT jsonb_agg(ur.role_code)
            FROM public.user_roles ur
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
      )
      FROM public.ministries m
    ), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.expense_categories c), '[]'::jsonb),
    'costCentres', COALESCE((SELECT jsonb_agg(to_jsonb(cc)) FROM public.cost_centres cc), '[]'::jsonb),
    'approvalRules', COALESCE((SELECT jsonb_agg(to_jsonb(ar)) FROM public.approval_rules ar), '[]'::jsonb),
    'systemSettings', COALESCE((SELECT jsonb_agg(to_jsonb(ss)) FROM public.system_settings ss), '[]'::jsonb),
    'reimbursementBatches', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(b) || jsonb_build_object(
          'instructions', COALESCE((
            SELECT jsonb_agg(
              to_jsonb(i) || jsonb_build_object(
                'claims', COALESCE((
                  SELECT jsonb_agg(
                    to_jsonb(ic) || jsonb_build_object(
                      'claim', (
                        SELECT jsonb_build_object(
                          'id', cl.id,
                          'claim_number', cl.claim_number,
                          'purpose', cl.purpose,
                          'total_amount', cl.total_amount,
                          'claim_date', cl.claim_date,
                          'claimant_name', cl.claimant_name,
                          'status', cl.status
                        )
                        FROM public.claims cl
                        WHERE cl.id = ic.claim_id
                      )
                    )
                  )
                  FROM public.reimbursement_instruction_claims ic
                  WHERE ic.instruction_id = i.id
                ), '[]'::jsonb)
              ) ORDER BY i.line_order ASC
            )
            FROM public.reimbursement_batch_instructions i
            WHERE i.batch_id = b.id
          ), '[]'::jsonb)
        ) ORDER BY b.created_at DESC
      )
      FROM public.reimbursement_batches b
      WHERE admin OR private.has_role('FINANCE_OFFICER')
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
            SELECT to_jsonb(fr)
            FROM public.finance_reviews fr
            WHERE fr.claim_id = c.id
              AND fr.created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
            ORDER BY fr.created_at DESC
            LIMIT 1
          ),
          'payment', (
            SELECT to_jsonb(pay)
            FROM public.payments pay
            WHERE pay.claim_id = c.id
            ORDER BY pay.created_at DESC
            LIMIT 1
          )
        )
      )
      FROM public.claims c
      WHERE private.can_read_claim(c.id)
    ), '[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY created_at DESC)
      FROM public.notifications n
      WHERE n.user_id = uid
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

-- 3. Update private.domain_snapshot
CREATE OR REPLACE FUNCTION private.domain_snapshot(p_domain text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
  admin boolean;
  result jsonb;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  uid := auth.uid();
  admin := private.has_role('SYSTEM_ADMIN');

  IF p_domain = 'claims' THEN
    SELECT jsonb_build_object(
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
              SELECT to_jsonb(fr)
              FROM public.finance_reviews fr
              WHERE fr.claim_id = c.id
                AND fr.created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
              ORDER BY fr.created_at DESC
              LIMIT 1
            ),
            'payment', (
              SELECT to_jsonb(pay)
              FROM public.payments pay
              WHERE pay.claim_id = c.id
              ORDER BY pay.created_at DESC
              LIMIT 1
            )
          )
        )
        FROM public.claims c
        WHERE private.can_read_claim(c.id)
      ), '[]'::jsonb)
    ) INTO result;
    RETURN private.redact_workspace_snapshot(result);
  END IF;

  RETURN private.snapshot();
END $$;

COMMIT;
