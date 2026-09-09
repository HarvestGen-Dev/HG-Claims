-- ============================================================================
-- NewLife Expense Claim Management System (NLCC) - Functions, Triggers & RLS
-- ============================================================================

-- Function 1: Atomically Generate Unique Claim Number
-- Format: {PREFIX}-{YEAR}-{6_DIGIT_RUNNING_NUMBER} (e.g. NLCC-2026-000001)
CREATE OR REPLACE FUNCTION public.generate_claim_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix TEXT;
    v_year TEXT;
    v_seq INT;
    v_formatted_num TEXT;
BEGIN
    -- Get configured prefix from system_settings or fallback
    SELECT COALESCE((value->>'prefix')::text, 'NLCC') INTO v_prefix
    FROM public.system_settings 
    WHERE key = 'claim_numbering';
    
    IF v_prefix IS NULL THEN
        v_prefix := 'NLCC';
    END IF;

    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_seq := nextval('public.claim_number_seq');
    v_formatted_num := v_prefix || '-' || v_year || '-' || LPAD(v_seq::text, 6, '0');

    RETURN v_formatted_num;
END;
$$;

-- Function 2: Recalculate Claim Total Amount from Expense Items
CREATE OR REPLACE FUNCTION public.recalculate_claim_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_claim_id UUID;
    v_sum NUMERIC(12, 2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_claim_id := OLD.claim_id;
    ELSE
        v_claim_id := NEW.claim_id;
    END IF;

    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_sum
    FROM public.claim_expenses
    WHERE claim_id = v_claim_id;

    UPDATE public.claims
    SET total_amount = v_sum,
        updated_at = NOW()
    WHERE id = v_claim_id;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_claim_total ON public.claim_expenses;
CREATE TRIGGER trg_recalculate_claim_total
AFTER INSERT OR UPDATE OR DELETE ON public.claim_expenses
FOR EACH ROW EXECUTE FUNCTION public.recalculate_claim_total();

-- Function 3: Instantiate Claim Workflow based on Configurable Approval Rules
CREATE OR REPLACE FUNCTION public.instantiate_claim_workflow(p_claim_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_claim RECORD;
    v_workflow_id UUID;
    v_ministry RECORD;
    v_threshold NUMERIC(12, 2) := 500.00;
    v_has_custom_rules BOOLEAN := FALSE;
    v_step_seq INT := 1;
    v_rule RECORD;
BEGIN
    SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim % not found', p_claim_id;
    END IF;

    SELECT * INTO v_ministry FROM public.ministries WHERE id = v_claim.ministry_id;

    -- Get threshold from settings if available
    SELECT COALESCE((value->>'final_approval_threshold')::numeric, 500.00) INTO v_threshold
    FROM public.system_settings 
    WHERE key = 'approval_thresholds';

    -- Create claim workflow header
    INSERT INTO public.claim_workflows (claim_id, is_current, version)
    VALUES (p_claim_id, TRUE, 1)
    RETURNING id INTO v_workflow_id;

    -- Check if custom approval rules exist for this ministry
    FOR v_rule IN 
        SELECT * FROM public.approval_rules 
        WHERE is_active = TRUE 
          AND (ministry_id IS NULL OR ministry_id = v_claim.ministry_id)
          AND (min_amount <= v_claim.total_amount)
          AND (max_amount IS NULL OR max_amount >= v_claim.total_amount)
        ORDER BY sequence ASC, priority DESC
    LOOP
        v_has_custom_rules := TRUE;

        INSERT INTO public.claim_workflow_steps (
            workflow_id,
            claim_id,
            sequence,
            step_name,
            approver_role,
            assigned_user_id,
            status,
            started_at
        ) VALUES (
            v_workflow_id,
            p_claim_id,
            v_step_seq,
            v_rule.name,
            v_rule.approver_role,
            CASE 
                WHEN v_rule.approver_role = 'MINISTRY_LEADER' THEN v_ministry.leader_id
                WHEN v_rule.approver_role = 'SPECIFIC_USER' THEN v_rule.approver_user_id
                ELSE NULL
            END,
            CASE WHEN v_step_seq = 1 THEN 'IN_PROGRESS' ELSE 'PENDING' END,
            CASE WHEN v_step_seq = 1 THEN NOW() ELSE NULL END
        );

        v_step_seq := v_step_seq + 1;
    END LOOP;

    -- Default fallback workflow if no specific rules match
    IF NOT v_has_custom_rules THEN
        -- Step 1: Ministry Leader Approval
        INSERT INTO public.claim_workflow_steps (
            workflow_id, claim_id, sequence, step_name, approver_role, assigned_user_id, status, started_at
        ) VALUES (
            v_workflow_id, p_claim_id, 1, 'Ministry Leader Approval', 'MINISTRY_LEADER', v_ministry.leader_id, 'IN_PROGRESS', NOW()
        );

        -- Step 2: Finance Review & Verification
        INSERT INTO public.claim_workflow_steps (
            workflow_id, claim_id, sequence, step_name, approver_role, assigned_user_id, status
        ) VALUES (
            v_workflow_id, p_claim_id, 2, 'Finance Review', 'FINANCE_OFFICER', NULL, 'PENDING'
        );

        -- Step 3: Final Approval (if total > threshold)
        IF v_claim.total_amount > v_threshold THEN
            INSERT INTO public.claim_workflow_steps (
                workflow_id, claim_id, sequence, step_name, approver_role, assigned_user_id, status
            ) VALUES (
                v_workflow_id, p_claim_id, 3, 'Final Approval', 'FINAL_APPROVER', NULL, 'PENDING'
            );
        END IF;
    END IF;

    RETURN v_workflow_id;
END;
$$;

-- Function 4: Helper to check if current user has a given role code
CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id AND (r.code = p_role_code OR r.code = 'SYSTEM_ADMIN')
    );
$$;

-- Function 5: Helper to check if user is system admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id AND r.code = 'SYSTEM_ADMIN'
    );
