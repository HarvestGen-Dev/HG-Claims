import { Profile, Claim, RoleCode } from "@/lib/types/database";

export function userHasRole(user: Profile | null | undefined, role: RoleCode): boolean {
  if (!user || user.status !== "ACTIVE" || !user.roles) return false;
  if (user.roles.includes("SYSTEM_ADMIN")) return true;
  return user.roles.includes(role);
}

export function canUserCreateClaim(user: Profile | null | undefined): boolean {
  if (!user || user.status !== "ACTIVE" || !user.roles) return false;
  return user.roles.includes("MINISTRY_LEADER") || user.roles.includes("SYSTEM_ADMIN");
}

export function isClaimSubmitter(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim) return false;
  return (claim.submitted_by_user_id || claim.claimant_id) === user.id;
}

export function canUserReviewClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || user.status !== "ACTIVE" || !user.roles) return false;
  // Rule 1: Submitter can NEVER review/approve/return/reject their own claim
  if (isClaimSubmitter(user, claim) || claim.claimant_id === user.id) return false;

  // Rule 2: Must be Finance Officer or System Admin
  return user.roles.includes("FINANCE_OFFICER") || user.roles.includes("SYSTEM_ADMIN");
}

export function canUserApproveClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!canUserReviewClaim(user, claim)) return false;
  if (!claim) return false;
  return claim.status === "PENDING_FINANCE_REVIEW";
}

export function canUserReturnClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  return canUserApproveClaim(user, claim);
}

export function canUserRejectClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  return canUserApproveClaim(user, claim);
}

export function canUserEditClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || user.status !== "ACTIVE") return false;
  // Submitter can edit only if DRAFT or RETURNED_FOR_CLARIFICATION
  if (isClaimSubmitter(user, claim) && (claim.status === "DRAFT" || claim.status === "RETURNED_FOR_CLARIFICATION")) {
    return true;
  }
  return false;
}

export function canUserRecordPayment(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || user.status !== "ACTIVE" || !user.roles) return false;
  if (claim.status !== "APPROVED_FOR_PAYMENT") return false;
  if (isClaimSubmitter(user, claim) || claim.claimant_id === user.id) return false;
  return user.roles.includes("FINANCE_OFFICER") || user.roles.includes("SYSTEM_ADMIN");
}

export function canUserVerifyClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || !canUserReviewClaim(user, claim)) return false;
  // Finance verification excludes both the submitter and the claimant, even for admins.
  return claim.claimant_id !== user.id && claim.status === "PENDING_FINANCE_REVIEW";
}

export function canUserManageSystem(user: Profile | null | undefined): boolean {
  if (!user || user.status !== "ACTIVE" || !user.roles) return false;
  return user.roles.includes("SYSTEM_ADMIN");
}

export function canUserViewClaim(user: Profile | null | undefined, claim: Claim | null | undefined): boolean {
  if (!user || !claim || user.status !== "ACTIVE" || !user.roles) return false;
  if (user.roles.includes("SYSTEM_ADMIN")) return true;
  if (user.roles.includes("FINANCE_OFFICER")) return true;
  if (isClaimSubmitter(user, claim)) return true;
  if (user.roles.includes("MINISTRY_LEADER") && user.ministry_id && user.ministry_id === claim.ministry_id) return true;
  return false;
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
