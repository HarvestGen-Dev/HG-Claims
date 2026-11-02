-- Domain-scoped snapshot RPC so bounded-context endpoints (/api/v1/*) only query their owned tables.
CREATE OR REPLACE FUNCTION private.domain_snapshot(p_domain text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
  admin boolean;
  finance boolean;
  claims_json jsonb;
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
            ELSE to_jsonb(p) - 'bank_name' - 'bank_account_number' - 'phone' - 'email'
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
          'submitted_by', (SELECT to_jsonb(p) - 'bank_name' - 'bank_account_number' FROM public.profiles p WHERE p.id = COALESCE(c.submitted_by_user_id, c.claimant_id)),
          'claimant', (SELECT to_jsonb(p) - 'bank_name' - 'bank_account_number' FROM public.profiles p WHERE p.id = c.claimant_id),
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

    RETURN jsonb_build_object(
      'claims', claims_json,
      'approvalRules', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY sequence) FROM public.approval_rules r WHERE admin), '[]'::jsonb)
    );
  END IF;

  RAISE EXCEPTION 'Unknown domain snapshot: %', p_domain;
END $$;

CREATE OR REPLACE FUNCTION public.nlcc_domain_snapshot(p_domain text DEFAULT 'all') RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.domain_snapshot(p_domain);
$$;

REVOKE ALL ON FUNCTION private.domain_snapshot(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.domain_snapshot(text) TO authenticated;
REVOKE ALL ON FUNCTION public.nlcc_domain_snapshot(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nlcc_domain_snapshot(text) TO authenticated;
