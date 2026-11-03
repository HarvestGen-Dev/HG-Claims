import contract from "./HG_Bank_Template_Contract.json";

export interface BankInfo {
  id: string;
  /** Exact Bank Name from the Alliance Bank SBP Bank List worksheet */
  name: string;
  shortName: string;
  category: "Commercial" | "Islamic" | "Development" | "Foreign";
  /** Canonical 8-character SWIFT code from the Alliance Bank SBP Bank List worksheet */
  swiftCode: string;
  /** LIP for Alliance Bank (MFBBMYKL), LGP for all other supported banks */
  paymentMode: "LIP" | "LGP";
  /** Legacy / alternative names that resolve to this canonical bank entry */
  aliases?: string[];
}

export const ALLIANCE_BANK_SWIFT_CODE = contract.allianceBankCanonicalCode; // "MFBBMYKL"
export const BANK_TEMPLATE_VERSION = contract.templateVersion; // "SBP_BIFF8_V1"

/**
 * Canonical 31-bank directory matching the exact order, Bank Name, and SWIFT Code
 * of the `Bank List` worksheet in `SBP_Sample - Copy.xls`.
 */
export const MALAYSIAN_BANKS: BankInfo[] = [
  {
    id: "maybank",
    name: "Maybank / Malayan Banking Berhad",
    shortName: "Maybank",
    category: "Commercial",
    swiftCode: "MBBEMYKL",
    paymentMode: "LGP",
    aliases: ["Malayan Banking Berhad (Maybank)", "Maybank Islamic Berhad", "Maybank Islamic"],
  },
  {
    id: "cimb",
    name: "CIMB Bank",
    shortName: "CIMB Bank",
    category: "Commercial",
    swiftCode: "CIBBMYKL",
    paymentMode: "LGP",
    aliases: ["CIMB Bank Berhad"],
  },
  {
    id: "cimb_islamic",
    name: "CIMB Islamic Bank",
    shortName: "CIMB Islamic",
    category: "Islamic",
    swiftCode: "CTBBMYKL",
    paymentMode: "LGP",
    aliases: ["CIMB Islamic Bank Berhad"],
  },
  {
    id: "public_bank",
    name: "Public Bank",
    shortName: "Public Bank",
    category: "Commercial",
    swiftCode: "PBBEMYKL",
    paymentMode: "LGP",
    aliases: ["Public Bank Berhad"],
  },
  {
    id: "public_islamic",
    name: "Public Islamic Bank",
    shortName: "Public Islamic",
    category: "Islamic",
    swiftCode: "PIBEMYK1",
    paymentMode: "LGP",
    aliases: ["Public Islamic Bank Berhad"],
  },
  {
    id: "rhb",
    name: "RHB Bank",
    shortName: "RHB Bank",
    category: "Commercial",
    swiftCode: "RHBBMYKL",
    paymentMode: "LGP",
    aliases: ["RHB Bank Berhad"],
  },
  {
    id: "rhb_islamic",
    name: "RHB Islamic Bank",
    shortName: "RHB Islamic",
    category: "Islamic",
    swiftCode: "RHBAMYKL",
    paymentMode: "LGP",
    aliases: ["RHB Islamic Bank Berhad"],
  },
  {
    id: "hong_leong",
    name: "Hong Leong Bank",
    shortName: "Hong Leong Bank",
    category: "Commercial",
    swiftCode: "HLBBMYKL",
    paymentMode: "LGP",
    aliases: ["Hong Leong Bank Berhad"],
  },
  {
    id: "hong_leong_islamic",
    name: "Hong Leong Islamic Bank",
    shortName: "Hong Leong Islamic",
    category: "Islamic",
    swiftCode: "HLIBMYKL",
    paymentMode: "LGP",
    aliases: ["Hong Leong Islamic Bank Berhad"],
  },
  {
    id: "ambank",
    name: "AmBank",
    shortName: "AmBank",
    category: "Commercial",
    swiftCode: "ARBKMYKL",
    paymentMode: "LGP",
    aliases: ["AmBank (M) Berhad", "AmBank Islamic Berhad", "AmBank Islamic"],
  },
  {
    id: "affin",
    name: "Affin Bank",
    shortName: "Affin Bank",
    category: "Commercial",
    swiftCode: "PHBMMYKL",
    paymentMode: "LGP",
    aliases: ["Affin Bank Berhad", "Affin Islamic Bank Berhad", "Affin Islamic"],
  },
  {
    id: "alliance",
    name: "Alliance Bank",
    shortName: "Alliance Bank",
    category: "Commercial",
    swiftCode: "MFBBMYKL",
    paymentMode: "LIP",
    aliases: ["Alliance Bank Malaysia Berhad", "Alliance Islamic Bank"],
  },
  {
    id: "bank_islam",
    name: "Bank Islam Malaysia",
    shortName: "Bank Islam",
    category: "Islamic",
    swiftCode: "BIMBMYKL",
    paymentMode: "LGP",
    aliases: ["Bank Islam Malaysia Berhad"],
  },
  {
    id: "bank_muamalat",
    name: "Bank Muamalat Malaysia",
    shortName: "Bank Muamalat",
    category: "Islamic",
    swiftCode: "BMMBMYKL",
    paymentMode: "LGP",
    aliases: ["Bank Muamalat Malaysia Berhad"],
  },
  {
    id: "bank_rakyat",
    name: "Bank Rakyat",
    shortName: "Bank Rakyat",
    category: "Development",
    swiftCode: "BKRMMYKL",
    paymentMode: "LGP",
    aliases: ["Bank Kerjasama Rakyat Malaysia Berhad (Bank Rakyat)"],
  },
  {
    id: "bsn",
    name: "Bank Simpanan Nasional (BSN)",
    shortName: "BSN",
    category: "Development",
    swiftCode: "BSNAMYK1",
    paymentMode: "LGP",
  },
  {
    id: "agrobank",
    name: "Agrobank",
    shortName: "Agrobank",
    category: "Development",
    swiftCode: "AGOBMYKL",
    paymentMode: "LGP",
    aliases: ["Bank Pertanian Malaysia Berhad (Agrobank)"],
  },
  {
    id: "ocbc",
    name: "OCBC Bank Malaysia",
    shortName: "OCBC Bank",
    category: "Foreign",
    swiftCode: "OCBCMYKL",
    paymentMode: "LGP",
    aliases: ["OCBC Bank (Malaysia) Berhad"],
  },
  {
    id: "ocbc_al_amin",
    name: "OCBC Al-Amin",
    shortName: "OCBC Al-Amin",
    category: "Islamic",
    swiftCode: "OABBMYKL",
    paymentMode: "LGP",
    aliases: ["OCBC Al-Amin Bank Berhad"],
  },
  {
    id: "hsbc",
    name: "HSBC Bank Malaysia",
    shortName: "HSBC Bank",
    category: "Foreign",
    swiftCode: "HBMBMYKL",
    paymentMode: "LGP",
    aliases: ["HSBC Bank Malaysia Berhad"],
  },
  {
    id: "hsbc_amanah",
    name: "HSBC Amanah",
    shortName: "HSBC Amanah",
    category: "Islamic",
    swiftCode: "HMABMYKL",
    paymentMode: "LGP",
    aliases: ["HSBC Amanah Malaysia Berhad"],
  },
  {
    id: "standard_chartered",
    name: "Standard Chartered Malaysia",
    shortName: "Standard Chartered",
    category: "Foreign",
    swiftCode: "SCBLMYKX",
    paymentMode: "LGP",
    aliases: ["Standard Chartered Bank Malaysia Berhad"],
  },
  {
    id: "uob",
    name: "UOB Malaysia",
    shortName: "UOB Malaysia",
    category: "Foreign",
    swiftCode: "UOVBMYKL",
    paymentMode: "LGP",
    aliases: ["United Overseas Bank (Malaysia) Berhad (UOB)", "UOB"],
  },
  {
    id: "boc",
    name: "Bank of China Malaysia",
    shortName: "Bank of China",
    category: "Foreign",
    swiftCode: "BKCHMYKL",
    paymentMode: "LGP",
    aliases: ["Bank of China (Malaysia) Berhad"],
  },
  {
    id: "citibank",
    name: "Citibank Malaysia",
    shortName: "Citibank",
    category: "Foreign",
    swiftCode: "CITIMYKL",
    paymentMode: "LGP",
    aliases: ["Citibank Berhad"],
  },
  {
    id: "deutsche_bank",
    name: "Deutsche Bank Malaysia",
    shortName: "Deutsche Bank",
    category: "Foreign",
    swiftCode: "DEUTMYKL",
    paymentMode: "LGP",
    aliases: ["Deutsche Bank (Malaysia) Berhad"],
  },
  {
    id: "jp_morgan",
    name: "J.P. Morgan Chase Bank Malaysia",
    shortName: "J.P. Morgan",
    category: "Foreign",
    swiftCode: "CHASMYKX",
    paymentMode: "LGP",
    aliases: ["J.P. Morgan Chase Bank Berhad"],
  },
  {
    id: "mizuho",
    name: "Mizuho Bank Malaysia",
    shortName: "Mizuho Bank",
    category: "Foreign",
    swiftCode: "MHCBMYKA",
    paymentMode: "LGP",
    aliases: ["Mizuho Bank (Malaysia) Berhad"],
  },
  {
    id: "smbc",
    name: "Sumitomo Mitsui Banking Corporation Malaysia",
    shortName: "SMBC Malaysia",
    category: "Foreign",
    swiftCode: "SMBCMYKL",
    paymentMode: "LGP",
    aliases: ["Sumitomo Mitsui Banking Corporation Malaysia Berhad"],
  },
  {
    id: "bofa",
    name: "Bank of America Malaysia",
    shortName: "Bank of America",
    category: "Foreign",
    swiftCode: "BOFAMY2X",
    paymentMode: "LGP",
    aliases: ["Bank of America Malaysia Berhad"],
  },
  {
    id: "kuwait_finance",
    name: "Kuwait Finance House Malaysia",
    shortName: "Kuwait Finance House",
    category: "Islamic",
    swiftCode: "KFHOMYKL",
    paymentMode: "LGP",
    aliases: ["Kuwait Finance House (Malaysia) Berhad"],
  },
];

