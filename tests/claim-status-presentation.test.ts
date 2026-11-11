import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";

describe("claim payment status presentation", () => {
  it("shows Processed once after confirmed payment", () => {
    const html = renderToStaticMarkup(
      createElement(ClaimStatusBadge, {
        status: "PAID",
        reimbursementStatus: "PAID",
      }),
    );
    expect(html.match(/Processed/g)).toHaveLength(1);
  });
  it("keeps exported claims Approved with a distinct file-export state", () => {
    const html = renderToStaticMarkup(
      createElement(ClaimStatusBadge, {
        status: "APPROVED_FOR_PAYMENT",
        reimbursementStatus: "EXPORTED_PENDING_CONFIRMATION",
      }),
    );
    expect(html).toContain("Approved");
    expect(html).toContain("File exported");
    expect(html).not.toContain("Processed");
  });
  it("uses failure wording applicable to Bank Transfer and JomPAY", () => {
    const html = renderToStaticMarkup(
      createElement(ClaimStatusBadge, {
        status: "APPROVED_FOR_PAYMENT",
        reimbursementStatus: "FAILED",
      }),
    );
    expect(html).toContain("Transfer failed");
    expect(html).not.toContain("Bank Transfer Failed");
  });
});
