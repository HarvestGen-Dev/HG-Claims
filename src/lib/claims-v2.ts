import type {
  DirectoryKind,
  ExpenseCategory,
  Ministry,
} from "./types/database";

export const EXPENSE_CLASSIFICATIONS = [
  ["V2_FOOD", "Food & drinks"],
  ["V2_TRANSPORT", "Transport, parking & toll"],
  ["V2_ACCOMMODATION", "Accommodation"],
  ["V2_SPEAKER", "Speaker fee / honorarium"],
  ["V2_GIFTS", "Gifts & appreciation"],
  [
    "V2_MEMBER_CARE",
    "Member care (flowers, wreaths, hospital visits, condolence)",
  ],
  ["V2_SUPPLIES", "Supplies & consumables"],
  ["V2_PRINTING", "Printing & stationery"],
  ["V2_EQUIPMENT", "Equipment or item to keep"],
  ["V2_REPAIR", "Repair & servicing"],
  ["V2_TRAINING", "Training, conference & course fees"],
  ["V2_SUBSCRIPTION", "Subscription & software"],
  ["V2_SETUP", "Event setup & rental"],
  ["V2_SUPPORT", "Support or donation (person or church)"],
  ["V2_OTHER", "Other (must explain)"],
  ["V2_UTILITIES", "Utilities"],
] as const;
export const BENEFICIARY_CATEGORY_CODES = new Set([
  "V2_FOOD",
  "V2_TRANSPORT",
  "V2_ACCOMMODATION",
  "V2_GIFTS",
  "V2_MEMBER_CARE",
  "V2_SUPPORT",
]);
export function needsBeneficiary(
  category?: Pick<ExpenseCategory, "code"> | null,
): boolean {
  return !!category && BENEFICIARY_CATEGORY_CODES.has(category.code);
}
export const CONTEXT_LABELS: Record<DirectoryKind, string> = {
  SPEAKER: "Speaker name",
  EVENT: "Event name",
  MISSION: "Mission / outreach name",
  MEETING: "Meeting / conference name",
};
export function teamContextKind(team?: Ministry): DirectoryKind | null {
  return team?.context_kind || null;
}
export function validateItemClassification(
  item: {
    expense_category_id?: string | null;
    description?: string;
    beneficiary_type?: string | null;
  },
  categories: ExpenseCategory[],
): string | null {
  const category = categories.find((c) => c.id === item.expense_category_id);
  if (!category) return "Choose What was it?";
  if (category.code === "V2_OTHER" && !item.description?.trim())
    return "Other requires an explanation.";
  if (
    needsBeneficiary(category) &&
    !["INTERNAL", "EXTERNAL"].includes(item.beneficiary_type || "")
  )
    return "Choose Who was it for?";
  return null;
}
