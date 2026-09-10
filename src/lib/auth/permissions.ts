import { Profile, Claim, RoleCode } from "@/lib/types/database";

export function userHasRole(user: Profile | null | undefined, role: RoleCode): boolean {
  if (!user || user.status !== "ACTIVE" || !user.roles) return false;
  if (user.roles.includes("SYSTEM_ADMIN")) return true;
  return user.roles.includes(role);
}

export function canUserApproveClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim) return false;

  // Rule 1: Claimant can NEVER approve their own claim
  if (claim.claimant_id === user.id) return false;

  // Rule 2: Must have an active in-progress step
  const currentStep = claim.workflow_steps?.find(s => s.status === "IN_PROGRESS");
  if (!currentStep) return false;

  // Rule 3: Admin can always override/approve if not own claim
  if (user.roles?.includes("SYSTEM_ADMIN")) return true;

  // Rule 4: Match assigned user or role
  if (currentStep.assigned_user_id) return currentStep.assigned_user_id === user.id;

  if (currentStep.approver_role === "MINISTRY_LEADER") {
    return !!(user.roles?.includes("MINISTRY_LEADER") || user.roles?.includes("SYSTEM_ADMIN"));
  }

  if (currentStep.approver_role === "FINANCE_OFFICER") {
    return !!(user.roles?.includes("FINANCE_OFFICER") || user.roles?.includes("SYSTEM_ADMIN"));
  }

  if (currentStep.approver_role === "FINAL_APPROVER") {
    return !!(user.roles?.includes("FINAL_APPROVER") || user.roles?.includes("SYSTEM_ADMIN"));
  }

  return false;
}

export function canUserEditClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim) return false;
  // Claimant can edit only if DRAFT or RETURNED_FOR_CLARIFICATION
  if (claim.claimant_id === user.id && (claim.status === "DRAFT" || claim.status === "RETURNED_FOR_CLARIFICATION")) {
    return true;
  }
  return false;
}

export function canUserRecordPayment(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim) return false;
  if (claim.status !== "APPROVED_FOR_PAYMENT") return false;
  if (claim.claimant_id === user.id) return false;
  return userHasRole(user, "FINANCE_OFFICER") || userHasRole(user, "SYSTEM_ADMIN");
}

export function canUserVerifyClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim) return false;
  if (claim.claimant_id === user.id || claim.status !== "PENDING_FINANCE_REVIEW") return false;
  return userHasRole(user, "FINANCE_OFFICER") || userHasRole(user, "SYSTEM_ADMIN");
}