$$;

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Profiles viewable by authenticated users" ON public.profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles" ON public.profiles
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Master Data Read Policies (Ministries, Categories, Cost Centres, Roles)
CREATE POLICY "Ministries viewable by all authenticated" ON public.ministries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ministries manageable by admin" ON public.ministries FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Categories viewable by all authenticated" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Categories manageable by admin" ON public.expense_categories FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Cost centres viewable by all authenticated" ON public.cost_centres FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cost centres manageable by admin" ON public.cost_centres FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Roles viewable by all authenticated" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "User roles viewable by all authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "User roles manageable by admin" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Claims Policies (Strict RBAC)
CREATE POLICY "Claimants can view own claims" ON public.claims
    FOR SELECT TO authenticated
    USING (
        claimant_id = auth.uid()
        OR public.has_role(auth.uid(), 'FINANCE_OFFICER')
        OR public.has_role(auth.uid(), 'FINAL_APPROVER')
        OR public.has_role(auth.uid(), 'SYSTEM_ADMIN')
        OR EXISTS (
            SELECT 1 FROM public.ministries m 
            WHERE m.id = claims.ministry_id AND m.leader_id = auth.uid()
        )
    );

CREATE POLICY "Claimants can create draft claims" ON public.claims
    FOR INSERT TO authenticated
    WITH CHECK (claimant_id = auth.uid());

CREATE POLICY "Claimants can update own drafts or returned claims" ON public.claims
    FOR UPDATE TO authenticated
    USING (
        (claimant_id = auth.uid() AND status IN ('DRAFT', 'RETURNED_FOR_CLARIFICATION'))
        OR public.has_role(auth.uid(), 'FINANCE_OFFICER')
        OR public.has_role(auth.uid(), 'SYSTEM_ADMIN')
    );

CREATE POLICY "Claimants can delete own drafts" ON public.claims
    FOR DELETE TO authenticated
    USING (claimant_id = auth.uid() AND status = 'DRAFT');

-- Claim Expenses Policies
CREATE POLICY "Users can view expenses of viewable claims" ON public.claim_expenses
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.claims c 
            WHERE c.id = claim_expenses.claim_id 
              AND (
                  c.claimant_id = auth.uid()
                  OR public.has_role(auth.uid(), 'FINANCE_OFFICER')
                  OR public.has_role(auth.uid(), 'FINAL_APPROVER')
                  OR public.has_role(auth.uid(), 'SYSTEM_ADMIN')
                  OR EXISTS (SELECT 1 FROM public.ministries m WHERE m.id = c.ministry_id AND m.leader_id = auth.uid())
              )
        )
    );

CREATE POLICY "Claimants can manage expenses for own draft/returned claims" ON public.claim_expenses
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.claims c 
            WHERE c.id = claim_expenses.claim_id 
              AND c.claimant_id = auth.uid() 
              AND c.status IN ('DRAFT', 'RETURNED_FOR_CLARIFICATION')
        )
    );

-- Claim Attachments Policies
CREATE POLICY "Users can view attachments of viewable claims" ON public.claim_attachments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.claims c 
            WHERE c.id = claim_attachments.claim_id 
              AND (
                  c.claimant_id = auth.uid()
                  OR public.has_role(auth.uid(), 'FINANCE_OFFICER')
                  OR public.has_role(auth.uid(), 'FINAL_APPROVER')
                  OR public.has_role(auth.uid(), 'SYSTEM_ADMIN')
                  OR EXISTS (SELECT 1 FROM public.ministries m WHERE m.id = c.ministry_id AND m.leader_id = auth.uid())
              )
        )
    );

CREATE POLICY "Claimants can insert attachments to own claims" ON public.claim_attachments
    FOR INSERT TO authenticated
    WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Claimants can delete attachments from drafts" ON public.claim_attachments
    FOR DELETE TO authenticated
    USING (
        uploaded_by = auth.uid() 
        AND EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_attachments.claim_id AND c.status IN ('DRAFT', 'RETURNED_FOR_CLARIFICATION'))
    );

-- Notifications Policy
CREATE POLICY "Users can view their own notifications" ON public.notifications
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON public.notifications
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Audit Logs Policy
CREATE POLICY "Audit logs viewable by Finance and Admins" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'FINANCE_OFFICER') OR public.is_admin(auth.uid()));

CREATE POLICY "Audit logs insertable by authenticated users" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);
