import type { RoleCode } from "@/lib/types/database";

export const roleLabels = {
  FINANCE: "Finance",
  CLAIMANT: "Claimant",
  TEAM_LEAD: "Team Lead",
  FINANCE_OFFICER: "Finance",
  AUDITOR: "Auditor",
  SYSTEM_ADMIN: "Finance",
} satisfies Record<RoleCode, string>;

export function formatRole(role: string): string {
  if (role === "MINISTRY_LEADER") return "Claimant";
  return roleLabels[role as RoleCode] || role.replaceAll("_", " ");
}

/** Deduplicate current privileges when displaying historical/cached role grants. */
export function currentUserRoles(roles?: readonly string[] | null): RoleCode[] {
  const current = (roles || []).flatMap((role): RoleCode[] => {
    if (["FINANCE", "FINANCE_OFFICER", "SYSTEM_ADMIN"].includes(role))
      return ["FINANCE"];
    return role === "TEAM_LEAD" ? ["TEAM_LEAD"] : [];
  });
  return Array.from(new Set(current));
}
