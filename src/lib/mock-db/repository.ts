import { canUserViewClaim } from "@/lib/auth/permissions";
import {
  Claim,
  ClaimExpense,
  ClaimAttachment,
  ClaimWorkflow,
  ClaimWorkflowStep,
  ApprovalAction,
  Profile,
  Ministry,
  ExpenseCategory,
  CostCentre,
  ApprovalRule,
  Notification,
  AuditLog,
  SystemSetting,
  Payment,
  FinanceReview,
  ClaimStatus,
  RoleCode,
  SignupInvitation,
  ReimbursementBatch,
  ReimbursementBatchInstruction,
  ReimbursementInstructionClaim
} from "@/lib/types/database";
import { resolveCanonicalBank } from "@/lib/constants/banks";
import {
  centsToMyrNumber,
  formatPaymentDescription,
  previewReimbursementSelection,
  toExactCents,
} from "@/lib/banking/reimbursement-preview";
import {
  INITIAL_PROFILES,
  INITIAL_MINISTRIES,
  INITIAL_CATEGORIES,
  INITIAL_COST_CENTRES,
  INITIAL_APPROVAL_RULES,
  INITIAL_CLAIMS,
  INITIAL_NOTIFICATIONS,
  INITIAL_SYSTEM_SETTINGS,
  INITIAL_SIGNUP_INVITATIONS
} from "./seed-data";
import { calculateTotalAmount } from "@/lib/utils/calculations";
import { formatClaimNumber } from "@/lib/utils/claim-number";
import { generateSecureToken, hashToken } from "@/lib/utils/token";

