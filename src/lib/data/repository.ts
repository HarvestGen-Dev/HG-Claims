import type { Profile, Claim, Ministry, ExpenseCategory, CostCentre, ApprovalRule, Notification, SystemSetting, AuditLog } from "@/lib/types/database";

interface Workspace {
  user_id: string;
  profiles: Profile[];
  claims: Claim[];
  ministries: Ministry[];
  categories: ExpenseCategory[];
  costCentres: CostCentre[];
  approvalRules: ApprovalRule[];
  notifications: Notification[];
  systemSettings: SystemSetting[];
  auditLogs: AuditLog[];
}
const empty = (): Workspace => ({ user_id: "", profiles: [], claims: [], ministries: [], categories: [], costCentres: [], approvalRules: [], notifications: [], systemSettings: [], auditLogs: [] });

// A memory-only read model. Every write is authorized and committed by PostgreSQL.
class Repository {
  private data = empty();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  clear() { this.data = empty(); this.listeners.forEach(listener => listener()); }
  async refresh() {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load the workspace.");
    this.data = data;
    this.listeners.forEach(listener => listener());
    return this.getProfileById(data.user_id)!;
  }
  private async command(action: string, payload: Record<string, unknown>) {
    const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) await this.refresh();
      throw new Error(data.error || "Unable to save changes.");
    }
    await this.refresh();
    return data;
  }
  getProfiles() { return this.data.profiles; }
  getProfileById(id: string) { return this.data.profiles.find(profile => profile.id === id); }
  getMinistries() { return this.data.ministries.map(m => ({ ...m, leader: m.leader_id ? this.getProfileById(m.leader_id) : null })); }
  getCategories() { return this.data.categories; }
  getCostCentres() { return this.data.costCentres.map(c => ({ ...c, ministry: this.getMinistries().find(m => m.id === c.ministry_id) })); }
  getApprovalRules() { return this.data.approvalRules.map(r => ({ ...r, ministry: this.getMinistries().find(m => m.id === r.ministry_id), expense_category: this.getCategories().find(c => c.id === r.expense_category_id), approver_user: this.getProfiles().find(p => p.id === r.approver_user_id) })); }
  getSetting(key: string) { return this.data.systemSettings.find(setting => setting.key === key)?.value; }
  getSystemSettings() { return this.data.systemSettings; }
  getAuditLogs() { return this.data.auditLogs; }
  getNotifications(userId: string) { return this.data.notifications.filter(item => item.user_id === userId); }
  getClaims(_user?: Profile) {
    return this.data.claims.map(c => ({
      ...c, claimant: this.getProfileById(c.claimant_id), ministry: this.getMinistries().find(m => m.id === c.ministry_id),
      cost_centre: this.getCostCentres().find(cc => cc.id === c.cost_centre_id),
      returned_by_user: c.returned_by ? this.getProfileById(c.returned_by) : null,
      expenses: c.expenses?.map(e => ({ ...e, expense_category: this.getCategories().find(cat => cat.id === e.expense_category_id) })),
      workflow_steps: c.workflow_steps?.map(s => ({ ...s, assigned_user: this.getProfiles().find(p => p.id === s.assigned_user_id), completed_by_user: this.getProfiles().find(p => p.id === s.completed_by) })),
      approval_actions: c.approval_actions?.map(a => ({ ...a, actor: this.getProfileById(a.actor_id) })),
      comments: c.comments?.map(comment => ({ ...comment, author: this.getProfileById(comment.author_id) })),
      finance_review: c.finance_review ? { ...c.finance_review, reviewer: this.getProfileById(c.finance_review.reviewer_id) } : null,
      payment: c.payment ? { ...c.payment, processor: this.getProfileById(c.payment.processed_by) } : null,
    }));
  }
  getClaimById(id: string): Claim | null { return this.getClaims().find(c => c.id === id) || null; }
  async saveClaimDraft(payload: Record<string, unknown>): Promise<Claim> { const result = await this.command("save_draft", payload); return this.getClaimById(result.id)!; }
  async submitClaim(payload: Record<string, unknown>): Promise<Claim> { const result = await this.command("submit_claim", payload); return this.getClaimById(result.id)!; }
  private async claimCommand(action: string, id: string, data: Record<string, unknown>) {
    const result = await this.command(action, { ...data, claim_id: id, version: this.getClaimById(id)?.version });
    return this.getClaimById(result.id)!;
  }
  approveStep(id: string, _actor: Profile, reason?: string) { return this.claimCommand("approve", id, { reason }); }
  returnForClarification(id: string, _actor: Profile, reason: string) { return this.claimCommand("return", id, { reason }); }
  rejectClaim(id: string, _actor: Profile, reason: string) { return this.claimCommand("reject", id, { reason }); }
  verifyClaim(id: string, _actor: Profile, reason?: string) { return this.claimCommand("verify", id, { reason }); }
  recordPayment(data: { claim_id: string; [key: string]: unknown }) { const { processor, ...payload } = data; return this.claimCommand("pay", data.claim_id, payload); }
  correctClaimMetadata(data: { claim_id: string; [key: string]: unknown }) { const { actor, ...payload } = data; return this.claimCommand("correct", data.claim_id, payload); }
  addComment(id: string, _author: Profile, content: string, visibility: string) { return this.claimCommand("comment", id, { content, visibility }); }
  async updateProfile(id: string, data: Partial<Profile>) { await this.command("profile", { id, data }); return this.getProfileById(id)!; }
  updateSetting(key: string, value: Record<string, unknown>, _actor?: string) { return this.command("setting", { key, value }); }
  markNotificationAsRead(id: string) { return this.command("read_notifications", { id }); }
  markAllNotificationsAsRead(_userId: string) { return this.command("read_notifications", {}); }
  createMinistry(data: Partial<Ministry>) { return this.command("master_save", { table: "ministries", data }); }
  updateMinistry(id: string, data: Partial<Ministry>) { return this.command("master_save", { table: "ministries", id, data }); }
  createCategory(data: Partial<ExpenseCategory>) { return this.command("master_save", { table: "expense_categories", data }); }
  updateCategory(id: string, data: Partial<ExpenseCategory>) { return this.command("master_save", { table: "expense_categories", id, data }); }
  createCostCentre(data: Partial<CostCentre>) { return this.command("master_save", { table: "cost_centres", data }); }
  updateCostCentre(id: string, data: Partial<CostCentre>) { return this.command("master_save", { table: "cost_centres", id, data }); }
  createApprovalRule(data: Partial<ApprovalRule>) { return this.command("master_save", { table: "approval_rules", data }); }
  updateApprovalRule(id: string, data: Partial<ApprovalRule>) { return this.command("master_save", { table: "approval_rules", id, data }); }
  deleteApprovalRule(id: string) { return this.command("master_delete", { table: "approval_rules", id }); }
  getFinanceStats() {
    const claims = this.getClaims().filter(c => !["DRAFT","CANCELLED"].includes(c.status));
    const paid = claims.filter(c => c.status === "PAID");
    const ministries = new Map<string, { name: string; total: number; count: number }>();
    const categories = new Map<string, { name: string; total: number }>();
    claims.forEach(c => {
      const ministry = ministries.get(c.ministry_id) || { name: c.ministry?.name || "General", total: 0, count: 0 };
      ministry.total += Number(c.total_amount); ministry.count++; ministries.set(c.ministry_id, ministry);
      c.expenses?.forEach(e => { const category = categories.get(e.expense_category_id) || { name: e.expense_category?.name || "Other", total: 0 }; category.total += Number(e.amount); categories.set(e.expense_category_id, category); });
    });
    return { totalClaims: claims.length, awaitingReview: claims.filter(c => c.status === "PENDING_FINANCE_REVIEW").length,
      awaitingPayment: claims.filter(c => c.status === "APPROVED_FOR_PAYMENT").length, paidCount: paid.length,
      totalPaidAmount: paid.reduce((sum,c) => sum + Number(c.total_amount),0),
      totalPendingAmount: claims.filter(c => !["PAID","REJECTED"].includes(c.status)).reduce((sum,c) => sum + Number(c.total_amount),0),
      byMinistry: Array.from(ministries.values()), byCategory: Array.from(categories.values()) };
  }
}
export const db = new Repository();
