export interface BankInfo {
  id: string;
  name: string;
  shortName: string;
  category: "Commercial" | "Islamic" | "Digital" | "Development" | "Foreign";
  swiftCode?: string;
}

export const MALAYSIAN_BANKS: BankInfo[] = [
  // Commercial Banks
  { id: "maybank", name: "Malayan Banking Berhad (Maybank)", shortName: "Maybank", category: "Commercial", swiftCode: "MBBEMYKL" },
  { id: "cimb", name: "CIMB Bank Berhad", shortName: "CIMB Bank", category: "Commercial", swiftCode: "CIBBMYKL" },
  { id: "public_bank", name: "Public Bank Berhad", shortName: "Public Bank", category: "Commercial", swiftCode: "PBBEMYKL" },
  { id: "rhb", name: "RHB Bank Berhad", shortName: "RHB Bank", category: "Commercial", swiftCode: "RHBBMYKL" },
  { id: "hong_leong", name: "Hong Leong Bank Berhad", shortName: "Hong Leong Bank", category: "Commercial", swiftCode: "HLBBMYKL" },
  { id: "ambank", name: "AmBank (M) Berhad", shortName: "AmBank", category: "Commercial", swiftCode: "ARBKMYKL" },
  { id: "alliance", name: "Alliance Bank Malaysia Berhad", shortName: "Alliance Bank", category: "Commercial", swiftCode: "MFBBMYKL" },
  { id: "affin", name: "Affin Bank Berhad", shortName: "Affin Bank", category: "Commercial", swiftCode: "ABBBMYKL" },

  // Islamic Banks
  { id: "bank_islam", name: "Bank Islam Malaysia Berhad", shortName: "Bank Islam", category: "Islamic", swiftCode: "BIMBMYKL" },
  { id: "bank_muamalat", name: "Bank Muamalat Malaysia Berhad", shortName: "Bank Muamalat", category: "Islamic", swiftCode: "BMMBMYKL" },
  { id: "mbsb", name: "MBSB Bank Berhad", shortName: "MBSB Bank", category: "Islamic", swiftCode: "MBSBMYKL" },
  { id: "maybank_islamic", name: "Maybank Islamic Berhad", shortName: "Maybank Islamic", category: "Islamic" },
  { id: "cimb_islamic", name: "CIMB Islamic Bank Berhad", shortName: "CIMB Islamic", category: "Islamic" },
  { id: "rhb_islamic", name: "RHB Islamic Bank Berhad", shortName: "RHB Islamic", category: "Islamic" },
  { id: "hong_leong_islamic", name: "Hong Leong Islamic Bank Berhad", shortName: "Hong Leong Islamic", category: "Islamic" },
  { id: "public_islamic", name: "Public Islamic Bank Berhad", shortName: "Public Islamic", category: "Islamic" },
  { id: "ambank_islamic", name: "AmBank Islamic Berhad", shortName: "AmBank Islamic", category: "Islamic" },
  { id: "affin_islamic", name: "Affin Islamic Bank Berhad", shortName: "Affin Islamic", category: "Islamic" },
  { id: "al_rajhi", name: "Al Rajhi Banking & Investment Corporation (Malaysia) Berhad", shortName: "Al Rajhi Bank", category: "Islamic", swiftCode: "RJHIMYKL" },
  { id: "kuwait_finance", name: "Kuwait Finance House (Malaysia) Berhad", shortName: "Kuwait Finance House", category: "Islamic", swiftCode: "KFHBMYKL" },

  // Digital Banks & Neobanks
  { id: "gxbank", name: "GX Bank Berhad (GXBank)", shortName: "GXBank", category: "Digital" },
  { id: "boost_bank", name: "Boost Bank Berhad", shortName: "Boost Bank", category: "Digital" },
  { id: "aeon_bank", name: "AEON Bank (M) Berhad", shortName: "AEON Bank", category: "Digital" },
  { id: "rize", name: "Rize (by Al Rajhi Bank)", shortName: "Rize", category: "Digital" },

  // Development Financial Institutions & Savings Banks
  { id: "bsn", name: "Bank Simpanan Nasional (BSN)", shortName: "BSN", category: "Development", swiftCode: "BSNAMYKL" },
  { id: "bank_rakyat", name: "Bank Kerjasama Rakyat Malaysia Berhad (Bank Rakyat)", shortName: "Bank Rakyat", category: "Development", swiftCode: "BKRMMYKL" },
  { id: "agrobank", name: "Bank Pertanian Malaysia Berhad (Agrobank)", shortName: "Agrobank", category: "Development", swiftCode: "AGROMYKL" },
  { id: "sme_bank", name: "Small and Medium Enterprise Development Bank Malaysia Berhad (SME Bank)", shortName: "SME Bank", category: "Development" },
  { id: "exim_bank", name: "Export-Import Bank of Malaysia Berhad (EXIM Bank)", shortName: "EXIM Bank", category: "Development" },

  // Foreign Commercial Banks
  { id: "uob", name: "United Overseas Bank (Malaysia) Berhad (UOB)", shortName: "UOB Malaysia", category: "Foreign", swiftCode: "UOVBMYKL" },
  { id: "ocbc", name: "OCBC Bank (Malaysia) Berhad", shortName: "OCBC Bank", category: "Foreign", swiftCode: "OCBCMYKL" },
  { id: "standard_chartered", name: "Standard Chartered Bank Malaysia Berhad", shortName: "Standard Chartered", category: "Foreign", swiftCode: "SCBLMYKL" },
  { id: "hsbc", name: "HSBC Bank Malaysia Berhad", shortName: "HSBC Bank", category: "Foreign", swiftCode: "HBMBMYKL" },
  { id: "citibank", name: "Citibank Berhad", shortName: "Citibank", category: "Foreign", swiftCode: "CITIMYKL" },
  { id: "boc", name: "Bank of China (Malaysia) Berhad", shortName: "Bank of China", category: "Foreign", swiftCode: "BKCHMYKL" },
  { id: "icbc", name: "Industrial and Commercial Bank of China (ICBC Malaysia)", shortName: "ICBC Malaysia", category: "Foreign", swiftCode: "ICBKMYKL" },
  { id: "smbc", name: "Sumitomo Mitsui Banking Corporation Malaysia Berhad", shortName: "SMBC Malaysia", category: "Foreign", swiftCode: "SMBCMYKL" },
  { id: "mufg", name: "MUFG Bank (Malaysia) Berhad", shortName: "MUFG Bank", category: "Foreign", swiftCode: "BOTKMYKL" },
  { id: "mizuho", name: "Mizuho Bank (Malaysia) Berhad", shortName: "Mizuho Bank", category: "Foreign", swiftCode: "MHCBMYKL" },
  { id: "bangkok_bank", name: "Bangkok Bank Berhad", shortName: "Bangkok Bank", category: "Foreign", swiftCode: "BKKBMYKL" },
  { id: "bnp_paribas", name: "BNP Paribas Malaysia Berhad", shortName: "BNP Paribas", category: "Foreign", swiftCode: "BNPAMYKL" },
  { id: "deutsche_bank", name: "Deutsche Bank (Malaysia) Berhad", shortName: "Deutsche Bank", category: "Foreign", swiftCode: "DEUTMYKL" },
  { id: "jp_morgan", name: "J.P. Morgan Chase Bank Berhad", shortName: "J.P. Morgan", category: "Foreign", swiftCode: "CHASMYKL" },
];

export const BANK_CATEGORIES = [
  { key: "Commercial", label: "Commercial Banks" },
  { key: "Islamic", label: "Islamic Banks" },
  { key: "Digital", label: "Digital & Neobanks" },
  { key: "Development", label: "Development & Savings Financial Institutions" },
  { key: "Foreign", label: "Foreign Banks in Malaysia" },
] as const;

export function getBankByNameOrShortName(name?: string | null): BankInfo | undefined {
  if (!name) return undefined;
  const normalized = name.toLowerCase().trim();
  return MALAYSIAN_BANKS.find(
    (b) =>
      b.shortName.toLowerCase() === normalized ||
      b.name.toLowerCase() === normalized ||
      b.id.toLowerCase() === normalized
  );
}
