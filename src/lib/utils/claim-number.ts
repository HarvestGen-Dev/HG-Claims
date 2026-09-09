export function formatClaimNumber(prefix: string = "NLCC", year: number | string = 2026, sequence: number = 1): string {
  const padSeq = String(sequence).padStart(6, "0");
  return `${prefix}-${year}-${padSeq}`;
}

export function parseClaimNumber(claimNumber: string): { prefix: string; year: number; sequence: number } | null {
  const regex = /^([A-Z0-9]+)-(\d{4})-(\d+)$/;
  const match = claimNumber.match(regex);
  if (!match) return null;
  return {
    prefix: match[1],
    year: parseInt(match[2], 10),
    sequence: parseInt(match[3], 10),
  };
}