class DatabaseRepository {
  private profiles: Profile[] = [];
  private ministries: Ministry[] = [];
  private categories: ExpenseCategory[] = [];
  private costCentres: CostCentre[] = [];
  private approvalRules: ApprovalRule[] = [];
  private claims: Claim[] = [];
  private notifications: Notification[] = [];
  private systemSettings: SystemSetting[] = [];
  private auditLogs: AuditLog[] = [];
  private signupInvitations: SignupInvitation[] = [];
  private reimbursementBatches: ReimbursementBatch[] = [];
  private paymentDescriptionSeqByYear: Record<number, number> = {};
  private runningSequence: number = 125;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (this.isInitialized) return;
    this.profiles = JSON.parse(JSON.stringify(INITIAL_PROFILES));
    this.ministries = JSON.parse(JSON.stringify(INITIAL_MINISTRIES));
    this.categories = JSON.parse(JSON.stringify(INITIAL_CATEGORIES));
    this.costCentres = JSON.parse(JSON.stringify(INITIAL_COST_CENTRES));
    this.approvalRules = JSON.parse(JSON.stringify(INITIAL_APPROVAL_RULES));
    this.claims = JSON.parse(JSON.stringify(INITIAL_CLAIMS));
    this.notifications = JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS));
    this.systemSettings = JSON.parse(JSON.stringify(INITIAL_SYSTEM_SETTINGS));
    this.signupInvitations = JSON.parse(JSON.stringify(INITIAL_SIGNUP_INVITATIONS || []));
    this.reimbursementBatches = [];
    this.paymentDescriptionSeqByYear = {};
    this.auditLogs = [];
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("nlcc_workspace_v1");
      if (stored) {
        try {
          const data = JSON.parse(stored);
          const collections = ["profiles", "ministries", "categories", "costCentres", "approvalRules", "claims", "notifications", "systemSettings", "auditLogs"];
          if (data.version === 1 && collections.every(key => Array.isArray(data[key])) && Number.isInteger(data.runningSequence)) {
            this.profiles = data.profiles;
            this.ministries = data.ministries;
            this.categories = data.categories;
            this.costCentres = data.costCentres;
            this.approvalRules = data.approvalRules;
            this.claims = data.claims;
            this.notifications = data.notifications;
            this.systemSettings = data.systemSettings;
            this.auditLogs = data.auditLogs;
            if (Array.isArray(data.signupInvitations)) {
              this.signupInvitations = data.signupInvitations;
            }
            this.runningSequence = data.runningSequence;
          }
        } catch { console.warn("Saved demo data could not be read."); }
      }
    }
    this.isInitialized = true;
  }

  private persist() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("nlcc_workspace_v1", JSON.stringify({
      version: 1,
      profiles: this.profiles, ministries: this.ministries, categories: this.categories,
      costCentres: this.costCentres, approvalRules: this.approvalRules, claims: this.claims,
      notifications: this.notifications, systemSettings: this.systemSettings,
      auditLogs: this.auditLogs, signupInvitations: this.signupInvitations, runningSequence: this.runningSequence,
    }));
  }

  // --- Profiles & Auth ---
  public getProfiles(): Profile[] {
    return this.profiles;
  }

  public getProfileById(id?: string | null): Profile | undefined {
    if (!id) return undefined;
    return this.profiles.find(p => p.id === id);
  }

  public getProfileByEmail(email: string): Profile | undefined {
    return this.profiles.find(p => p.email.toLowerCase() === email.toLowerCase());
  }

  public updateProfile(id: string, updates: Partial<Profile>): Profile {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Profile ${id} not found`);
    this.profiles[idx] = { ...this.profiles[idx], ...updates, updated_at: new Date().toISOString() };
    this.persist();
    return this.profiles[idx];
  }

  // --- Master Data CRUD ---
  public getMinistries(): Ministry[] {
    return this.ministries.map(m => ({
      ...m,
      leader: this.getProfileById(m.leader_id || "")
    }));
  }

  public createMinistry(data: Partial<Ministry>): Ministry {
    const now = new Date().toISOString();
    const newMinistry: Ministry = {
      id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      code: (data.code || "MIN").toUpperCase(),
      name: data.name || "New Ministry",
      description: data.description || "",
      leader_id: data.leader_id || null,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: now,
      updated_at: now,
    };
    this.ministries.push(newMinistry);
    this.logAudit({
      action: "CREATE_MINISTRY",
      entity_type: "MINISTRY",
      entity_id: newMinistry.id,
      after_data: newMinistry,
    });
    return { ...newMinistry, leader: this.getProfileById(newMinistry.leader_id || "") };
  }

  public updateMinistry(id: string, updates: Partial<Ministry>): Ministry {
    const idx = this.ministries.findIndex(m => m.id === id);
    if (idx === -1) throw new Error(`Ministry ${id} not found`);
    const beforeData = { ...this.ministries[idx] };
    this.ministries[idx] = {
      ...this.ministries[idx],
      ...updates,
      code: updates.code ? updates.code.toUpperCase() : this.ministries[idx].code,
      updated_at: new Date().toISOString(),
    };
    this.logAudit({
      action: "UPDATE_MINISTRY",
      entity_type: "MINISTRY",
      entity_id: id,
      before_data: beforeData,
      after_data: this.ministries[idx],
    });
    return { ...this.ministries[idx], leader: this.getProfileById(this.ministries[idx].leader_id || "") };
  }

  public deleteMinistry(id: string): boolean {
    const idx = this.ministries.findIndex(m => m.id === id);
    if (idx === -1) return false;
    const removed = this.ministries.splice(idx, 1)[0];
    this.persist();
    this.logAudit({
      action: "DELETE_MINISTRY",
      entity_type: "MINISTRY",
      entity_id: id,
      before_data: removed,
    });
    return true;
  }

  // --- Expense Categories CRUD ---
  public getCategories(): ExpenseCategory[] {
    return [...this.categories].sort((a, b) => a.display_order - b.display_order);
  }

  public createCategory(data: Partial<ExpenseCategory>): ExpenseCategory {
    const now = new Date().toISOString();
    const newCategory: ExpenseCategory = {
      id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      code: (data.code || "CAT").toUpperCase(),
      name: data.name || "New Category",
      description: data.description || "",
      display_order: data.display_order || this.categories.length + 1,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: now,
      updated_at: now,
    };
    this.categories.push(newCategory);
    this.logAudit({
      action: "CREATE_CATEGORY",
      entity_type: "CATEGORY",
      entity_id: newCategory.id,
      after_data: newCategory,
    });
    return newCategory;
  }

  public updateCategory(id: string, updates: Partial<ExpenseCategory>): ExpenseCategory {
    const idx = this.categories.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Category ${id} not found`);
    const beforeData = { ...this.categories[idx] };
    this.categories[idx] = {
      ...this.categories[idx],
      ...updates,
      code: updates.code ? updates.code.toUpperCase() : this.categories[idx].code,
      updated_at: new Date().toISOString(),
    };
    this.logAudit({
      action: "UPDATE_CATEGORY",
      entity_type: "CATEGORY",
      entity_id: id,
      before_data: beforeData,
      after_data: this.categories[idx],
    });
    return this.categories[idx];
  }

  public deleteCategory(id: string): boolean {
    const idx = this.categories.findIndex(c => c.id === id);
    if (idx === -1) return false;
    const removed = this.categories.splice(idx, 1)[0];
    this.persist();
    this.logAudit({
      action: "DELETE_CATEGORY",
      entity_type: "CATEGORY",
      entity_id: id,
      before_data: removed,
    });
    return true;
  }

  // --- Cost Centres CRUD ---
  public getCostCentres(): CostCentre[] {
    return [...this.costCentres]
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map(cc => ({
        ...cc,
        ministry: this.ministries.find(m => m.id === cc.ministry_id)
      }));
  }

  public createCostCentre(data: Partial<CostCentre>): CostCentre {
    const now = new Date().toISOString();
    const newCC: CostCentre = {
      id: `cc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      code: (data.code || "CC").toUpperCase(),
      name: data.name || "New Cost Centre",
      ministry_id: data.ministry_id || null,
      description: data.description || "",
      display_order: data.display_order || this.costCentres.length + 1,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: now,
      updated_at: now,
    };
    this.costCentres.push(newCC);
    this.logAudit({
      action: "CREATE_COST_CENTRE",
      entity_type: "COST_CENTRE",
      entity_id: newCC.id,
      after_data: newCC,
    });
    return { ...newCC, ministry: this.ministries.find(m => m.id === newCC.ministry_id) };
  }

  public updateCostCentre(id: string, updates: Partial<CostCentre>): CostCentre {
    const idx = this.costCentres.findIndex(cc => cc.id === id);
    if (idx === -1) throw new Error(`Cost Centre ${id} not found`);
    const beforeData = { ...this.costCentres[idx] };
    this.costCentres[idx] = {
      ...this.costCentres[idx],
      ...updates,
      code: updates.code ? updates.code.toUpperCase() : this.costCentres[idx].code,
      updated_at: new Date().toISOString(),
    };
    this.logAudit({
      action: "UPDATE_COST_CENTRE",
      entity_type: "COST_CENTRE",
      entity_id: id,
      before_data: beforeData,
      after_data: this.costCentres[idx],
    });
    return { ...this.costCentres[idx], ministry: this.ministries.find(m => m.id === this.costCentres[idx].ministry_id) };
  }

  public deleteCostCentre(id: string): boolean {
    const idx = this.costCentres.findIndex(cc => cc.id === id);
    if (idx === -1) return false;
    const removed = this.costCentres.splice(idx, 1)[0];
    this.persist();
    this.logAudit({
      action: "DELETE_COST_CENTRE",
      entity_type: "COST_CENTRE",
      entity_id: id,
      before_data: removed,
    });
    return true;
  }

  // --- Approval Rules CRUD ---
  public getApprovalRules(): ApprovalRule[] {
    return this.approvalRules.map(r => ({
      ...r,
      ministry: r.ministry_id ? this.ministries.find(m => m.id === r.ministry_id) : undefined,
      expense_category: r.expense_category_id ? this.categories.find(c => c.id === r.expense_category_id) : undefined,
      approver_user: r.approver_user_id ? this.getProfileById(r.approver_user_id) : undefined,
    })).sort((a, b) => a.sequence - b.sequence);
  }

  public createApprovalRule(data: Partial<ApprovalRule>): ApprovalRule {
    const now = new Date().toISOString();
    const newRule: ApprovalRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: data.name || "New Workflow Rule",
      description: data.description || "",
      ministry_id: data.ministry_id || null,
      expense_category_id: data.expense_category_id || null,
      min_amount: data.min_amount || 0,
      max_amount: data.max_amount || null,
      sequence: data.sequence || this.approvalRules.length + 1,
      approver_role: data.approver_role || "MINISTRY_LEADER",
      approver_user_id: data.approver_user_id || null,
      is_active: data.is_active !== undefined ? data.is_active : true,
      priority: data.priority || 10,
      created_at: now,
      updated_at: now,
    };
    this.approvalRules.push(newRule);
    this.logAudit({
      action: "CREATE_APPROVAL_RULE",
      entity_type: "APPROVAL_RULE",
      entity_id: newRule.id,
      after_data: newRule,
    });
    return newRule;
  }

  public updateApprovalRule(id: string, updates: Partial<ApprovalRule>): ApprovalRule {
    const idx = this.approvalRules.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Approval Rule ${id} not found`);
    const beforeData = { ...this.approvalRules[idx] };
    this.approvalRules[idx] = {
      ...this.approvalRules[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.logAudit({
      action: "UPDATE_APPROVAL_RULE",
      entity_type: "APPROVAL_RULE",
      entity_id: id,
      before_data: beforeData,
      after_data: this.approvalRules[idx],
    });
    return this.approvalRules[idx];
  }

  public deleteApprovalRule(id: string): boolean {
    const idx = this.approvalRules.findIndex(r => r.id === id);
    if (idx === -1) return false;
    const removed = this.approvalRules.splice(idx, 1)[0];
    this.logAudit({
      action: "DELETE_APPROVAL_RULE",
      entity_type: "APPROVAL_RULE",
      entity_id: id,
      before_data: removed,
    });
    return true;
  }

  // --- Settings & Form Config ---
  public getSystemSettings(): SystemSetting[] {
    return this.systemSettings;
  }

  public getSetting(key: string): any {
    const setting = this.systemSettings.find(s => s.key === key);
    return setting?.value;
  }

  public updateSetting(key: string, value: Record<string, any>, updatedBy?: string): SystemSetting {
    const idx = this.systemSettings.findIndex(s => s.key === key);
    const now = new Date().toISOString();
    let beforeData = null;
    if (idx >= 0) {
      beforeData = { ...this.systemSettings[idx] };
      this.systemSettings[idx] = { ...this.systemSettings[idx], value, updated_by: updatedBy, updated_at: now };
      this.logAudit({
        actor_id: updatedBy,
        action: `UPDATE_SETTING_${key.toUpperCase()}`,
        entity_type: "SYSTEM_SETTING",
        entity_id: key,
        before_data: beforeData?.value,
        after_data: value,
      });
      return this.systemSettings[idx];
    } else {
      const newSetting: SystemSetting = {
        id: `sett-${Date.now()}`,
        key,
        value,
        updated_by: updatedBy,
        updated_at: now,
      };
      this.systemSettings.push(newSetting);
      this.logAudit({
        actor_id: updatedBy,
        action: `CREATE_SETTING_${key.toUpperCase()}`,
        entity_type: "SYSTEM_SETTING",
        entity_id: key,
        after_data: value,
      });
      return newSetting;
    }
  }

  // --- Claims Access with Relations ---
  private enrichClaim(claim: Claim): Claim {
    const claimant = this.getProfileById(claim.claimant_id);
    const submitted_by = this.getProfileById(claim.submitted_by_user_id || claim.claimant_id);
    const ministry = this.ministries.find(m => m.id === claim.ministry_id);
    const cost_centre = claim.cost_centre_id ? this.costCentres.find(cc => cc.id === claim.cost_centre_id) : undefined;
    const returned_by_user = claim.returned_by ? this.getProfileById(claim.returned_by) : undefined;

    const expenses = (claim.expenses || []).map(exp => ({
      ...exp,
      expense_category: this.categories.find(c => c.id === exp.expense_category_id),
      cost_centre: exp.cost_centre_id ? this.costCentres.find(cc => cc.id === exp.cost_centre_id) : undefined,
      attachments: (claim.attachments || []).filter(a => a.expense_id === exp.id),
    }));

    const workflow_steps = (claim.workflow_steps || []).map(step => ({
      ...step,
      assigned_user: step.assigned_user_id ? this.getProfileById(step.assigned_user_id) : undefined,
      completed_by_user: step.completed_by ? this.getProfileById(step.completed_by) : undefined,
    }));

    const approval_actions = (claim.approval_actions || []).map(act => ({
      ...act,
      actor: this.getProfileById(act.actor_id),
    }));

    return {
      ...claim,
      claimant,
      submitted_by,
      claimant_name: claim.claimant_name || claimant?.full_name || "Unknown Claimant",
      claimant_email: claim.claimant_email || claimant?.email || "",
      claimant_phone: claim.claimant_phone || claimant?.phone || "",
      ministry: ministry ? { ...ministry, leader: this.getProfileById(ministry.leader_id || "") } : undefined,
      cost_centre,
      returned_by_user,
      expenses,
      workflow_steps,
      approval_actions,
    };
  }

  public getClaims(currentUser?: Profile, filters?: {
    status?: ClaimStatus;
    ministry_id?: string;
    claimant_id?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Claim[] {
    let result = this.claims.map(c => this.enrichClaim(c));

    if (currentUser) {
      result = result.filter(claim => canUserViewClaim(currentUser, claim));
    }

    if (filters) {
      if (filters.status) {
        result = result.filter(c => c.status === filters.status);
      }
      if (filters.ministry_id) {
        result = result.filter(c => c.ministry_id === filters.ministry_id);
      }
      if (filters.claimant_id) {
        result = result.filter(c => (c.submitted_by_user_id === filters.claimant_id || c.claimant_id === filters.claimant_id));
      }
      if (filters.startDate) {
        result = result.filter(c => c.claim_date >= filters.startDate!);
      }
      if (filters.endDate) {
        result = result.filter(c => c.claim_date <= filters.endDate!);
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(c =>
          (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
          c.purpose.toLowerCase().includes(q) ||
          (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
          (c.claimant_email && c.claimant_email.toLowerCase().includes(q)) ||
          c.claimant?.full_name.toLowerCase().includes(q) ||
          c.claimant?.email.toLowerCase().includes(q) ||
          c.submitted_by?.full_name.toLowerCase().includes(q) ||
          c.ministry?.name.toLowerCase().includes(q) ||
          (c.internal_reference && c.internal_reference.toLowerCase().includes(q)) ||
          (c.payment?.payment_reference && c.payment.payment_reference.toLowerCase().includes(q))
        );
      }
    }

    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getClaimById(id: string): Claim | null {
    const claim = this.claims.find(c => c.id === id);
    if (!claim) return null;
    return this.enrichClaim(claim);
  }

  // --- Dynamic Claim Number Generation ---
  private nextClaimNumber(): string {
    const numConfig = this.getSetting("claim_numbering") || { prefix: "NLCC" };
    const prefix = numConfig.prefix || "NLCC";
    const year = new Date().getFullYear();
    const seq = ++this.runningSequence;
    return formatClaimNumber(prefix, year, seq);
  }

  // --- Workflow Engine Logic ---
  private buildWorkflowSteps(claim: Claim): ClaimWorkflowStep[] {
    const steps: ClaimWorkflowStep[] = [];
    const workflowId = `wf-${Date.now()}`;
    const now = new Date().toISOString();

    const submitterId = claim.submitted_by_user_id || claim.claimant_id;
    const financeUser = this.profiles.find(p => p.roles?.includes("FINANCE_OFFICER") && p.id !== submitterId && p.status === "ACTIVE");

    // Single Step: Finance Review
    steps.push({
      id: `ws-${Date.now()}-1`,
      workflow_id: workflowId,
      claim_id: claim.id,
      sequence: 1,
      step_name: "Finance Review",
      approver_role: "FINANCE_OFFICER",
      assigned_user_id: financeUser?.id || null,
      status: "IN_PROGRESS",
      started_at: now,
      created_at: now,
      updated_at: now,
    });

    return steps;
  }

  // --- Create or Save Draft Claim ---
  public saveClaimDraft(params: {
    id?: string;
    submitted_by_user_id?: string;
    claimant_id?: string;
    payee_profile_id?: string;
    claimant_name: string;
    claimant_email: string;
    claimant_phone: string;
    bank_name?: string;
    bank_code?: string;
    bank_account_holder_name?: string;
    bank_account_number?: string;
    ministry_id: string;
    claim_date: string;
    purpose: string;
    internal_reference?: string;
    expenses: Array<Omit<ClaimExpense, "id" | "claim_id" | "created_at" | "updated_at">>;
    attachments?: Array<Omit<ClaimAttachment, "id" | "claim_id" | "created_at">>;
    programme_event?: string;
    cost_centre_id?: string;
    payment_method?: any;
  }): Claim {
    const total_amount = calculateTotalAmount(params.expenses);
    const now = new Date().toISOString();
    const submitterId = params.submitted_by_user_id || params.claimant_id || "u-sarah-02";
    const linkedProfile = this.getProfileById(params.claimant_id || submitterId);
    const resolvedBank = resolveCanonicalBank(
      params.bank_code ||
        params.bank_name ||
        linkedProfile?.bank_code ||
        linkedProfile?.bank_name
    );

    if (params.id) {
      const idx = this.claims.findIndex(c => c.id === params.id);
      if (idx >= 0) {
        const existing = this.claims[idx];
        const updatedExpenses: ClaimExpense[] = params.expenses.map((exp, i) => ({
          ...exp,
          id: (exp as any).id || `exp-${Date.now()}-${i}`,
          claim_id: existing.id,
          sort_order: i + 1,
          created_at: (exp as any).created_at || now,
          updated_at: now,
        }));

        this.claims[idx] = {
          ...existing,
          submitted_by_user_id: submitterId,
          claimant_id: params.claimant_id || existing.claimant_id || submitterId,
          claimant_name: params.claimant_name || linkedProfile?.full_name || existing.claimant_name,
          claimant_email: params.claimant_email || linkedProfile?.email || existing.claimant_email,
          claimant_phone: params.claimant_phone || linkedProfile?.phone || existing.claimant_phone,
          bank_name: params.bank_name || resolvedBank?.name || linkedProfile?.bank_name || existing.bank_name,
          bank_code: resolvedBank?.swiftCode || params.bank_code || linkedProfile?.bank_code || existing.bank_code,
          bank_account_holder_name: params.bank_account_holder_name || linkedProfile?.bank_account_holder_name || existing.bank_account_holder_name || params.claimant_name,
          bank_account_number: params.bank_account_number || linkedProfile?.bank_account_number || existing.bank_account_number,
          ministry_id: params.ministry_id,
          claim_date: params.claim_date,
          purpose: params.purpose,
          internal_reference: params.internal_reference,
          total_amount,
          expenses: updatedExpenses,
          attachments: (params.attachments || []).map((attachment, index) => ({
            ...attachment,
            id: (attachment as ClaimAttachment).id || `att-${Date.now()}-${index}`,
            claim_id: existing.id,
            created_at: (attachment as any).created_at || now,
          })),
          updated_at: now,
        };
        this.persist();
        return this.enrichClaim(this.claims[idx]);
      }
    }

    const claimId = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const claimExpenses: ClaimExpense[] = params.expenses.map((exp, i) => ({
      ...exp,
      id: `exp-${Date.now()}-${i}`,
      claim_id: claimId,
      sort_order: i + 1,
      created_at: now,
      updated_at: now,
    }));

    const claimAttachments: ClaimAttachment[] = (params.attachments || []).map((att, i) => ({
      ...att,
      id: `att-${Date.now()}-${i}`,
      claim_id: claimId,
      created_at: now,
    }));

    const newClaim: Claim = {
      id: claimId,
      claim_number: null,
      submitted_by_user_id: submitterId,
      claimant_id: params.claimant_id || submitterId,
      claimant_name: params.claimant_name || linkedProfile?.full_name || "",
      claimant_email: params.claimant_email || linkedProfile?.email || "",
      claimant_phone: params.claimant_phone || linkedProfile?.phone || "",
      bank_name: params.bank_name || resolvedBank?.name || linkedProfile?.bank_name,
      bank_code: resolvedBank?.swiftCode || params.bank_code || linkedProfile?.bank_code,
      bank_account_holder_name: params.bank_account_holder_name || linkedProfile?.bank_account_holder_name || params.claimant_name || linkedProfile?.full_name,
      bank_account_number: params.bank_account_number || linkedProfile?.bank_account_number,
      ministry_id: params.ministry_id,
      claim_date: params.claim_date,
      purpose: params.purpose,
      internal_reference: params.internal_reference,
      total_amount,
      currency: "MYR",
      status: "DRAFT",
      declaration_accepted: false,
      expenses: claimExpenses,
      attachments: claimAttachments,
      workflow_steps: [],
      approval_actions: [],
      created_at: now,
      updated_at: now,
    };

    this.claims.unshift(newClaim);
    this.persist();
    return this.enrichClaim(newClaim);
  }

  // --- Submit Claim for Approval ---
  public submitClaim(params: {
    id?: string;
    submitted_by_user_id?: string;
    claimant_id?: string;
    payee_profile_id?: string;
    claimant_name: string;
    claimant_email: string;
    claimant_phone: string;
    bank_name?: string;
    bank_code?: string;
    bank_account_holder_name?: string;
    bank_account_number?: string;
    ministry_id: string;
    claim_date: string;
    purpose: string;
    internal_reference?: string;
    declaration_accepted: boolean;
    expenses: Array<Omit<ClaimExpense, "id" | "claim_id" | "created_at" | "updated_at">>;
    attachments?: Array<Omit<ClaimAttachment, "id" | "claim_id" | "created_at">>;
    programme_event?: string;
    cost_centre_id?: string;
    payment_method?: any;
  }): Claim {
    if (!params.declaration_accepted) {
      throw new Error("Declaration must be accepted prior to submission");
    }
    if (!params.expenses || params.expenses.length === 0) {
      throw new Error("At least one expense line is required");
    }

    const formConfig = this.getSetting("claim_form_config");
    if (formConfig?.require_receipt_for_all_expenses) {
      const attachments = params.attachments || [];
      params.expenses.forEach((exp, idx) => {
        const expId = (exp as any).id;
        const tempId = (exp as any).temp_id;
        const hasAtt = attachments.some(a => (expId && a.expense_id === expId) || (tempId && (a as any).expense_id === tempId));
        if (!hasAtt && (!attachments[idx] || attachments.length < params.expenses.length)) {
          // throw validation error if any receipt lacks attachment
          throw new Error(`Receipt #${idx + 1}: Please upload the supporting receipt`);
        }
      });
    }

    const total_amount = calculateTotalAmount(params.expenses);
    if (total_amount <= 0) {
      throw new Error("Claim total must be greater than RM 0.00");
    }

    const now = new Date().toISOString();
    const submitterId = params.submitted_by_user_id || params.claimant_id || "u-sarah-02";
    let claim: Claim;

    if (params.id) {
      const idx = this.claims.findIndex(c => c.id === params.id);
      if (idx >= 0) {
        claim = this.claims[idx];
      } else {
        throw new Error("Claim draft not found");
      }
    } else {
      const draft = this.saveClaimDraft(params);
      claim = this.claims.find(c => c.id === draft.id)!;
    }

    // Allocate official claim number if none exists yet
    if (!claim.claim_number) {
      claim.claim_number = this.nextClaimNumber();
    }

    const claimExpenses: ClaimExpense[] = params.expenses.map((exp, i) => ({
      ...exp,
      id: (exp as any).id || `exp-${Date.now()}-${i}`,
      claim_id: claim.id,
      sort_order: i + 1,
      created_at: (exp as any).created_at || now,
      updated_at: now,
    }));

    // Re-map attachments to persisted expense IDs
    const claimAttachments: ClaimAttachment[] = (params.attachments || []).map((att, i) => {
      let expense_id = att.expense_id;
      // Match by expense index if temp_id matched or if expense_id is not already an exp-*
      if (!expense_id || !claimExpenses.some(e => e.id === expense_id)) {
        if (claimExpenses[i]) {
          expense_id = claimExpenses[i].id;
        }
      }
      return {
        ...att,
        id: (att as any).id || `att-${Date.now()}-${i}`,
        claim_id: claim.id,
        expense_id: expense_id || null,
        created_at: (att as any).created_at || now,
      };
    });

    const linkedProfile = this.getProfileById(params.claimant_id || submitterId);
    const resolvedBank = resolveCanonicalBank(
      params.bank_code ||
        params.bank_name ||
        claim.bank_code ||
        claim.bank_name ||
        linkedProfile?.bank_code ||
        linkedProfile?.bank_name
    );
    claim.submitted_by_user_id = submitterId;
    claim.claimant_id = params.claimant_id || submitterId;
    claim.claimant_name = params.claimant_name || linkedProfile?.full_name || claim.claimant_name;
    claim.claimant_email = params.claimant_email || linkedProfile?.email || claim.claimant_email;
    claim.claimant_phone = params.claimant_phone || linkedProfile?.phone || claim.claimant_phone;
    claim.bank_name = params.bank_name || resolvedBank?.name || linkedProfile?.bank_name || claim.bank_name;
    claim.bank_code = resolvedBank?.swiftCode || params.bank_code || linkedProfile?.bank_code || claim.bank_code;
    claim.bank_account_holder_name = params.bank_account_holder_name || linkedProfile?.bank_account_holder_name || claim.bank_account_holder_name || claim.claimant_name;
    claim.bank_account_number = params.bank_account_number || linkedProfile?.bank_account_number || claim.bank_account_number;
    claim.ministry_id = params.ministry_id;
    claim.claim_date = params.claim_date;
    claim.purpose = params.purpose;
    claim.internal_reference = params.internal_reference;
    claim.total_amount = total_amount;
    claim.declaration_accepted = true;
    claim.declaration_timestamp = now;
    claim.submitted_at = now;
    claim.status = "PENDING_FINANCE_REVIEW";
    claim.expenses = claimExpenses;
    claim.attachments = claimAttachments;
    claim.current_step_sequence = 1;

    // Instantiate workflow steps snapshot (Single Finance Review step)
    claim.workflow_steps = this.buildWorkflowSteps(claim);

    // Record submission action
    const submitterProfile = this.getProfileById(submitterId);
    const submitAction: ApprovalAction = {
      id: `act-${Date.now()}`,
      claim_id: claim.id,
      actor_id: submitterId,
      actor_role: submitterProfile?.roles?.[0] || "CLAIMANT",
      action: "SUBMIT",
      comment: `Claim submitted for ${claim.claimant_name} (Total: RM ${total_amount.toFixed(2)})`,
      previous_status: "DRAFT",
      new_status: "PENDING_FINANCE_REVIEW",
      created_at: now,
    };
    claim.approval_actions = [submitAction, ...(claim.approval_actions || [])];

    // Dispatch notification to Finance
    this.notifyFinance({
      claim_id: claim.id,
      type: "CLAIM_SUBMITTED",
      title: "New Claim Awaiting Finance Review",
      message: `${submitterProfile?.full_name || "A claimant"} submitted ${claim.claim_number} (RM ${total_amount.toFixed(2)}) for ${claim.claimant_name}.`,
      link: `/finance/claims/${claim.id}`,
    });

    this.logAudit({
      actor_id: submitterId,
      action: "CLAIM_SUBMITTED",
      entity_type: "CLAIM",
      entity_id: claim.id,
      after_data: { claim_number: claim.claim_number, claimant_name: claim.claimant_name, total_amount, status: claim.status },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Approve Workflow Step (Finance Review) ---
  public approveStep(claimId: string, actor: Profile, comment?: string): Claim {
    const claim = this.claims.find(c => c.id === claimId);
    if (!claim) throw new Error("Claim not found");

    // Prevent Submitter or Claimant from Approving their own submitted claim! (Cross-role self-review protection)
    if (claim.submitted_by_user_id === actor.id || claim.claimant_id === actor.id) {
      throw new Error("Security Violation: You cannot approve a claim that you submitted.");
    }

    const steps = claim.workflow_steps || [];
    const currentStepIdx = steps.findIndex(s => s.status === "IN_PROGRESS");
    if (currentStepIdx === -1) {
      throw new Error("No active approval step found for this claim.");
    }

    const currentStep = steps[currentStepIdx];
    const now = new Date().toISOString();
    const prevStatus = claim.status;

    // Concurrency double-approval protection
    if (currentStep.status === "COMPLETED") {
      throw new Error("This workflow step has already been completed.");
    }

    // Mark current step completed
    currentStep.status = "COMPLETED";
    currentStep.completed_at = now;
    currentStep.completed_by = actor.id;
    currentStep.action_taken = "APPROVE";
    currentStep.comments = comment || "Approved by Finance";

    // Finance Review completed -> Approved for Payment
    const nextStatus: ClaimStatus = "APPROVED_FOR_PAYMENT";
    claim.current_step_sequence = null;
    claim.status = nextStatus;
    claim.reimbursement_status = "ELIGIBLE";
    const resolvedBank = resolveCanonicalBank(claim.bank_code || claim.bank_name);
    claim.approved_snapshot = {
      beneficiary_user_id: claim.claimant_id || claim.submitted_by_user_id || "",
      bank_account_holder_name: (claim.bank_account_holder_name || claim.claimant_name || "").trim(),
      bank_name: resolvedBank?.name || claim.bank_name || "",
      bank_code: resolvedBank?.swiftCode || claim.bank_code || "",
      bank_account_number: (claim.bank_account_number || "").trim(),
      approved_amount: Number(claim.total_amount),
      approved_amount_cents: toExactCents(claim.total_amount),
      currency: claim.currency || "MYR",
      approved_by: actor.id,
      approved_at: now,
    };
    claim.updated_at = now;

    // Record immutable approval action
    const approvalAction: ApprovalAction = {
      id: `act-${Date.now()}`,
      claim_id: claim.id,
      workflow_step_id: currentStep.id,
      actor_id: actor.id,
      actor_role: actor.roles?.[0] || "FINANCE_OFFICER",
      action: "APPROVE",
      comment: comment || null,
      previous_status: prevStatus,
      new_status: nextStatus,
      created_at: now,
    };
    claim.approval_actions = [approvalAction, ...(claim.approval_actions || [])];

    // Notify submitter of step approval
    const submitterId = claim.submitted_by_user_id || claim.claimant_id;
    if (submitterId) {
      this.createNotification({
        user_id: submitterId,
        claim_id: claim.id,
        type: "CLAIM_APPROVED_FOR_PAYMENT",
        title: "Claim Approved for Payment",
        message: `${actor.full_name} approved claim ${claim.claim_number} for ${claim.claimant_name}. Current status: Approved For Payment.`,
        link: `/claims/${claim.id}`,
      });
    }

    this.logAudit({
      actor_id: actor.id,
      action: "STEP_APPROVED",
      entity_type: "CLAIM",
      entity_id: claim.id,
      before_data: { status: prevStatus, step: currentStep.step_name },
      after_data: { status: nextStatus, comment },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Return for Clarification ---
  public returnForClarification(claimId: string, actor: Profile, reason: string): Claim {
    if (!reason || reason.trim().length < 3) {
      throw new Error("A clear reason for clarification is required.");
    }

    const claim = this.claims.find(c => c.id === claimId);
    if (!claim) throw new Error("Claim not found");

    const now = new Date().toISOString();
    const prevStatus = claim.status;

    claim.status = "RETURNED_FOR_CLARIFICATION";
    claim.clarification_reason = reason;
    claim.returned_by = actor.id;
    claim.returned_at = now;
    claim.updated_at = now;

    // Mark current step as returned
    const steps = claim.workflow_steps || [];
    const currentStep = steps.find(s => s.status === "IN_PROGRESS");
    if (currentStep) {
      currentStep.status = "RETURNED";
      currentStep.comments = reason;
      currentStep.updated_at = now;
    }

    const action: ApprovalAction = {
      id: `act-${Date.now()}`,
      claim_id: claim.id,
      workflow_step_id: currentStep?.id,
      actor_id: actor.id,
      actor_role: actor.roles?.[0] || "FINANCE_OFFICER",
      action: "RETURN_FOR_CLARIFICATION",
      comment: reason,
      previous_status: prevStatus,
      new_status: "RETURNED_FOR_CLARIFICATION",
      created_at: now,
    };
    claim.approval_actions = [action, ...(claim.approval_actions || [])];

    // Notify submitter
    const submitterId = claim.submitted_by_user_id || claim.claimant_id;
    if (submitterId) {
      this.createNotification({
        user_id: submitterId,
        claim_id: claim.id,
        type: "CLAIM_RETURNED",
        title: "Claim Requires Clarification",
        message: `${actor.full_name} returned ${claim.claim_number}: "${reason}"`,
        link: `/claims/${claim.id}/edit`,
      });
    }

    this.logAudit({
      actor_id: actor.id,
      action: "CLAIM_RETURNED_FOR_CLARIFICATION",
      entity_type: "CLAIM",
      entity_id: claim.id,
      before_data: { status: prevStatus },
      after_data: { status: "RETURNED_FOR_CLARIFICATION", reason },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Reject Claim ---
  public rejectClaim(claimId: string, actor: Profile, reason: string): Claim {
    if (!reason || reason.trim().length < 3) {
      throw new Error("A clear rejection reason is required.");
    }

    const claim = this.claims.find(c => c.id === claimId);
    if (!claim) throw new Error("Claim not found");

    const now = new Date().toISOString();
    const prevStatus = claim.status;

    claim.status = "REJECTED";
    claim.rejection_reason = reason;
    claim.updated_at = now;

    // Mark current step as rejected
    const steps = claim.workflow_steps || [];
    const currentStep = steps.find(s => s.status === "IN_PROGRESS");
    if (currentStep) {
      currentStep.status = "REJECTED";
      currentStep.comments = reason;
      currentStep.completed_at = now;
      currentStep.completed_by = actor.id;
      currentStep.updated_at = now;
    }

    const action: ApprovalAction = {
      id: `act-${Date.now()}`,
      claim_id: claim.id,
      workflow_step_id: currentStep?.id,
      actor_id: actor.id,
      actor_role: actor.roles?.[0] || "FINANCE_OFFICER",
      action: "REJECT",
      comment: reason,
      previous_status: prevStatus,
      new_status: "REJECTED",
      created_at: now,
    };
    claim.approval_actions = [action, ...(claim.approval_actions || [])];

    // Notify submitter
    const submitterId = claim.submitted_by_user_id || claim.claimant_id;
    if (submitterId) {
      this.createNotification({
        user_id: submitterId,
        claim_id: claim.id,
        type: "CLAIM_REJECTED",
        title: "Claim Rejected",
        message: `Claim ${claim.claim_number} for ${claim.claimant_name} was rejected by ${actor.full_name}: "${reason}"`,
        link: `/claims/${claim.id}`,
      });
    }

    this.logAudit({
      actor_id: actor.id,
      action: "CLAIM_REJECTED",
      entity_type: "CLAIM",
      entity_id: claim.id,
      before_data: { status: prevStatus },
      after_data: { status: "REJECTED", reason },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Resubmit Claim after Clarification ---
  public resubmitClaim(params: {
    claim_id: string;
    claimant: Profile;
    submitted_by_user_id?: string;
    claimant_name?: string;
    claimant_email?: string;
    claimant_phone?: string;
    ministry_id: string;
    claim_date: string;
    purpose: string;
    internal_reference?: string;
    declaration_accepted: boolean;
    expenses: Array<Omit<ClaimExpense, "id" | "claim_id" | "created_at" | "updated_at">>;
    attachments?: Array<Omit<ClaimAttachment, "id" | "claim_id" | "created_at">>;
    response_comment?: string;
  }): Claim {
    const claim = this.claims.find(c => c.id === params.claim_id);
    if (!claim) throw new Error("Claim not found");
    const submitterId = claim.submitted_by_user_id || claim.claimant_id;
    if (submitterId !== params.claimant.id && claim.claimant_id !== params.claimant.id) {
      throw new Error("Unauthorized to resubmit this claim");
    }

    const now = new Date().toISOString();
    const total_amount = calculateTotalAmount(params.expenses);

    const updatedExpenses: ClaimExpense[] = params.expenses.map((exp, i) => ({
      ...exp,
      id: (exp as any).id || `exp-${Date.now()}-${i}`,
      claim_id: claim.id,
      sort_order: i + 1,
      created_at: (exp as any).created_at || now,
      updated_at: now,
    }));

    const updatedAttachments: ClaimAttachment[] = (params.attachments || []).map((att, i) => ({
      ...att,
      id: (att as any).id || `att-${Date.now()}-${i}`,
      claim_id: claim.id,
      created_at: (att as any).created_at || now,
    }));

    claim.claimant_name = params.claimant_name || claim.claimant_name;
    claim.claimant_email = params.claimant_email || claim.claimant_email;
    claim.claimant_phone = params.claimant_phone || claim.claimant_phone;
    claim.ministry_id = params.ministry_id;
    claim.claim_date = params.claim_date;
    claim.purpose = params.purpose;
    claim.internal_reference = params.internal_reference;
    claim.total_amount = total_amount;
    claim.resubmitted_at = now;
    claim.status = "PENDING_FINANCE_REVIEW";
    claim.expenses = updatedExpenses;
    claim.attachments = updatedAttachments;
    claim.current_step_sequence = 1;

    // Reset workflow steps to single Finance Review step
    claim.workflow_steps = this.buildWorkflowSteps(claim);

    const action: ApprovalAction = {
      id: `act-${Date.now()}`,
      claim_id: claim.id,
      actor_id: params.claimant.id,
      actor_role: params.claimant.roles?.[0] || "CLAIMANT",
      action: "RESUBMIT",
      comment: params.response_comment || "Claim updated with requested clarifications and resubmitted.",
      previous_status: "RETURNED_FOR_CLARIFICATION",
      new_status: "PENDING_FINANCE_REVIEW",
      created_at: now,
    };
    claim.approval_actions = [action, ...(claim.approval_actions || [])];

    // Notify Finance
    this.notifyFinance({
      claim_id: claim.id,
      type: "CLAIM_RESUBMITTED",
      title: "Claim Resubmitted for Finance Review",
      message: `${params.claimant.full_name} has resubmitted ${claim.claim_number} for ${claim.claimant_name} with updated details.`,
      link: `/finance/claims/${claim.id}`,
    });

    this.logAudit({
      actor_id: params.claimant.id,
      action: "CLAIM_RESUBMITTED",
      entity_type: "CLAIM",
      entity_id: claim.id,
      after_data: { total_amount, response: params.response_comment },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Finance Verification ---
  public verifyClaim(claimId: string, reviewer: Profile, notes?: string): Claim {
    const claim = this.claims.find(c => c.id === claimId);
    if (!claim) throw new Error("Claim not found");

    const now = new Date().toISOString();
    claim.finance_review = {
      id: `fr-${Date.now()}`,
      claim_id: claim.id,
      reviewer_id: reviewer.id,
      receipts_verified: true,
      category_verified: true,
      cost_centre_verified: true,
      status: "VERIFIED",
      notes: notes || "Receipts and budget allocations verified by Finance.",
      created_at: now,
      updated_at: now,
    };

    const action: ApprovalAction = {
      id: `act-${Date.now()}`,
      claim_id: claim.id,
      actor_id: reviewer.id,
      actor_role: "FINANCE_OFFICER",
      action: "VERIFY",
      comment: notes || "Finance verification completed.",
      previous_status: claim.status,
      new_status: claim.status,
      created_at: now,
    };
    claim.approval_actions = [action, ...(claim.approval_actions || [])];

    this.logAudit({
      actor_id: reviewer.id,
      action: "FINANCE_VERIFICATION",
      entity_type: "CLAIM",
      entity_id: claim.id,
      after_data: { verified: true, notes },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Finance Payment Processing ---
  public recordPayment(params: {
    claim_id: string;
    processor: Profile;
    amount: number;
    payment_date: string;
    payment_reference: string;
    payment_method: any;
    notes?: string;
  }): Claim {
    const claim = this.claims.find(c => c.id === params.claim_id);
    if (!claim) throw new Error("Claim not found");

    if (claim.status === "PAID") {
      throw new Error("This claim has already been marked as Paid.");
    }

    const now = new Date().toISOString();
    const prevStatus = claim.status;

    const payment: Payment = {
      id: `pay-${Date.now()}`,
      claim_id: claim.id,
      amount: params.amount,
      payment_date: params.payment_date,
      payment_reference: params.payment_reference,
      payment_method: params.payment_method,
      notes: params.notes,
      processed_by: params.processor.id,
      created_at: now,
    };

    claim.payment = payment;
    claim.status = "PAID";
    claim.reimbursement_status = "PAID";
    claim.updated_at = now;

    const action: ApprovalAction = {
      id: `act-${Date.now()}`,
      claim_id: claim.id,
      actor_id: params.processor.id,
      actor_role: "FINANCE_OFFICER",
      action: "PAY",
      comment: `Payment recorded (Ref: ${params.payment_reference}, Date: ${params.payment_date})`,
      previous_status: prevStatus,
      new_status: "PAID",
      created_at: now,
    };
    claim.approval_actions = [action, ...(claim.approval_actions || [])];

    // Notify Submitter
    const submitterId = claim.submitted_by_user_id || claim.claimant_id;
    if (submitterId) {
      this.createNotification({
        user_id: submitterId,
        claim_id: claim.id,
        type: "PAYMENT_COMPLETED",
        title: "Claim Payment Completed",
        message: `Payment for claim ${claim.claim_number} (RM ${params.amount.toFixed(2)}) for ${claim.claimant_name} has been marked as Paid. Ref: ${params.payment_reference}`,
        link: `/claims/${claim.id}`,
      });
    }

    this.logAudit({
      actor_id: params.processor.id,
      action: "CLAIM_PAID",
      entity_type: "CLAIM",
      entity_id: claim.id,
      before_data: { status: prevStatus },
      after_data: { payment_ref: params.payment_reference, amount: params.amount, date: params.payment_date },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Administrative Correction ---
  public correctClaimMetadata(params: {
    claim_id: string;
    actor: Profile;
    cost_centre_id?: string;
    programme_event?: string;
    purpose?: string;
    internal_reference?: string;
    bank_name?: string;
    bank_account_number?: string;
    reason: string;
  }): Claim {
    const claim = this.claims.find(c => c.id === params.claim_id);
    if (!claim) throw new Error("Claim not found");

    const beforeData = {
      cost_centre_id: claim.cost_centre_id,
      purpose: claim.purpose,
      internal_reference: claim.internal_reference,
      bank_name: claim.bank_name,
      bank_account_number: claim.bank_account_number,
    };

    if (params.cost_centre_id) claim.cost_centre_id = params.cost_centre_id;
    if (params.purpose) claim.purpose = params.purpose;
    if (params.internal_reference !== undefined) claim.internal_reference = params.internal_reference;
    if (params.bank_name !== undefined) claim.bank_name = params.bank_name;
    if (params.bank_account_number !== undefined) claim.bank_account_number = params.bank_account_number;
    claim.updated_at = new Date().toISOString();

    this.logAudit({
      actor_id: params.actor.id,
      action: "ADMIN_CORRECTION",
      entity_type: "CLAIM",
      entity_id: claim.id,
      before_data: beforeData,
      after_data: {
        cost_centre_id: params.cost_centre_id,
        purpose: params.purpose,
        internal_reference: params.internal_reference,
        bank_name: params.bank_name,
        bank_account_number: params.bank_account_number,
        reason: params.reason,
      },
    });

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Comments ---
  public addComment(claimId: string, author: Profile, content: string, visibility: "PUBLIC_WORKFLOW" | "FINANCE_INTERNAL" = "PUBLIC_WORKFLOW"): Claim {
    const claim = this.claims.find(c => c.id === claimId);
    if (!claim) throw new Error("Claim not found");

    const now = new Date().toISOString();
    const comment = {
      id: `comm-${Date.now()}`,
      claim_id: claim.id,
      author_id: author.id,
      author_role: author.roles?.[0] || "CLAIMANT",
      content,
      visibility,
      created_at: now,
      updated_at: now,
    };

    claim.comments = [...(claim.comments || []), comment];

    // If claimant commented, notify approvers; if approver commented, notify claimant
    if (visibility === "PUBLIC_WORKFLOW") {
      const isSubmitter = author.id === (claim.submitted_by_user_id || claim.claimant_id);
      if (isSubmitter) {
        // notify current step approver
        const currentStep = claim.workflow_steps?.find(s => s.status === "IN_PROGRESS");
        if (currentStep?.assigned_user_id) {
          this.createNotification({
            user_id: currentStep.assigned_user_id,
            claim_id: claim.id,
            type: "NEW_COMMENT",
            title: "New Comment on Claim",
            message: `${author.full_name} commented on ${claim.claim_number}: "${content.slice(0, 80)}"`,
            link: `/approvals/${claim.id}`,
          });
        }
      } else {
        const targetUserId = claim.submitted_by_user_id || claim.claimant_id;
        if (targetUserId) {
          this.createNotification({
            user_id: targetUserId,
            claim_id: claim.id,
            type: "NEW_COMMENT",
            title: "New Comment on Your Claim",
            message: `${author.full_name} commented on ${claim.claim_number}: "${content.slice(0, 80)}"`,
            link: `/claims/${claim.id}`,
          });
        }
      }
    }

    this.persist();
    return this.enrichClaim(claim);
  }

  // --- Notifications ---
  public getNotifications(userId: string): Notification[] {
    return this.notifications
      .filter(n => n.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public markNotificationAsRead(id: string): void {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) notif.is_read = true;
    this.persist();
  }

  public markAllNotificationsAsRead(userId: string): void {
    this.notifications.forEach(n => {
      if (n.user_id === userId) n.is_read = true;
    });
    this.persist();
  }

  public createNotification(n: Omit<Notification, "id" | "created_at" | "is_read">): Notification {
    const newN: Notification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    this.notifications.unshift(newN);
    this.persist();
    return newN;
  }

  private notifyFinance(n: Omit<Notification, "id" | "created_at" | "is_read" | "user_id">): void {
    const financeUsers = this.profiles.filter(p => p.roles?.includes("FINANCE_OFFICER"));
    financeUsers.forEach(fu => {
      this.createNotification({
        ...n,
        user_id: fu.id,
      });
    });
  }

  // --- Audit Logs ---
  public logAudit(entry: {
    actor_id?: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before_data?: any;
    after_data?: any;
  }): AuditLog {
    const actor = entry.actor_id ? this.getProfileById(entry.actor_id) : undefined;
    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      actor_id: entry.actor_id,
      actor_name: actor?.full_name || "System",
      actor_email: actor?.email || "system@newlife.org.my",
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_data: entry.before_data,
      after_data: entry.after_data,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    this.persist();
    return log;
  }

  public getAuditLogs(entityType?: string, entityId?: string): AuditLog[] {
    let logs = this.auditLogs;
    if (entityType) {
      logs = logs.filter(l => l.entity_type === entityType);
    }
    if (entityId) {
      logs = logs.filter(l => l.entity_id === entityId);
    }
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // --- Analytics & Statistics ---
  public getFinanceStats() {
    const all = this.claims.filter(c => c.status !== "DRAFT" && c.status !== "CANCELLED");
    const awaitingReview = all.filter(c => c.status === "PENDING_FINANCE_REVIEW").length;
    const awaitingPayment = all.filter(c => c.status === "APPROVED_FOR_PAYMENT").length;
    const paidClaims = all.filter(c => c.status === "PAID");
    const totalPaidAmount = paidClaims.reduce((sum, c) => sum + Number(c.total_amount), 0);
    const totalPendingAmount = all.filter(c => c.status !== "PAID" && c.status !== "REJECTED").reduce((sum, c) => sum + Number(c.total_amount), 0);

    // Spend by Ministry
    const ministryMap: Record<string, { name: string; total: number; count: number }> = {};
    all.forEach(c => {
      const min = this.ministries.find(m => m.id === c.ministry_id);
      const name = min?.name || "General";
      if (!ministryMap[name]) ministryMap[name] = { name, total: 0, count: 0 };
      ministryMap[name].total += Number(c.total_amount);
      ministryMap[name].count += 1;
    });

    // Spend by Category
    const categoryMap: Record<string, { name: string; total: number }> = {};
    all.forEach(c => {
      (c.expenses || []).forEach(exp => {
        const cat = this.categories.find(cat => cat.id === exp.expense_category_id);
        const name = cat?.name || "Other";
        if (!categoryMap[name]) categoryMap[name] = { name, total: 0 };
        categoryMap[name].total += Number(exp.amount);
      });
    });

    return {
      totalClaims: all.length,
      awaitingReview,
      awaitingPayment,
      paidCount: paidClaims.length,
      totalPaidAmount,
      totalPendingAmount,
      byMinistry: Object.values(ministryMap),
      byCategory: Object.values(categoryMap),
    };
  }

  // --- Signup Invitations Management ---
  public getSignupInvitations(): SignupInvitation[] {
    return this.signupInvitations.map(inv => ({
      ...inv,
      ministry: inv.ministry_id ? this.ministries.find(m => m.id === inv.ministry_id) : null,
      creator: this.getProfileById(inv.created_by),
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public createSignupInvitation(params: {
    role_code: RoleCode;
    ministry_id?: string | null;
    max_uses?: number;
    expires_in_days?: number;
    description?: string;
    is_multi_user?: boolean;
    created_by: string;
  }): { invitation: SignupInvitation; raw_token: string; signup_url: string } {
    const raw_token = generateSecureToken(32);
    const token_hash = hashToken(raw_token);
    const now = new Date();
    const expiresDays = params.expires_in_days && params.expires_in_days > 0 ? params.expires_in_days : 7;
    const expires_at = new Date(now.getTime() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

    const newInv: SignupInvitation = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      token_hash,
      role_code: params.role_code,
      ministry_id: null,
      created_by: params.created_by,
      description: params.description || null,
      expires_at,
      max_uses: params.max_uses && params.max_uses > 0 ? params.max_uses : 1,
      use_count: 0,
      is_active: true,
      is_multi_user: Boolean(params.is_multi_user),
      created_at: now.toISOString(),
      raw_token,
      signup_url: `/signup?invite=${raw_token}`,
    };

    this.signupInvitations.unshift(newInv);
    this.logAudit({
      actor_id: params.created_by,
      action: "CREATE_SIGNUP_INVITATION",
      entity_type: "SIGNUP_INVITATION",
      entity_id: newInv.id,
      after_data: { role_code: params.role_code, max_uses: newInv.max_uses, expires_at },
    });
    this.persist();

    return {
      invitation: {
        ...newInv,
        ministry: newInv.ministry_id ? this.ministries.find(m => m.id === newInv.ministry_id) : null,
        creator: this.getProfileById(newInv.created_by),
      },
      raw_token,
      signup_url: newInv.signup_url!,
    };
  }

  public validateSignupInvitation(token: string): { valid: boolean; reason?: string; invitation?: SignupInvitation } {
    if (!token) {
      return { valid: false, reason: "Invitation token is missing." };
    }
    const tokenHash = hashToken(token);
    const inv = this.signupInvitations.find(i => i.token_hash === tokenHash || i.token_hash === token || (i as any).raw_token === token);
    if (!inv || !inv.is_active) {
      return { valid: false, reason: "Invitation link is invalid or has been revoked." };
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { valid: false, reason: "Invitation link has expired." };
    }
    if (inv.use_count >= inv.max_uses) {
      return { valid: false, reason: "Invitation link has already reached its maximum usage limit." };
    }
    return {
      valid: true,
      invitation: {
        ...inv,
        ministry: inv.ministry_id ? this.ministries.find(m => m.id === inv.ministry_id) : null,
      },
    };
  }

  public consumeSignupInvitation(token: string, userId: string): Profile {
    const validation = this.validateSignupInvitation(token);
    if (!validation.valid || !validation.invitation) {
      throw new Error(validation.reason || "Invalid invitation token.");
    }
    const invIdx = this.signupInvitations.findIndex(i => i.id === validation.invitation!.id);
    if (invIdx >= 0) {
      this.signupInvitations[invIdx].use_count += 1;
      this.signupInvitations[invIdx].last_used_at = new Date().toISOString();
      if (this.signupInvitations[invIdx].use_count >= this.signupInvitations[invIdx].max_uses) {
        // limit reached
      }
    }

    const user = this.getProfileById(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const updated = this.updateProfile(userId, {
      roles: [validation.invitation.role_code],
      ministry_id: null,
      default_ministry_id: null,
      is_multi_user: Boolean(validation.invitation.is_multi_user),
    });

    this.logAudit({
      actor_id: userId,
      action: "CONSUME_SIGNUP_INVITATION",
      entity_type: "SIGNUP_INVITATION",
      entity_id: validation.invitation.id,
      after_data: { user_id: userId, role_code: validation.invitation.role_code },
    });
    this.persist();
    return updated;
  }

  public revokeSignupInvitation(id: string, actorId?: string): boolean {
    const idx = this.signupInvitations.findIndex(i => i.id === id);
    if (idx === -1) return false;
    this.signupInvitations[idx].is_active = false;
    this.logAudit({
      actor_id: actorId,
      action: "REVOKE_SIGNUP_INVITATION",
      entity_type: "SIGNUP_INVITATION",
      entity_id: id,
    });
    this.persist();
    return true;
  }

  public deleteSignupInvitation(id: string, actorId?: string): boolean {
    const idx = this.signupInvitations.findIndex(i => i.id === id);
    if (idx === -1) return false;
    const removed = this.signupInvitations.splice(idx, 1)[0];
    this.logAudit({
      actor_id: actorId,
      action: "DELETE_SIGNUP_INVITATION",
      entity_type: "SIGNUP_INVITATION",
      entity_id: id,
      before_data: removed,
    });
    this.persist();
    return true;
  }

  public deleteClaim(id: string, actorId?: string): boolean {
    const idx = this.claims.findIndex(c => c.id === id);
    if (idx === -1) return false;
    const removed = this.claims.splice(idx, 1)[0];
    this.logAudit({
      actor_id: actorId,
      action: "DELETE_CLAIM",
      entity_type: "CLAIM",
      entity_id: id,
      before_data: removed,
    });
    this.persist();
    return true;
  }

  // --- Onboarding Management ---
  public completeOnboarding(
    userId: string,
    data: {
      full_name: string;
      phone?: string;
      is_multi_user?: boolean;
      bank_name?: string;
      bank_code?: string;
      bank_account_holder_name?: string;
      bank_account_number?: string;
    }
  ): Profile {
    if (!data.full_name || data.full_name.trim().length === 0) {
      throw new Error("Full name is required to complete onboarding.");
    }
    const resolved = resolveCanonicalBank(data.bank_code || data.bank_name);
    const updated = this.updateProfile(userId, {
      full_name: data.full_name.trim(),
      phone: data.phone?.trim() || null,
      ...(typeof data.is_multi_user === "boolean"
        ? { is_multi_user: data.is_multi_user }
        : {}),
      ...(resolved
        ? { bank_name: resolved.name, bank_code: resolved.swiftCode }
        : {}),
      ...(data.bank_account_holder_name
        ? { bank_account_holder_name: data.bank_account_holder_name.trim() }
        : {}),
      ...(data.bank_account_number
        ? { bank_account_number: data.bank_account_number.replace(/[\s\-]/g, "") }
        : {}),
      onboarding_completed_at: new Date().toISOString(),
    });
    this.logAudit({
      actor_id: userId,
      action: "COMPLETE_ONBOARDING",
      entity_type: "PROFILE",
      entity_id: userId,
      after_data: {
        full_name: data.full_name.trim(),
        phone: data.phone,
        is_multi_user: updated.is_multi_user,
        bank_code: updated.bank_code,
      },
    });
    return updated;
  }

  public saveClaimantBankProfile(params: {
    id?: string;
    actor_id: string;
    full_name: string;
    email?: string;
    phone?: string;
    ministry_id?: string | null;
    bank_code: string;
    bank_name?: string;
    bank_account_holder_name?: string;
    bank_account_number: string;
    beneficiary_new_ic?: string;
    beneficiary_address?: string;
  }): Profile {
    const trimmedName = (params.full_name || "").trim();
    if (!trimmedName) {
      throw new Error("Claimant full name is required.");
    }
    const resolved = resolveCanonicalBank(params.bank_code || params.bank_name);
    if (!resolved) {
      throw new Error("Please select a valid bank from the 31-bank directory.");
    }
    const cleanAccount = (params.bank_account_number || "").replace(/[\s\-]/g, "");
    if (!/^[A-Za-z0-9]{5,34}$/.test(cleanAccount)) {
      throw new Error("Please enter a valid bank account number (5 to 34 alphanumeric characters).");
    }
    const holderName = (params.bank_account_holder_name || "").trim() || trimmedName;
    const now = new Date().toISOString();

    if (params.id) {
      return this.updateProfile(params.id, {
        full_name: trimmedName,
        ...(params.email ? { email: params.email.trim() } : {}),
        ...(params.phone ? { phone: params.phone.trim() } : {}),
        ...(params.ministry_id !== undefined ? { ministry_id: params.ministry_id } : {}),
        bank_name: resolved.name,
        bank_code: resolved.swiftCode,
        bank_account_holder_name: holderName,
        bank_account_number: cleanAccount,
        beneficiary_new_ic: params.beneficiary_new_ic?.trim() || null,
        beneficiary_address: params.beneficiary_address?.trim() || null,
        bank_updated_at: now,
      });
    }

    const newProfile: Profile = {
      id: `payee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email:
        params.email?.trim() ||
        `payee.${Date.now().toString(36)}@harvestgen.org`,
      full_name: trimmedName,
      phone: params.phone?.trim() || null,
      ministry_id: params.ministry_id || null,
      default_ministry_id: params.ministry_id || null,
      status: "ACTIVE",
      is_multi_user: false,
      is_payee_only: true,
      created_by_user_id: params.actor_id,
      bank_name: resolved.name,
      bank_code: resolved.swiftCode,
      bank_account_holder_name: holderName,
      bank_account_number: cleanAccount,
      beneficiary_new_ic: params.beneficiary_new_ic?.trim() || null,
      beneficiary_address: params.beneficiary_address?.trim() || null,
      bank_updated_at: now,
      onboarding_completed_at: now,
      roles: [],
      created_at: now,
      updated_at: now,
    };
    this.profiles.push(newProfile);
    this.logAudit({
      actor_id: params.actor_id,
      action: "UPSERT_PAYEE_BANK_PROFILE",
      entity_type: "PROFILE",
      entity_id: newProfile.id,
      after_data: {
        full_name: newProfile.full_name,
        bank_code: newProfile.bank_code,
      },
    });
    this.persist();
    return newProfile;
  }

  // --- Bulk Reimbursement Batch Management ---
  public getReimbursementBatches(): ReimbursementBatch[] {
    return this.reimbursementBatches;
  }

  public getReimbursementBatchById(id: string): ReimbursementBatch | undefined {
    return this.reimbursementBatches.find(b => b.id === id);
  }

  public createReimbursementBatch(params: {
    actor_id: string;
    claim_ids: string[];
    batch_name?: string;
    notes?: string;
    payment_reference_default?: string;
    mark_exported?: boolean;
  }): ReimbursementBatch {
    const actor = this.getProfileById(params.actor_id);
    if (!actor || (!actor.roles?.includes("FINANCE_OFFICER") && !actor.roles?.includes("SYSTEM_ADMIN"))) {
      throw new Error("Only Finance Officer or System Admin can create reimbursement batches.");
    }
    const uniqueClaimIds = Array.from(new Set(params.claim_ids));
    if (uniqueClaimIds.length === 0) {
      throw new Error("Select at least one eligible claim.");
    }

    const selectedClaims = uniqueClaimIds.map(id => {
      const c = this.claims.find(cl => cl.id === id);
      if (!c) throw new Error(`Claim ${id} not found.`);
      return c;
    });

    const preview = previewReimbursementSelection(selectedClaims, uniqueClaimIds);
    if (preview.blockedClaims.length > 0) {
      throw new Error(
        preview.blockedClaims
          .map(b => `${b.claimNumber}: ${b.blockers.join("; ")}`)
          .join(" | ")
      );
    }
    if (preview.proposedInstructions.length === 0) {
      throw new Error("No valid transfer instructions could be generated.");
    }

    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const batchSeq = this.reimbursementBatches.length + 1;
    const batchId = `batch-${Date.now()}-${batchSeq}`;
    const batchNumber = `RB-${year}-${String(batchSeq).padStart(4, "0")}`;

    const instructions: ReimbursementBatchInstruction[] = preview.proposedInstructions.map((row, idx) => {
      const seq = (this.paymentDescriptionSeqByYear[year] || 0) + 1;
      this.paymentDescriptionSeqByYear[year] = seq;
      const paymentDescription = formatPaymentDescription(year, seq);
      const instId = `inst-${Date.now()}-${idx + 1}`;

      const linkedClaims: ReimbursementInstructionClaim[] = row.claimIds.map((cid: string) => {
        const claim = this.claims.find(c => c.id === cid)!;
        claim.reimbursement_status = params.mark_exported
          ? "EXPORTED_PENDING_CONFIRMATION"
          : "RESERVED_IN_BATCH";
        claim.active_batch_id = batchId;
        claim.active_instruction_id = instId;
        claim.updated_at = now;
        return {
          id: `ic-${Date.now()}-${cid}`,
          batch_id: batchId,
          instruction_id: instId,
          claim_id: cid,
          claim,
          allocated_amount_cents: toExactCents(claim.total_amount),
          allocated_amount: Number(claim.total_amount),
          is_active: true,
          created_at: now,
        };
      });

      return {
        id: instId,
        batch_id: batchId,
        line_order: idx + 1,
        payment_mode: row.paymentMode,
        beneficiary_user_id: row.beneficiaryUserId,
        beneficiary_name: row.beneficiaryName,
        beneficiary_account_number: row.beneficiaryAccountNumber,
        beneficiary_bank_name: row.beneficiaryBankName,
        beneficiary_bank_code: row.beneficiaryBankCode,
        amount_cents: row.amountCents,
        amount: row.amount,
        claim_count: linkedClaims.length,
        payment_description: paymentDescription,
        payment_reference: params.payment_reference_default?.slice(0, 35) || row.paymentReference || "",
        status: params.mark_exported ? "EXPORTED" : "RESERVED",
        created_at: now,
        updated_at: now,
        claims: linkedClaims,
      };
    });

    const batch: ReimbursementBatch = {
      id: batchId,
      batch_number: batchNumber,
      status: params.mark_exported ? "EXPORTED" : "FINALIZED",
      template_version: "ALLIANCE_SBP_BIFF8_V1",
      claim_count: preview.selectedEligibleClaims.length,
      transfer_count: instructions.length,
      total_amount_cents: preview.totalAmountCents,
      total_amount: centsToMyrNumber(preview.totalAmountCents),
      content_digest_sha256: preview.previewDigest,
      exported_at: params.mark_exported ? now : null,
      exported_by: params.mark_exported ? params.actor_id : null,
      exported_filename: params.mark_exported ? `${batchNumber}.xls` : null,
      notes: params.notes || params.batch_name || null,
      created_by: params.actor_id,
      created_at: now,
      updated_at: now,
      instructions,
    };

    this.reimbursementBatches.unshift(batch);
    this.persist();
    return batch;
  }

  public markBatchUploadedToBank(params: {
    actor_id: string;
    batch_id: string;
    portal_submission_ref?: string;
    notes?: string;
  }): ReimbursementBatch {
    const batch = this.getReimbursementBatchById(params.batch_id);
    if (!batch) throw new Error("Batch not found.");
    const now = new Date().toISOString();
    batch.status = "SUBMITTED_TO_BANK";
    batch.bank_uploaded_at = now;
    batch.bank_uploaded_by = params.actor_id;
    batch.bank_upload_reference = params.portal_submission_ref || null;
    batch.updated_at = now;
    (batch.instructions || []).forEach(inst => {
      if (inst.status === "RESERVED" || inst.status === "EXPORTED") {
        inst.status = "SUBMITTED_TO_BANK";
        inst.updated_at = now;
      }
      (inst.claims || []).forEach(link => {
        const claim = this.claims.find(c => c.id === link.claim_id);
        if (claim && claim.status !== "PAID") {
          claim.reimbursement_status = "SUBMITTED_TO_BANK";
          claim.updated_at = now;
        }
      });
    });
    this.persist();
    return batch;
  }

  public reconcileBatchInstruction(params: {
    actor_id: string;
    batch_id: string;
    instruction_id: string;
    outcome: "PAID" | "FAILED";
    bank_reference?: string;
    failure_reason?: string;
    payment_date?: string;
  }): ReimbursementBatch {
    const batch = this.getReimbursementBatchById(params.batch_id);
    if (!batch) throw new Error("Batch not found.");
    const inst = (batch.instructions || []).find(i => i.id === params.instruction_id);
    if (!inst) throw new Error("Instruction not found.");
    if (inst.status === "PAID") throw new Error("Instruction already settled as PAID.");

    const now = new Date().toISOString();
    if (params.outcome === "PAID") {
      inst.status = "PAID";
      inst.bank_reference = params.bank_reference || inst.payment_description;
      inst.reconciled_at = now;
      inst.reconciled_by = params.actor_id;
      inst.updated_at = now;
      (inst.claims || []).forEach(link => {
        const claim = this.claims.find(c => c.id === link.claim_id);
        if (claim) {
          claim.status = "PAID";
          claim.reimbursement_status = "PAID";
          claim.payment = {
            id: `pay-${Date.now()}-${claim.id}`,
            claim_id: claim.id,
            amount: claim.total_amount,
            payment_date: params.payment_date || now.slice(0, 10),
            payment_reference: `${inst.payment_description} / ${inst.bank_reference}`,
            payment_method: "BANK_TRANSFER",
            processed_by: params.actor_id,
            created_at: now,
          };
          claim.updated_at = now;
        }
      });
    } else {
      inst.status = "FAILED";
      inst.failure_reason = params.failure_reason || "Rejected by bank";
      inst.reconciled_at = now;
      inst.reconciled_by = params.actor_id;
      inst.updated_at = now;
      (inst.claims || []).forEach(link => {
        link.is_active = false;
        const claim = this.claims.find(c => c.id === link.claim_id);
        if (claim) {
          claim.reimbursement_status = "FAILED";
          claim.active_batch_id = undefined;
          claim.active_instruction_id = undefined;
          claim.updated_at = now;
        }
      });
    }

    const allInst = batch.instructions || [];
    const paidCount = allInst.filter(i => i.status === "PAID").length;
    const failedCount = allInst.filter(i => i.status === "FAILED").length;
    if (paidCount === allInst.length) {
      batch.status = "SETTLED";
      batch.settled_at = now;
    } else if (failedCount === allInst.length) {
      batch.status = "REJECTED";
    } else if (paidCount > 0 || failedCount > 0) {
      batch.status = "PARTIALLY_SETTLED";
    }
    batch.updated_at = now;
    this.persist();
    return batch;
  }

  public disburseReimbursementBatch(params: {
    actor_id: string;
    batch_id: string;
    bank_reference?: string;
    payment_date?: string;
  }): ReimbursementBatch {
    const batch = this.getReimbursementBatchById(params.batch_id);
    if (!batch) throw new Error("Batch not found.");
    if (batch.status === "VOIDED") {
      throw new Error("Cannot disburse a voided batch.");
    }
    const now = new Date().toISOString();
    const payDate = params.payment_date || now.slice(0, 10);
    const refBase = params.bank_reference?.trim() || batch.batch_number;

    (batch.instructions || []).forEach(inst => {
      if (inst.status !== "PAID" && inst.status !== "VOIDED") {
        inst.status = "PAID";
        inst.bank_reference = params.bank_reference?.trim() || inst.payment_description;
        inst.reconciled_at = now;
        inst.reconciled_by = params.actor_id;
        inst.updated_at = now;
      }
      (inst.claims || []).forEach(link => {
        if (!link.is_active) return;
        const claim = this.claims.find(c => c.id === link.claim_id);
        if (claim && claim.status !== "PAID") {
          claim.status = "PAID";
          claim.reimbursement_status = "PAID";
          claim.payment = {
            id: `pay-${Date.now()}-${claim.id}`,
            claim_id: claim.id,
            amount: claim.total_amount,
            payment_date: payDate,
            payment_reference: `${refBase} (${inst.payment_description})`,
            payment_method: "BANK_TRANSFER",
            notes: `Disbursed via XLS Batch ${batch.batch_number} / ${inst.payment_description}`,
            processed_by: params.actor_id,
            created_at: now,
          };
          claim.updated_at = now;
        }
      });
    });

    batch.status = "SETTLED";
    batch.settled_at = now;
    batch.exported_at = batch.exported_at || now;
    batch.exported_by = batch.exported_by || params.actor_id;
    batch.updated_at = now;
    this.persist();
    return batch;
  }

  public voidReimbursementBatch(params: {
    actor_id: string;
    batch_id: string;
    void_reason: string;
  }): ReimbursementBatch {
    const batch = this.getReimbursementBatchById(params.batch_id);
    if (!batch) throw new Error("Batch not found.");
    if ((batch.instructions || []).some(i => i.status === "PAID")) {
      throw new Error("Cannot void a batch that already has PAID instructions.");
    }
    const now = new Date().toISOString();
    batch.status = "VOIDED";
    batch.voided_at = now;
    batch.voided_by = params.actor_id;
    batch.void_reason = params.void_reason;
    batch.updated_at = now;
    (batch.instructions || []).forEach(inst => {
      inst.status = "VOIDED";
      inst.updated_at = now;
      (inst.claims || []).forEach(link => {
        link.is_active = false;
        const claim = this.claims.find(c => c.id === link.claim_id);
        if (claim && claim.status !== "PAID") {
          claim.reimbursement_status = "RELEASED";
          claim.active_batch_id = undefined;
          claim.updated_at = now;
        }
      });
    });
    this.persist();
    return batch;
  }
}

// Global Singleton Repository
export const db = new DatabaseRepository();
