import { Profile, Claim, RoleCode, Ministry } from "@/lib/types/database";

export function isFinance(user: Profile | null | undefined): boolean {
  return !!user && user.status === "ACTIVE" && Boolean(user.roles?.some(r =>
    ["FINANCE", "FINANCE_OFFICER", "SYSTEM_ADMIN"].includes(r)));
}

export function userHasRole(user: Profile | null | undefined, role: RoleCode): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  if (["FINANCE", "FINANCE_OFFICER", "SYSTEM_ADMIN"].includes(role)) return isFinance(user);
  return Boolean(user.roles?.includes(role));
}

export function canUserCreateClaim(user: Profile | null | undefined): boolean {
  return !!user && user.status === "ACTIVE" && !user.is_payee_only;
}

export function canUserViewMinistryBudget(
  user: Profile | null | undefined,
  ministry?: Ministry | null
): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  if (isFinance(user)) return true;
  if (user.roles?.includes("TEAM_LEAD") && ministry) {
    return Boolean(ministry.team_lead_ids?.includes(user.id));
  }
  return false;
}

export function canUserManageMinistryBudget(user: Profile | null | undefined): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  return isFinance(user);
}

export function isClaimSubmitter(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim) return false;
  return (claim.submitted_by_user_id || claim.claimant_id) === user.id;
}

export function canUserReviewClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || user.status !== "ACTIVE") return false;

  if (isFinance(user) && claim.status === "PENDING_FINANCE_REVIEW") return true;
  const team = claim.ministry;
  return claim.status === "PENDING_MINISTRY_APPROVAL" &&
    !!team && !!user.roles?.includes("TEAM_LEAD") &&
    !!team.team_lead_ids?.includes(user.id) && !isClaimSubmitter(user, claim);
}

export function canUserApproveClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  return canUserReviewClaim(user, claim);
}

export function canUserReturnClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  return canUserApproveClaim(user, claim) || (isFinance(user) && claim?.status === "APPROVED_FOR_PAYMENT" && !claim.active_batch_id && !claim.payment);
}

export function canUserRejectClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  return canUserApproveClaim(user, claim);
}

export function canUserEditClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || user.status !== "ACTIVE") return false;
  // Submitter can edit only if DRAFT or RETURNED_FOR_CLARIFICATION
  if ((isClaimSubmitter(user, claim) || (isFinance(user) && claim.recurring_schedule_id)) && (claim.status === "DRAFT" || claim.status === "RETURNED_FOR_CLARIFICATION")) {
    return true;
  }
  return false;
}

export function canUserRecordPayment(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || user.status !== "ACTIVE") return false;
  if (claim.status !== "APPROVED_FOR_PAYMENT") return false;
  return isFinance(user);
}

export function canUserVerifyClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || !canUserReviewClaim(user, claim)) return false;
  return isFinance(user) && claim.status === "PENDING_FINANCE_REVIEW";
}

export function canUserManageSystem(user: Profile | null | undefined): boolean {
  if (!user || user.status !== "ACTIVE") return false;
  return isFinance(user);
}

export function canUserViewClaim(
  user: Profile | null | undefined,
  claim: Claim | null | undefined,
  ministry?: Ministry | null
): boolean {
  if (!user || !claim || user.status !== "ACTIVE") return false;
  if (isFinance(user)) return true;
  if (isClaimSubmitter(user, claim)) return true;
  if (user.roles?.includes("TEAM_LEAD") && ministry && ministry.id === claim.ministry_id) {
    return Boolean(ministry.team_lead_ids?.includes(user.id));
  }
  return false;
}

export function canUserViewReportsAndBatches(user: Profile | null | undefined): boolean {
  return isFinance(user);
}

export function isAuditorOnly(user: Profile | null | undefined): boolean {
  if (!user || !user.roles) return false;
  return (
    user.roles.includes("AUDITOR") &&
    !user.roles.includes("SYSTEM_ADMIN") &&
    !user.roles.includes("FINANCE_OFFICER")
  );
}

export function isRealFullName(name?: string | null, email?: string | null): boolean {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (!email || typeof email !== "string") return true;
  const alias = email.split("@")[0]?.trim().toLowerCase();
  if (trimmed.toLowerCase() === alias) return false;
  return true;
}

export function isOnboardingCompleted(user: Profile | null | undefined): boolean {
  if (!user) return false;
  return !!user.onboarding_completed_at && isRealFullName(user.full_name, user.email);
}
