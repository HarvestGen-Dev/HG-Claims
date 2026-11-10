import type {
  Profile,
  Claim,
  Ministry,
  ExpenseCategory,
  CostCentre,
  ApprovalRule,
  RoleCode,
} from "@/lib/types/database";
import {
  workspaceStore,
  iamClient,
  masterDataClient,
  claimsClient,
  financeClient,
  notificationClient,
} from "@/lib/domains";

/**
 * Backward-compatible Repository Facade delegating to bounded-context domain clients:
 * - iamClient (/api/v1/iam)
 * - masterDataClient (/api/v1/master-data)
 * - claimsClient (/api/v1/claims)
 * - financeClient (/api/v1/finance)
 * - notificationClient (/api/v1/notifications)
 */
class Repository {
  subscribe = workspaceStore.subscribe;
  clear() {
    workspaceStore.clear();
  }
  refresh(): Promise<Profile> {
    return workspaceStore.refresh();
  }

  // IAM & Onboarding Domain
  getProfiles() {
    return iamClient.getProfiles();
  }
  getProfileById(id?: string | null) {
    return iamClient.getProfileById(id);
  }
  getSignupInvitations() {
    return iamClient.getSignupInvitations();
  }
  createSignupInvitation(data: {
    role_code: RoleCode | null;
    ministry_id?: string | null;
    max_uses?: number;
    expires_in_days?: number;
    description?: string;
  }) {
    return iamClient.createSignupInvitation(data);
  }
  revokeSignupInvitation(id: string) {
    return iamClient.revokeSignupInvitation(id);
  }
  deleteSignupInvitation(id: string) {
    return iamClient.deleteSignupInvitation(id);
  }
  completeOnboarding(data: { full_name: string; phone?: string }) {
    return iamClient.completeOnboarding(data);
  }
  updateProfile(id: string, data: Partial<Profile>) {
    return iamClient.updateProfile(id, data);
  }

  // Master Data & Org Configuration Domain
  getMinistries() {
    return masterDataClient.getMinistries();
  }
  getCategories() {
    return masterDataClient.getCategories();
  }
  getCostCentres() {
    return masterDataClient.getCostCentres();
  }
  getSetting(key: string) {
    return masterDataClient.getSetting(key);
  }
  getSystemSettings() {
    return masterDataClient.getSystemSettings();
  }
  updateSettings(settings: { key: string; value: Record<string, unknown> }[]) {
    return masterDataClient.updateSettings(settings);
  }
  updateSetting(key: string, value: Record<string, unknown>, actor?: string) {
    return masterDataClient.updateSetting(key, value, actor);
  }
  createMinistry(data: Partial<Ministry>) {
    return masterDataClient.createMinistry(data);
  }
  updateMinistry(id: string, data: Partial<Ministry>) {
    return masterDataClient.updateMinistry(id, data);
  }
  deleteMinistry(id: string) {
    return masterDataClient.deleteMinistry(id);
  }
  createCategory(data: Partial<ExpenseCategory>) {
    return masterDataClient.createCategory(data);
  }
  updateCategory(id: string, data: Partial<ExpenseCategory>) {
    return masterDataClient.updateCategory(id, data);
  }
  deleteCategory(id: string) {
    return masterDataClient.deleteCategory(id);
  }
  createCostCentre(data: Partial<CostCentre>) {
    return masterDataClient.createCostCentre(data);
  }
  updateCostCentre(id: string, data: Partial<CostCentre>) {
    return masterDataClient.updateCostCentre(id, data);
  }
  deleteCostCentre(id: string) {
    return masterDataClient.deleteCostCentre(id);
  }

  // Claims & Receipts Domain
  getClaims(user?: Profile) {
    return claimsClient.getClaims(user);
  }
  getClaimById(id: string): Claim | null {
    return claimsClient.getClaimById(id);
  }
  saveClaimDraft(payload: Record<string, unknown>): Promise<Claim> {
    return claimsClient.saveClaimDraft(payload);
  }
  submitClaim(payload: Record<string, unknown>): Promise<Claim> {
    return claimsClient.submitClaim(payload);
  }
  deleteClaim(id: string) {
    return claimsClient.deleteClaim(id);
  }
  addComment(
    id: string,
    author: Profile,
    content: string,
    visibility: string
  ) {
    return claimsClient.addComment(id, author, content, visibility);
  }

  // Finance & Workflow Domain
  getApprovalRules() {
    return financeClient.getApprovalRules();
  }
  createApprovalRule(data: Partial<ApprovalRule>) {
    return financeClient.createApprovalRule(data);
  }
  updateApprovalRule(id: string, data: Partial<ApprovalRule>) {
    return financeClient.updateApprovalRule(id, data);
  }
  deleteApprovalRule(id: string) {
    return financeClient.deleteApprovalRule(id);
  }
  approveStep(id: string, actor: Profile, reason?: string) {
    return financeClient.approveStep(id, actor, reason);
  }
  returnForClarification(id: string, actor: Profile, reason: string) {
    return financeClient.returnForClarification(id, actor, reason);
  }
  rejectClaim(id: string, actor: Profile, reason: string) {
    return financeClient.rejectClaim(id, actor, reason);
  }
  verifyClaim(id: string, actor: Profile, reason?: string) {
    return financeClient.verifyClaim(id, actor, reason);
  }
  recordPayment(data: { claim_id: string; [key: string]: unknown }) {
    return financeClient.recordPayment(data);
  }
  correctClaimMetadata(data: { claim_id: string; [key: string]: unknown }) {
    return financeClient.correctClaimMetadata(data);
  }
  getFinanceStats() {
    return financeClient.getFinanceStats();
  }

  // Notifications & Audit Domain
  getAuditLogs() {
    return notificationClient.getAuditLogs();
  }
  getNotifications(userId: string) {
    return notificationClient.getNotifications(userId);
  }
  markNotificationAsRead(id: string) {
    return notificationClient.markNotificationAsRead(id);
  }
  markAllNotificationsAsRead(userId: string) {
    return notificationClient.markAllNotificationsAsRead(userId);
  }
}

export const db = new Repository();
