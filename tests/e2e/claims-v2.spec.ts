import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
const fixture = JSON.parse(
  readFileSync("/private/tmp/hg-v2-browser-fixtures.json", "utf8"),
);
test.beforeEach(async ({ page }) => {
  await page.route("**/auth/v1/**", (route) =>
    new URL(route.request().url()).origin === fixture.api
      ? route.continue()
      : route.abort(),
  );
});
async function login(page: import("@playwright/test").Page, role = "member") {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(fixture.users[role].email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(fixture.users[role].password);
  const tokenRequest = page.waitForRequest((r) =>
    r.url().includes("/auth/v1/token"),
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(new URL((await tokenRequest).url()).origin).toBe(fixture.api);
  await page.waitForURL("**/dashboard", { timeout: 30000 });
}
test("roleless member submits on narrow mobile viewport and duplicates all attachments", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByText("Team annual budgets")).toHaveCount(0);
  await page.goto("/claims/new");
  await expect(
    page.getByRole("heading", { name: "Receipt / invoice photos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Take a photo" }),
  ).toBeVisible();
  await expect(page.getByText("Declaration:", { exact: true })).toHaveCount(0);
  expect(
    await page
      .locator("body")
      .evaluate((e) => e.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.locator("#ministryId").selectOption(fixture.team);
  await page.locator('[id="receipt-0-category"]').selectOption({
    label: "Member care (flowers, wreaths, hospital visits, condolence)",
  });
  await expect(page.getByLabel("Who was it for? *")).toBeVisible();
  await page.locator('[id="receipt-0-beneficiary"]').selectOption("INTERNAL");
  await page
    .locator('[id="receipt-0-category"]')
    .selectOption({ label: "Utilities" });
  await expect(page.getByLabel("Who was it for? *")).toHaveCount(0);
  await page.locator('[id="receipt-0-amount"]').fill("12.34");
  await page
    .getByRole("button", { name: "Submit Claim", exact: true })
    .last()
    .click();
  await page.waitForURL(/\/claims\/[a-f0-9-]+$/, { timeout: 30000 });
  await expect(
    page.getByText("Submitted", { exact: true }).first(),
  ).toBeVisible();
  await page.goto(`/claims/${fixture.claim}`);
  await expect(page.getByText("Receipts & Documents (2)")).toBeVisible();
  await page.getByRole("button", { name: "Duplicate Claim" }).click();
  await page.waitForURL("**/edit");
  await expect(page.locator("#claimantName")).toHaveValue("Preserved Payee");
  await expect(page.locator("#ministryId")).toHaveValue("");
  await expect(page.locator("#purpose")).toHaveValue("");
  await expect(page.locator('[id="receipt-0-amount"]')).toHaveValue("");
  await expect(
    page.getByRole("button", { name: /Remove receipt-[01]\.png/ }),
  ).toHaveCount(2);
  await page.screenshot({
    path: "/private/tmp/hg-v2-mobile-duplicate.png",
    fullPage: true,
  });
});
test("Finance sees new management screens and bank export preserves binary snapshot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "finance");
  for (const [url, title] of [
    ["/admin/suppliers", "Suppliers and payment details"],
    ["/admin/dropdowns", "Dropdown lists"],
    ["/admin/categories", "Expense classifications"],
    ["/finance/recurring", "Recurring utility bills"],
    ["/finance/jompay", "JomPAY bills"],
  ] as const) {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/finance/recurring");
  await expect(
    page.getByRole("heading", { name: "Recurring utility bills", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/hg-v2-desktop-recurring.png",
    fullPage: true,
  });
  const client = createClient(fixture.api, fixture.anon, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword(fixture.users.finance);
  const command = async (action: string, payload: unknown) => {
    const r = await client.rpc("nlcc_command", { action, payload });
    expect(r.error).toBeNull();
    return r.data;
  };
  // Test real HTTP download with an actual frozen local database batch.
  const snapshot = await client.rpc("nlcc_snapshot");
  const eligible = snapshot.data.claims.filter(
    (c: {
      status: string;
      payee_payment_method: string;
      active_batch_id: string | null;
    }) =>
      c.status === "APPROVED_FOR_PAYMENT" &&
      c.payee_payment_method === "BANK_TRANSFER" &&
      !c.active_batch_id,
  );
  expect(eligible.length).toBeGreaterThan(0);
  const batch = await command("finalize_reimbursement_batch", {
    claim_ids: [eligible[0].id],
    request_key: crypto.randomUUID(),
  });
  const one = await page.request.get(
    `/api/v1/finance/batches/${batch.id}/export`,
  );
  expect(one.status()).toBe(200);
  expect(one.headers()["x-template-version"]).toBe("SBP_BIFF8_V1");
  const first = await one.body();
  expect(first.subarray(0, 8).toString("hex")).toBe("d0cf11e0a1b11ae1");
  const two = await page.request.get(
    `/api/v1/finance/batches/${batch.id}/export`,
  );
  expect(two.status()).toBe(200);
  expect((await two.body()).equals(first)).toBe(true);
  const latest = await client.rpc("nlcc_claim_detail", {
    p_claim_id: eligible[0].id,
  });
  expect(latest.data.claim.status).toBe("APPROVED_FOR_PAYMENT");
  await command("void_reimbursement_batch", {
    batch_id: batch.id,
    void_reason: "Local browser verification finished",
  });
});

test("submission does not wait for receipt upload and later attachment is retained", async ({
  page,
}) => {
  await login(page);
  await page.goto("/claims/new");
  await page.locator("#ministryId").selectOption(fixture.team);
  await page
    .locator('[id="receipt-0-category"]')
    .selectOption({ label: "Utilities" });
  await page.locator('[id="receipt-0-amount"]').fill("5.20");
  let release: (() => void) | undefined;
  const uploadGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/storage/v1/object/receipts/**", async (route) => {
    if (route.request().method() === "POST") await uploadGate;
    await route.continue();
  });
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "late-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Submit Claim", exact: true }).click();
  await page.waitForURL(/\/claims\/[a-f0-9-]+$/);
  release!();
  await expect(page.getByText("late-receipt.png", { exact: true })).toBeVisible(
    { timeout: 15000 },
  );
});

test("JomPAY downloads the supplied B1 layout and records upload without completing payment", async ({
  page,
}) => {
  await login(page, "finance");
  const client = createClient(fixture.api, fixture.anon, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword(fixture.users.finance);
  const getBatch = async () => {
    const r = await client.rpc("nlcc_snapshot");
    expect(r.error).toBeNull();
    return r.data.reimbursementBatches.find(
      (b: { id: string }) => b.id === fixture.jompayBatch,
    );
  };
  const original = await getBatch();
  expect(original.instructions).toHaveLength(2);
  const claimIds = original.instructions.flatMap(
    (i: { claims: { claim_id: string }[] }) => i.claims.map((c) => c.claim_id),
  );
  await page.goto(`/finance/batches/${fixture.jompayBatch}`);
  await expect(
    page.getByRole("heading", { name: "Bank file and upload" }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JomPAY XLSX" }).click();
  const download = await downloadEvent;
  await download.saveAs("/private/tmp/hg-jompay-template-work/export.xlsx");
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const path = await download.path();
  const bytes = readFileSync(path!);
  const wb = XLSX.read(bytes, { type: "buffer", cellNF: true });
  expect(wb.SheetNames).toEqual(["Sheet1"]);
  expect(wb.Sheets.Sheet1["!ref"]).toBe("A1:G3");
  expect(wb.Sheets.Sheet1.A2).toMatchObject({ t: "s", v: "000999", z: "@" });
  expect(wb.Sheets.Sheet1.B2).toMatchObject({ t: "s", v: "0000888", z: "@" });
  expect(wb.Sheets.Sheet1.D2.t).toBe("s");
  expect(wb.Sheets.Sheet1.D2.v).toMatch(/^\d+\.\d{2}$/);
  const exported = await getBatch();
  expect(exported.exported_file_hash_sha256).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  expect(exported.status).toBe("EXPORTED");
  const repeat = await page.request.get(
    `/api/v1/finance/batches/${fixture.jompayBatch}/export`,
  );
  expect(repeat.status()).toBe(200);
  expect(repeat.headers()["x-template-version"]).toBe("JOMPAY_BULK_B1_XLSX_V1");
  expect((await repeat.body()).equals(bytes)).toBe(true);
  await page
    .getByLabel("Bank upload reference", { exact: true })
    .fill("LOCAL-BROWSER-JOMPAY");
  await page
    .getByRole("button", { name: "Record Bank Upload", exact: true })
    .click();
  await expect(
    page.getByText("Bank upload recorded: LOCAL-BROWSER-JOMPAY", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await getBatch()).status).toBe("SUBMITTED_TO_BANK");
  for (const id of claimIds) {
    const r = await client.rpc("nlcc_claim_detail", { p_claim_id: id });
    expect(r.data.claim.status).toBe("APPROVED_FOR_PAYMENT");
  }
  await page
    .getByLabel("Payment confirmation reference", { exact: true })
    .fill("LOCAL-COMPLETION-ONLY");
  await page
    .getByRole("button", { name: "Confirm Processed", exact: true })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        (await getBatch()).instructions.filter(
          (i: { status: string }) => i.status === "PAID",
        ).length,
    )
    .toBe(1);
  const reconciled = await getBatch();
  const completed = reconciled.instructions.find(
    (i: { status: string }) => i.status === "PAID",
  );
  const paid = await client.rpc("nlcc_claim_detail", {
    p_claim_id: completed.claims[0].claim_id,
  });
  expect(paid.data.claim.status).toBe("PAID");
  expect(paid.data.claim.payment.payment_method).toBe("JOMPAY");
});

test("Finance creates and edits a JomPAY supplier without bank-transfer details", async ({
  page,
}) => {
  await login(page, "finance");
  await page.goto("/admin/suppliers");
  const name = `JomPAY supplier browser ${Date.now()}`;
  await page.getByLabel("Supplier name", { exact: true }).fill(name);
  await page
    .getByLabel("Payment method", { exact: true })
    .selectOption("JOMPAY");
  await expect(page.getByLabel("Account number", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Biller name", { exact: true })
    .fill("Local test biller");
  await page.getByLabel("Biller Code", { exact: true }).fill("000123");
  await page.getByLabel("Reference 1", { exact: true }).fill("00000456");
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  const supplier = page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(supplier).toBeVisible();
  await expect(supplier.getByText("Unverified", { exact: true })).toBeVisible();
  await supplier.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Account number", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Reference 1", { exact: true }).fill("00000789");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Add supplier", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Enter a valid bank account/)).toHaveCount(0);
});
