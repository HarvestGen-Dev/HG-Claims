import { describe, it, expect } from "vitest";
import { formatClaimNumber, parseClaimNumber } from "@/lib/utils/claim-number";

describe("Claim Number Generator", () => {
  it("should format claim number with prefix, year, and 6-digit sequence", () => {
    const claimNo = formatClaimNumber("NLCC", 2026, 123);
    expect(claimNo).toBe("NLCC-2026-000123");
  });

  it("should pad small sequence numbers correctly", () => {
    const claimNo = formatClaimNumber("NLCC", 2026, 1);
    expect(claimNo).toBe("NLCC-2026-000001");
  });

  it("should parse a valid claim number into its components", () => {
    const parsed = parseClaimNumber("NLCC-2026-000123");
    expect(parsed).toEqual({
      prefix: "NLCC",
      year: 2026,
      sequence: 123,
    });
  });

  it("should return null for invalid claim number format", () => {
    const parsed = parseClaimNumber("INVALID-CLAIM-FORMAT");
    expect(parsed).toBeNull();
  });
});
