-- ============================================================================
-- Migration: 20261104000001_performance_optimization_and_pagination.sql
-- Description: Additive performance indexes, server-paginated/filtered claim
-- list RPC, on-demand single-claim detail RPC, and lightweight bootstrap domain
-- snapshot while preserving RLS, RBAC, and payee bank detail redaction.
-- ============================================================================

-- 1. Targeted Composite Indexes for High-Frequency Filter, Sort & Join Patterns
CREATE INDEX IF NOT EXISTS idx_claims_created_at_desc
  ON public.claims (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_claims_status_created_at
  ON public.claims (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_ministry_status_created
  ON public.claims (ministry_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_submitted_by_created
  ON public.claims (submitted_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_claimant_created
  ON public.claims (claimant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_claim_date_desc
  ON public.claims (claim_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_active_batch_id
  ON public.claims (active_batch_id)
  WHERE active_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claim_attachments_expense_id
  ON public.claim_attachments (expense_id)
  WHERE expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_reviews_claim_created
  ON public.finance_reviews (claim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc
  ON public.audit_logs (created_at DESC);

-- 2. On-Demand Single-Claim Detail Function (with full nested expenses, attachments, workflow, comments)
CREATE OR REPLACE FUNCTION private.get_claim_detail(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid;
  v_admin boolean;
  v_finance boolean;
  v_claim jsonb;
  v_wrapped jsonb;
BEGIN
  IF NOT private.active_user() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  IF p_claim_id IS NULL OR NOT private.can_read_claim(p_claim_id) THEN
    RAISE EXCEPTION 'Claim not accessible' USING ERRCODE = '42501';
  END IF;

  v_uid := auth.uid();
  v_admin := private.has_role('SYSTEM_ADMIN');
  v_finance := private.has_role('FINANCE_OFFICER');

  SELECT
    to_jsonb(c) || jsonb_build_object(
      'submitted_by', (
        SELECT to_jsonb(p) - 'bank_name' - 'bank_code' - 'bank_account_holder_name'
          - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic'
          - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address'
        FROM public.profiles p
        WHERE p.id = COALESCE(c.submitted_by_user_id, c.claimant_id)
      ),
      'claimant', (
        SELECT to_jsonb(p) - 'bank_name' - 'bank_code' - 'bank_account_holder_name'
          - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic'
          - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address'
        FROM public.profiles p
        WHERE p.id = c.claimant_id
      ),
      'expenses', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(e) || jsonb_build_object(
            'cost_centre', (SELECT to_jsonb(cc) FROM public.cost_centres cc WHERE cc.id = e.cost_centre_id),
            'attachments', COALESCE((
              SELECT jsonb_agg(to_jsonb(a))
              FROM public.claim_attachments a
              WHERE a.expense_id = e.id
            ), '[]'::jsonb)
          ) ORDER BY e.sort_order
        )
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
        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
        FROM public.approval_actions a
        WHERE a.claim_id = c.id
      ), '[]'::jsonb),
      'comments', COALESCE((
        SELECT jsonb_agg(to_jsonb(cm) ORDER BY cm.created_at)
        FROM public.claim_comments cm
        WHERE cm.claim_id = c.id
          AND (cm.visibility = 'PUBLIC_WORKFLOW' OR v_admin OR (cm.visibility = 'FINANCE_INTERNAL' AND v_finance))
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
    )
  INTO v_claim
  FROM public.claims c
  WHERE c.id = p_claim_id;

  v_wrapped := private.redact_workspace_snapshot(
    jsonb_build_object('claims', jsonb_build_array(v_claim))
  );

  RETURN jsonb_build_object('claim', (v_wrapped->'claims')->0);
END $$;

REVOKE ALL ON FUNCTION private.get_claim_detail(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nlcc_claim_detail(p_claim_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.get_claim_detail(p_claim_id);
$$;

REVOKE ALL ON FUNCTION public.nlcc_claim_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nlcc_claim_detail(uuid) TO authenticated;

-- 3. Server-Filtered & Paginated Claims Query Function
CREATE OR REPLACE FUNCTION private.query_claims(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid;
  v_admin boolean;
  v_finance boolean;
  v_search text;
  v_status text;
  v_ministry_id uuid;
  v_start_date date;
  v_end_date date;
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
        v_search = ''
        OR lower(COALESCE(rc.claim_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.purpose, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.claimant_name, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.claimant_email, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.ministry_name, '')) LIKE '%' || v_search || '%'
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
            SELECT to_jsonb(py)
            FROM public.payments py
            WHERE py.claim_id = p.id
          )
        )
      )
      FROM paged p
    ), '[]'::jsonb)
  INTO v_total_count, v_summary, v_items;

  v_redacted := private.redact_workspace_snapshot(
    jsonb_build_object('claims', v_items)
  );

  RETURN jsonb_build_object(
    'items', v_redacted->'claims',
    'total_count', COALESCE(v_total_count, 0),
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', GREATEST(1, CEIL(COALESCE(v_total_count, 0)::numeric / v_page_size)::integer),
    'summary', COALESCE(v_summary, '{}'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION private.query_claims(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nlcc_query_claims(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.query_claims(p_params);
$$;

REVOKE ALL ON FUNCTION public.nlcc_query_claims(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nlcc_query_claims(jsonb) TO authenticated;

-- 4. Extend private.domain_snapshot with 'bootstrap' mode that omits historical
-- audit logs and redundant nested claim comment/action histories on startup.
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

  IF p_domain = 'bootstrap' THEN
    RETURN jsonb_build_object(
      'user_id', uid,
      'profiles', COALESCE((
        SELECT jsonb_agg(
          (CASE WHEN p.id = uid OR admin OR finance OR COALESCE(p.is_payee_only, false) = true OR p.created_by_user_id = uid
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
      'ministries', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY name) FROM public.ministries m), '[]'::jsonb),
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
              SELECT jsonb_agg(to_jsonb(s) ORDER BY sequence)
              FROM public.claim_workflow_steps s
              JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
              WHERE s.claim_id = c.id
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
    );
  END IF;

  IF p_domain = 'iam' THEN
    RETURN jsonb_build_object(
      'user_id', uid,
      'profiles', COALESCE((
        SELECT jsonb_agg(
          (CASE WHEN p.id = uid OR admin OR finance OR COALESCE(p.is_payee_only, false) = true OR p.created_by_user_id = uid
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

REVOKE ALL ON FUNCTION private.domain_snapshot(text) FROM PUBLIC, anon, authenticated;
