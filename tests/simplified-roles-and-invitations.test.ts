import { describe, it, expect } from "vitest";
import { db } from "@/lib/mock-db/repository";
import {
  canUserCreateClaim,
  canUserReviewClaim,
  canUserApproveClaim,
  canUserRecordPayment,
  canUserManageSystem,
  isOnboardingCompleted,
  isRealFullName,
} from "@/lib/auth/permissions";
import { generateSecureToken, hashToken } from "@/lib/utils/token";
import { Profile, RoleCode } from "@/lib/types/database";

describe("Simplified Role Model & Signup Invitations", () => {
  const adminUser: Profile = {
    id: "test-admin-99",
    email: "admin99@example.com",
    full_name: "Admin User",
    status: "ACTIVE",
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    roles: ["SYSTEM_ADMIN"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe("1. Token Utilities", () => {
    it("should generate secure random tokens of requested length", () => {
      const token32 = generateSecureToken(32);
      const token64 = generateSecureToken(64);
      expect(token32.length).toBe(32);
      expect(token64.length).toBe(64);
      expect(token32).not.toBe(generateSecureToken(32));
    });

    it("should hash tokens deterministically using SHA-256", () => {
      const token = "nlcc_secure_sample_token_123";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex string
    });
  });

  describe("2. Admin Signup Invitation Generation", () => {
    it("creates a claimant invitation without a ministry", () => {
      const result = db.createSignupInvitation({
        role_code: "CLAIMANT",
        created_by: adminUser.id,
      });
      expect(result.invitation.ministry_id).toBeNull();
    });

    it("should allow creating an invitation for FINANCE_OFFICER without ministry assignment", () => {
      const result = db.createSignupInvitation({
        role_code: "FINANCE_OFFICER",
        ministry_id: null,
        created_by: adminUser.id,
        description: "New Assistant Finance Officer",
        expires_in_days: 14,
        max_uses: 1,
      });

      expect(result.raw_token).toBeDefined();
      expect(result.signup_url).toContain(`/signup?invite=${result.raw_token}`);
      expect(result.invitation.role_code).toBe("FINANCE_OFFICER");
      expect(result.invitation.max_uses).toBe(1);
      expect(result.invitation.use_count).toBe(0);
      expect(result.invitation.is_active).toBe(true);
    });

    it("should create multi-use invitation with configured usage limits and expiration", () => {
      const result = db.createSignupInvitation({
        role_code: "CLAIMANT",
        created_by: adminUser.id,
        description: "Youth Ministry Core Leaders",
        expires_in_days: 30,
        max_uses: 5,
      });

      expect(result.invitation.max_uses).toBe(5);
      expect(result.invitation.ministry_id).toBeNull();
      expect(result.invitation.use_count).toBe(0);
    });
  });

  describe("3. Invitation Token Validation & Consumption", () => {
    it("should validate an active invitation token and return role details", () => {
      const { raw_token } = db.createSignupInvitation({
        role_code: "CLAIMANT",
        created_by: adminUser.id,
      });

      const validation = db.validateSignupInvitation(raw_token);
      expect(validation.valid).toBe(true);
      expect(validation.invitation?.role_code).toBe("CLAIMANT");
      expect(validation.invitation?.ministry_id).toBeNull();
    });

    it("should reject invalid, revoked, or non-existent tokens", () => {
      const nonExistent = db.validateSignupInvitation("non_existent_token_xyz");
      expect(nonExistent.valid).toBe(false);

      const { invitation, raw_token } = db.createSignupInvitation({
        role_code: "FINANCE_OFFICER",
        created_by: adminUser.id,
      });

      db.revokeSignupInvitation(invitation.id);
      const revoked = db.validateSignupInvitation(raw_token);
      expect(revoked.valid).toBe(false);
      expect(revoked.reason).toContain("revoked");
    });

    it("should consume token upon user registration, assigning a role without a ministry", () => {
      const { raw_token } = db.createSignupInvitation({
        role_code: "CLAIMANT",
        created_by: adminUser.id,
        max_uses: 1,
      });

      // Register new user
      const newUserId = `u-new-${Date.now()}`;
      const newProfile: Profile = {
        id: newUserId,
        email: "new.leader@example.com",
        full_name: "", // Not yet onboarded
        status: "ACTIVE",
        onboarding_completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.getProfiles().push(newProfile);

      const updated = db.consumeSignupInvitation(raw_token, newUserId);
      expect(updated.roles).toEqual(["CLAIMANT"]);
      expect(updated.ministry_id).toBeNull();
      expect(updated.onboarding_completed_at).toBeNull();

      // Single-use token is now exhausted
      const reValidation = db.validateSignupInvitation(raw_token);
      expect(reValidation.valid).toBe(false);
      expect(reValidation.reason).toContain("maximum usage limit");
    });
  });

  describe("4. First-Login Onboarding Lifecycle", () => {
    it("should correctly identify onboarding completion state and reject email alias as name", () => {
      const notOnboarded: Profile = {
        id: "u-1",
        email: "u1@example.com",
        full_name: "",
        status: "ACTIVE",
        onboarding_completed_at: null,
        created_at: "",
        updated_at: "",
      };
      expect(isOnboardingCompleted(notOnboarded)).toBe(false);
      expect(isOnboardingCompleted(null)).toBe(false);

      // Email alias as full_name is invalid
      const aliasName: Profile = {
        ...notOnboarded,
        full_name: "u1",
        onboarding_completed_at: "2026-09-10T12:00:00Z",
      };
      expect(isRealFullName(aliasName.full_name, aliasName.email)).toBe(false);
      expect(isOnboardingCompleted(aliasName)).toBe(false);

      const onboarded: Profile = {
        ...notOnboarded,
        full_name: "Sarah Tan",
        onboarding_completed_at: "2026-09-10T12:00:00Z",
      };
      expect(isRealFullName(onboarded.full_name, onboarded.email)).toBe(true);
      expect(isOnboardingCompleted(onboarded)).toBe(true);
    });

    it("should complete onboarding by updating full_name, phone, and onboarding_completed_at", () => {
      const userId = `u-onboard-${Date.now()}`;
      const profile: Profile = {
        id: userId,
        email: "onboard.user@example.com",
        full_name: "",
        phone: null,
        status: "ACTIVE",
        onboarding_completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.getProfiles().push(profile);

      expect(() => {
        db.completeOnboarding(userId, { full_name: "   " });
      }).toThrow(/full name is required/i);

      const completed = db.completeOnboarding(userId, {
        full_name: "Pastor David Lee",
        phone: "+60 12-888 7777",
      });

      expect(completed.full_name).toBe("Pastor David Lee");
      expect(completed.phone).toBe("+60 12-888 7777");
      expect(completed.onboarding_completed_at).toBeDefined();
      expect(isOnboardingCompleted(completed)).toBe(true);
    });
  });

  describe("5. Simplified Role Permission Matrix", () => {
    const leader: Profile = {
      id: "u-leader",
      email: "leader@example.com",
      full_name: "Claimant",
      status: "ACTIVE",
      onboarding_completed_at: "2026-01-01T00:00:00Z",
      roles: ["CLAIMANT"],
      created_at: "",
      updated_at: "",
    };

    const finance: Profile = {
      id: "u-finance",
      email: "finance@example.com",
      full_name: "Finance Officer",
      status: "ACTIVE",
      onboarding_completed_at: "2026-01-01T00:00:00Z",
      roles: ["FINANCE_OFFICER"],
      created_at: "",
      updated_at: "",
    };

    const admin: Profile = {
      id: "u-admin",
      email: "admin@example.com",
      full_name: "System Admin",
      status: "ACTIVE",
      onboarding_completed_at: "2026-01-01T00:00:00Z",
      roles: ["SYSTEM_ADMIN"],
      created_at: "",
      updated_at: "",
    };

    it("canUserCreateClaim allows CLAIMANT, TEAM_LEAD, FINANCE_OFFICER, and SYSTEM_ADMIN", () => {
      expect(canUserCreateClaim(leader)).toBe(true);
      expect(canUserCreateClaim(admin)).toBe(true);
      expect(canUserCreateClaim(finance)).toBe(true);
      expect(canUserCreateClaim({ ...finance, roles: [] })).toBe(true);
      expect(canUserCreateClaim({ ...finance, status: "INACTIVE" })).toBe(false);
    });

    it("canUserRecordPayment allows only FINANCE_OFFICER and SYSTEM_ADMIN", () => {
      const claim = {
        ...db.getClaims(admin)[0],
        status: "APPROVED_FOR_PAYMENT" as const,
        submitted_by_user_id: "other-user-id",
        claimant_id: "other-user-id",
      };
      expect(canUserRecordPayment(finance, claim)).toBe(true);
      expect(canUserRecordPayment(admin, claim)).toBe(true);
      expect(canUserRecordPayment(leader, claim)).toBe(false);
    });

    it("Finance retains system management access", () => {
      expect(canUserManageSystem(admin)).toBe(true);
      expect(canUserManageSystem(finance)).toBe(true);
      expect(canUserManageSystem(leader)).toBe(false);
    });

    it("canUserReviewClaim enforces self-review prevention", () => {
      const claim = db.submitClaim({
        submitted_by_user_id: leader.id,
        claimant_name: "Volunteer Peter",
        claimant_email: "peter@example.com",
        claimant_phone: "+60 12-333 4444",
        ministry_id: "m-youth-01",
        claim_date: "2026-09-02",
        purpose: "Stationery",
        declaration_accepted: true,
        expenses: [
          { temp_id: "t1", expense_date: "2026-09-01", expense_category_id: "cat-supplies-04", cost_centre_id: "cc-youth-01", description: "Markers", amount: 25.00, sort_order: 1 },
        ],
        attachments: [
          { temp_id: "t1", original_filename: "receipt.jpg", storage_path: "receipts/receipt.jpg", file_size: 1000, mime_type: "image/jpeg", file_category: "RECEIPT", uploaded_by: leader.id },
        ],
      });

      // Submitter cannot review/approve their own claim
      expect(canUserReviewClaim(leader, claim)).toBe(false);
      expect(canUserApproveClaim(leader, claim)).toBe(false);

      // Independent Finance Officer CAN review/approve
      expect(canUserReviewClaim(finance, claim)).toBe(true);
      expect(canUserApproveClaim(finance, claim)).toBe(true);
    });
  });

  describe("6. Signup Form Password Strength & Validation Rules", () => {
    function evaluatePassword(password: string) {
      const hasMinLength = password.length >= 8;
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);
      const hasGoodLength = password.length >= 12;

      let score = 0;
      if (hasMinLength) score += 1;
      if (hasUppercase && hasLowercase) score += 1;
      if (hasNumber) score += 1;
      if (hasSpecial) score += 1;
      if (hasGoodLength) score += 1;

      return {
        hasMinLength,
        hasUpperAndLower: hasUppercase && hasLowercase,
        hasNumber,
        hasSpecial,
        hasGoodLength,
        score,
        isValid: hasMinLength,
      };
    }

    it("should reject passwords under 8 characters", () => {
      const short = evaluatePassword("Abc1!");
      expect(short.hasMinLength).toBe(false);
      expect(short.isValid).toBe(false);
    });

    it("should calculate higher scores for strong passwords with mixed case, numbers, symbols, and length", () => {
      const weak = evaluatePassword("password");
      expect(weak.score).toBe(1); // min length only

      const medium = evaluatePassword("Password123");
      expect(medium.score).toBe(3); // min length, upper+lower, number

      const strong = evaluatePassword("Church!P@ss2026#Live");
      expect(strong.score).toBe(5); // all 5 criteria
      expect(strong.hasGoodLength).toBe(true);
      expect(strong.hasSpecial).toBe(true);
      expect(strong.isValid).toBe(true);
    });

    it("should persist full_name upon consuming invitation and creating profile", () => {
      const { raw_token } = db.createSignupInvitation({
        role_code: "CLAIMANT",
        created_by: adminUser.id,
      });

      const newUserId = `u-named-${Date.now()}`;
      const newProfile: Profile = {
        id: newUserId,
        email: "pastor.david@example.com",
        full_name: "Pastor David Tan",
        status: "ACTIVE",
        onboarding_completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.getProfiles().push(newProfile);

      const consumed = db.consumeSignupInvitation(raw_token, newUserId);
      expect(consumed.full_name).toBe("Pastor David Tan");
      expect(consumed.roles).toEqual(["CLAIMANT"]);
    });
  });
});