export const BANK_CATEGORIES = [
  { key: "Commercial", label: "Commercial Banks" },
  { key: "Islamic", label: "Islamic Banks" },
  { key: "Development", label: "Development & Savings Financial Institutions" },
  { key: "Foreign", label: "Foreign Banks in Malaysia" },
] as const;

export function resolveCanonicalBank(nameOrCode?: string | null): BankInfo | undefined {
  if (!nameOrCode) return undefined;
  const normalized = nameOrCode.toLowerCase().trim();
  if (!normalized) return undefined;
  return MALAYSIAN_BANKS.find(
    (b) =>
      b.swiftCode.toLowerCase() === normalized ||
      b.name.toLowerCase() === normalized ||
      b.shortName.toLowerCase() === normalized ||
      b.id.toLowerCase() === normalized ||
      (b.aliases && b.aliases.some((a) => a.toLowerCase() === normalized))
  );
}

export function getBankByNameOrShortName(name?: string | null): BankInfo | undefined {
  return resolveCanonicalBank(name);
}

export function getPaymentModeForBankCode(swiftCode?: string | null): "LIP" | "LGP" | null {
  const bank = resolveCanonicalBank(swiftCode);
  if (!bank) return null;
  return bank.swiftCode === ALLIANCE_BANK_SWIFT_CODE ? "LIP" : "LGP";
}

export function validateBankAccountString(raw?: string | null): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  if (!raw || typeof raw !== "string") {
    return { valid: false, normalized: "", error: "Bank account number is required." };
  }
  const stripped = raw.replace(/[\s\-]/g, "");
  if (!/^\d{6,20}$/.test(stripped)) {
    return {
      valid: false,
      normalized: stripped,
      error: "Bank account number must contain 6 to 20 digits (leading zeroes are preserved).",
    };
  }
  return { valid: true, normalized: stripped };
}

export function maskBankAccountNumber(raw?: string | null): string {
  if (!raw) return "—";
  const cleaned = raw.replace(/[\s\-]/g, "");
  if (cleaned.length <= 4) return cleaned;
  const last4 = cleaned.slice(-4);
  const leadingZerosMatch = cleaned.match(/^(0+)/);
  const prefix = leadingZerosMatch ? leadingZerosMatch[1].slice(0, 2) : "";
  const maskedLen = Math.max(4, cleaned.length - 4 - prefix.length);
  return `${prefix}${"•".repeat(Math.min(maskedLen, 8))}${last4}`;
}
