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
