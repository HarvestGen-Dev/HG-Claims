import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
const fixture = JSON.parse(
  readFileSync("/private/tmp/hg-v2-browser-fixtures.json", "utf8"),
);
async function chooseOption(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
  option: { label: string } | { value: string },
) {
  await trigger.click();
  const list = page.getByRole("listbox");
  if ("label" in option) {
    await list.getByRole("option", { name: option.label, exact: true }).click();
  } else {
    await list
      .locator(`[role="option"][data-option-value="${option.value}"]`)
      .click();
  }
}
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
  ).toHaveCount(0);
  await expect(page.getByText("Expense Item 1")).toBeVisible();
  await expect(page.getByText("Receipt / Invoice Upload")).toBeVisible();
  await expect(page.getByText("Take photo")).toBeVisible();
  await expect(page.getByText("Declaration:", { exact: true })).toHaveCount(0);
  expect(
    await page
      .locator("body")
      .evaluate((e) => e.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await chooseOption(page, page.locator('[id="receipt-0-category"]'), {
    label: "Member care (flowers, wreaths, hospital visits, condolence)",
  });
  await expect(page.getByLabel("Who was it for? *")).toBeVisible();
  await expect(page.locator('[id="receipt-0-beneficiary"]')).toHaveAttribute(
    "data-value",
    "INTERNAL",
  );
  await chooseOption(page, page.locator('[id="receipt-0-category"]'), {
    label: "Utilities",
  });
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
  await expect(page.locator("#ministryId")).toHaveCount(0);
  await expect(page.locator("#purpose")).toHaveCount(0);
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
    ["/finance/recurring", "Recurring payments"],
    ["/finance/jompay", "JomPAY bills"],
  ] as const) {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/finance/recurring");
  await expect(
    page.getByRole("heading", { name: "Recurring payments", exact: true }),
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
  await chooseOption(page, page.locator('[id="receipt-0-category"]'), {
    label: "Utilities",
  });
  await page.locator('[id="receipt-0-amount"]').fill("5.20");
  let release: (() => void) | undefined;
  const uploadGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/storage/v1/object/receipts/**", async (route) => {
    if (route.request().method() === "POST") await uploadGate;
    await route.continue();
  });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
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
      { timeout: 15000 },
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
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Add supplier",
    exact: true,
  });
  await editor.getByLabel("Supplier name", { exact: true }).fill(name);
  await chooseOption(page, page.getByLabel("Payment method", { exact: true }), {
    value: "JOMPAY",
  });
  await expect(page.getByLabel("Account number", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Biller name", { exact: true })
    .fill("Local test biller");
  await page.getByLabel("Biller Code", { exact: true }).fill("000123");
  await page.getByLabel("Reference 1", { exact: true }).fill("00000456");
  await editor
    .getByRole("button", { name: "Add supplier", exact: true })
    .click();
  const supplier = page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(supplier).toBeVisible();
  await expect(
    supplier.getByText("Verification not required", { exact: true }),
  ).toBeVisible();
  await expect(supplier.getByText("Unverified", { exact: true })).toHaveCount(
    0,
  );
  await supplier.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Account number", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Reference 1", { exact: true }).fill("00000789");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Enter a valid bank account/)).toHaveCount(0);
  await supplier.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /Mark bank details verified/ }),
  ).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.goto("/admin/users");
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});

test("bank verification is a reviewed dialog action and payment changes clear it", async ({
  page,
}) => {
  await login(page, "finance");
  await page.goto("/admin/suppliers");
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const name = "Bank review " + Date.now();
  await dialog.getByLabel("Supplier name", { exact: true }).fill(name);
  await chooseOption(page, dialog.getByLabel("Bank", { exact: true }), {
    value: "MBBEMYKL",
  });
  await dialog
    .getByLabel("Account holder name", { exact: true })
    .fill("Local Supplier");
  await dialog
    .getByLabel("Account number", { exact: true })
    .fill("000123456789");
  await dialog
    .getByRole("button", { name: "Add supplier", exact: true })
    .click();
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
  await row
    .getByRole("button", { name: "Review bank details", exact: true })
    .click();
  await expect(
    dialog.getByText("It does not approve claims or confirm payment.", {
      exact: false,
    }),
  ).toBeVisible();
  const verify = dialog.getByRole("button", {
    name: "Mark bank details verified",
    exact: true,
  });
  await expect(verify).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await verify.click();
  await expect(row.getByText("Verified", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog
    .getByLabel("Account number", { exact: true })
    .fill("000987654321");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(row.getByText("Unverified", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "History", exact: true }).click();
  await expect(dialog.getByText("****4321", { exact: false })).toBeVisible();
  await expect(dialog.getByText("000987654321", { exact: true })).toHaveCount(
    0,
  );
});

test("claim supplier dialog does not submit its parent claim", async ({
  page,
}) => {
  await login(page);
  await page.goto("/claims/new");
  await chooseOption(page, page.locator('[id="receipt-0-category"]'), {
    label: "Utilities",
  });
  await page.locator('[id="receipt-0-amount"]').fill("12.34");
  await chooseOption(page, page.locator("#payTo"), { value: "SUPPLIER" });
  await chooseOption(page, page.getByLabel("Supplier", { exact: true }), {
    value: "__ADD_NEW__",
  });
  const dialog = page.getByRole("dialog", {
    name: "Add new supplier",
    exact: true,
  });
  await dialog.locator("#newProfileName").fill("Claim supplier " + Date.now());
  await dialog.locator("#newProfileAccountNumber").fill("000123456789");
  await dialog
    .getByRole("button", { name: "Save supplier", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/claims\/new$/);
  await expect(
    page.getByText("Please check your submission", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Submit Claim", exact: true }).click();
  await page.waitForURL(/\/claims\/[a-f0-9-]+$/);
});

test("new administration pages are centered and usable on narrow screens", async ({
  page,
}) => {
  await login(page, "finance");
  for (const route of [
    "/admin/suppliers",
    "/admin/dropdowns",
    "/admin/categories",
    "/finance/recurring",
    "/finance/jompay",
    "/claims/new",
  ]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route);
    const body = page
      .locator("#main-content")
      .locator(":scope > div, :scope > form")
      .first();
    await expect(body).toBeVisible();
    const layout = await body.evaluate((el) => {
      const a = el.getBoundingClientRect(),
        b = document.querySelector("#main-content")!.getBoundingClientRect();
      return {
        difference: Math.abs(a.left + a.width / 2 - b.left - b.width / 2),
        width: a.width,
        available: b.width,
      };
    });
    expect(layout.difference, route).toBeLessThan(3);
    expect(layout.width).toBeLessThanOrEqual(layout.available);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page
        .locator("body")
        .evaluate((el) => el.scrollWidth <= window.innerWidth),
      route,
    ).toBe(true);
    if (route === "/claims/new") {
      await page.screenshot({
        path: "/private/tmp/hg-claim-form-mobile-v3.png",
        fullPage: true,
      });
      await page
        .getByRole("heading", { name: "Expense items", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "/private/tmp/hg-claim-expenses-mobile-v3.png",
      });
      await page
        .getByRole("button", { name: "Submit Claim", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "/private/tmp/hg-claim-actions-mobile-v3.png",
      });
    }
  }
  await page.goto("/finance/recurring");
  await page
    .getByRole("button", { name: "Add recurring bill", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("bank-transfer recurring title starts blank and dropdown Escape keeps the dialog open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "finance");
  await page.goto("/finance/recurring");
  await page
    .getByRole("button", { name: "Add recurring bill", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const payee = dialog.getByRole("combobox", { name: "Payee", exact: true });
  await payee.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await chooseOption(page, payee, { value: fixture.users.finance.id });
  const title = dialog.getByRole("textbox", { name: /payment \/ bill title/i });
  await expect(title).toHaveValue("");
  await expect(dialog.locator("input[list]")).toHaveCount(0);
  await title.fill("Testing Bill");
  await expect(title).toHaveValue("Testing Bill");
});

test("recurring configuration distinguishes fixed and variable bills in a dialog", async ({
  page,
}) => {
  await login(page, "finance");
  const client = createClient(fixture.api, fixture.anon, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword(fixture.users.finance);
  const names = [
    `Utility fixed ${Date.now()}`,
    `Utility variable ${Date.now()}`,
  ];
  const ids = [];
  for (const name of names) {
    const r = await client.rpc("nlcc_command", {
      action: "create_payee_profile",
      payload: {
        full_name: name,
        payment_method: "JOMPAY",
        jompay_biller_name: "Local utility",
        jompay_biller_code: "000123",
        jompay_reference_1: "0009",
      },
    });
    expect(r.error).toBeNull();
    ids.push(r.data.id);
  }
  await page.goto("/finance/recurring");
  await page
    .getByRole("button", { name: "Add recurring bill", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await chooseOption(page, dialog.getByLabel(/payee/i), { value: ids[0] });
  await chooseOption(page, dialog.getByLabel("Team", { exact: true }), {
    value: fixture.team,
  });
  await dialog.getByLabel("Start date", { exact: true }).fill("2099-01-01");
  await dialog
    .getByRole("button", { name: "Save recurring bill", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Fixed amount (RM)", { exact: true }).fill("129.90");
  await dialog
    .getByRole("button", { name: "Save recurring bill", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const fixedRow = page.getByRole("listitem").filter({ hasText: names[0] });
  await fixedRow.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Fixed amount (RM)", { exact: true }).fill("139.90");
  await dialog
    .getByRole("button", { name: "Save recurring bill", exact: true })
    .click();
  await expect(fixedRow.getByText(/139.90/)).toBeVisible();
  await page
    .getByRole("button", { name: "Add recurring bill", exact: true })
    .click();
  await chooseOption(page, dialog.getByLabel(/payee/i), { value: ids[1] });
  await chooseOption(page, dialog.getByLabel("Utility", { exact: true }), {
    value: "TNB",
  });
  await expect(
    dialog.getByLabel("Fixed amount (RM)", { exact: true }),
  ).toHaveCount(0);
  await chooseOption(page, dialog.getByLabel("Team", { exact: true }), {
    value: fixture.team,
  });
  await dialog.getByLabel("Start date", { exact: true }).fill("2099-01-01");
  await dialog
    .getByRole("button", { name: "Save recurring bill", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const variable = page.getByRole("listitem").filter({ hasText: names[1] });
  await expect(variable.getByText(/Variable amount/)).toBeVisible();
  await variable
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(
    variable.getByText("TNB · Inactive", { exact: true }),
  ).toBeVisible();
});

test("Reimbursements separates Bank Transfer and JomPAY and creates a downloadable B1 file on mobile", async ({
  page,
}) => {
  const client = createClient(fixture.api, fixture.anon, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword(fixture.users.finance);
  const command = async (action: string, payload: unknown) => {
    const result = await client.rpc("nlcc_command", { action, payload });
    expect(result.error).toBeNull();
    return result.data;
  };
  const unique = `JomPAY UI ${Date.now()}`;
  const team = await command("master_save", {
    table: "ministries",
    data: { code: `UI-${Date.now()}`, name: unique },
  });
  const payee = await command("create_payee_profile", {
    full_name: unique,
    payment_method: "JOMPAY",
    jompay_biller_name: "Utility B1",
    jompay_biller_code: "0000123",
    jompay_reference_1: "0000987654321",
  });
  const snapshot = await client.rpc("nlcc_snapshot");
  const category = snapshot.data.categories.find(
    (c: { code: string }) => c.code === "V2_UTILITIES",
  );
  const claims = [];
  for (const amount of [11.25, 22.5]) {
    const claim = await command("submit_claim", {
      request_key: crypto.randomUUID(),
      payee_profile_id: payee.id,
      ministry_id: team.id,
      claim_date: "2026-11-12",
      purpose: unique,
      expenses: [
        {
          temp_id: "bill",
          expense_date: "2026-11-12",
          expense_category_id: category.id,
          amount,
          description: "",
          sort_order: 1,
        },
      ],
      attachments: [],
    });
    const detail = await client.rpc("nlcc_claim_detail", {
      p_claim_id: claim.id,
    });
    await command("approve", {
      claim_id: claim.id,
      version: detail.data.claim.version,
    });
    claims.push(detail.data.claim);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "finance");
  await page.goto("/finance/claims");
  const methods = page.getByRole("navigation", { name: "Payment method" });
  await expect(
    methods.getByRole("link", { name: "Bank Transfer", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  for (const claim of claims)
    await expect(
      page.locator(`#main-content a[href="/finance/claims/${claim.id}"]`),
    ).toHaveCount(0);
  await methods.getByRole("link", { name: "JomPAY", exact: true }).click();
  await expect(page).toHaveURL(/method=JOMPAY/);
  await expect(
    methods.getByRole("link", { name: "JomPAY", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.locator("#finance-search").fill(unique);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const claim of claims)
    await page
      .getByRole("checkbox", {
        name: `Select ${claim.claim_number} for JomPAY batch`,
        exact: true,
      })
      .check();
  const responseEvent = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith("/api/v1/finance") &&
      r.request().postDataJSON().action === "finalize_jompay_batch",
  );
  await page
    .getByRole("button", { name: "Create JomPAY batch (2)", exact: true })
    .click();
  const created = await responseEvent;
  expect(created.status()).toBe(200);
  const batch = await created.json();
  await page.waitForURL(`**/finance/batches/${batch.id}`);
  const downloadButton = page.getByRole("button", {
    name: "Download JomPAY XLSX",
    exact: true,
  });
  await expect(downloadButton).toBeVisible();
  // Failed downloads show the actionable error beside the control and allow retry.
  const exportUrl = `**/api/v1/finance/batches/${batch.id}/export`;
  await page.route(
    exportUrl,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary export failure. Try again." }),
      }),
    { times: 1 },
  );
  await downloadButton.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Temporary export failure. Try again." }),
  ).toBeVisible();
  const event = page.waitForEvent("download");
  await downloadButton.click();
  const download = await event;
  expect(download.suggestedFilename()).toBe(`${batch.batch_number}.xlsx`);
  const bytes = readFileSync((await download.path())!);
  const wb = XLSX.read(bytes, { type: "buffer", cellNF: true });
  expect(wb.SheetNames).toEqual(["Sheet1"]);
  expect(wb.Sheets.Sheet1["!ref"]).toBe("A1:G3");
  expect(wb.Sheets.Sheet1.A2).toMatchObject({ t: "s", v: "0000123", z: "@" });
  expect(wb.Sheets.Sheet1.B2.v).toBe("0000987654321");
  expect([wb.Sheets.Sheet1.D2.v, wb.Sheets.Sheet1.D3.v].sort()).toEqual([
    "11.25",
    "22.50",
  ]);
  const saved = (
    await client.rpc("nlcc_snapshot")
  ).data.reimbursementBatches.find((b: { id: string }) => b.id === batch.id);
  expect(saved.payment_method).toBe("JOMPAY");
  expect(saved.claim_count).toBe(2);
  expect(saved.transfer_count).toBe(2);
  expect(saved.exported_file_hash_sha256).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  for (const claim of claims)
    expect(
      (await client.rpc("nlcc_claim_detail", { p_claim_id: claim.id })).data
        .claim.status,
    ).toBe("APPROVED_FOR_PAYMENT");
  await page
    .getByRole("link", { name: "JomPAY reimbursements", exact: true })
    .click();
  await expect(page).toHaveURL(/\/finance\/claims\?method=JOMPAY/);
  const batchRow = page
    .getByRole("listitem")
    .filter({ hasText: batch.batch_number });
  await expect(
    batchRow.getByRole("button", { name: "Download JomPAY XLSX", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/hg-jompay-reimbursements-mobile.png",
  });
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("claim pages have accessible actions and independent mobile layouts without Print", async ({
  page,
}) => {
  await login(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/claims", `/claims/${fixture.claim}`, "/claims/new"]) {
      await page.goto(path);
      const content = page.locator(".claim-page, .claim-form").first();
      await expect(content).toBeVisible();
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= window.innerWidth),
        `${path} at ${width}`,
      ).toBe(true);
      expect(await content.locator("a button, button a").count()).toBe(0);
      const layout = await content.evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = document.querySelector("#main-content")!.getBoundingClientRect();
        return Math.abs(a.left + a.width / 2 - b.left - b.width / 2);
      });
      expect(layout, `${path} at ${width}`).toBeLessThan(3);
      await expect(content.getByRole("link", { name: /print/i })).toHaveCount(
        0,
      );
      const smallButtons = await content
        .locator("button")
        .evaluateAll((buttons) =>
          buttons
            .filter(
              (b) =>
                b.getClientRects().length &&
                b.getBoundingClientRect().height < 44,
            )
            .map((b) => b.textContent),
        );
      expect(smallButtons).toEqual([]);
      if (path === `/claims/${fixture.claim}`) {
        const attachment = page.getByRole("button", {
          name: "View receipt-0.png",
          exact: true,
        });
        await attachment.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page
          .getByRole("button", { name: "Workflow & Timeline", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Workflow & Timeline",
            exact: true,
          }),
        ).toHaveAttribute("aria-pressed", "true");
      }
    }
  }
  await page.goto(`/claims/${fixture.claim}/print`);
  await expect(page).toHaveURL(new RegExp(`/claims/${fixture.claim}$`));
  await page.screenshot({
    path: "/private/tmp/hg-claim-detail-desktop-v4.png",
  });
});

test("Finance and Team Lead claim screens keep review actions distinct and dialogs usable", async ({
  page,
}) => {
  test.setTimeout(90000);
  const client = createClient(fixture.api, fixture.anon, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword(fixture.users.finance);
  const snapshot = await client.rpc("nlcc_snapshot");
  const pending = snapshot.data.claims.find(
    (c: { status: string }) => c.status === "PENDING_FINANCE_REVIEW",
  );
  expect(pending).toBeTruthy();
  await login(page, "finance");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/approvals",
      "/finance/claims",
      "/finance/claims?method=JOMPAY",
      `/finance/claims/${pending.id}`,
    ]) {
      await page.goto(path);
      const content = page.locator(".claim-page").first();
      await expect(content).toBeVisible();
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= window.innerWidth),
        `${path} at ${width}`,
      ).toBe(true);
      expect(await content.locator("a button, button a").count()).toBe(0);
      const smallButtons = await content
        .locator("button")
        .evaluateAll((buttons) =>
          buttons
            .filter(
              (b) =>
                b.getClientRects().length &&
                b.getBoundingClientRect().height < 44,
            )
            .map((b) => b.textContent),
        );
      expect(smallButtons, `${path} at ${width}`).toEqual([]);
      if (path === "/approvals") {
        await page
          .getByRole("button", { name: "Team claims", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Team claims", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      }
    }
    const review = page.getByRole("region", {
      name: "Review actions",
      exact: true,
    });
    await expect(
      review.getByRole("button", { name: "Approve Claim", exact: true }),
    ).toBeVisible();
    await expect(
      review.getByRole("button", { name: "Duplicate Claim", exact: true }),
    ).toHaveCount(0);
    await review.getByRole("button", { name: "Return", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByLabel("Clarification Instructions / Missing Information *", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Return to Claimant", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await review.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(
      dialog.getByLabel("Reason for Rejection *", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Confirm Rejection", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.screenshot({
      path: `/private/tmp/hg-finance-review-${width}.png`,
    });
  }
  const unchanged = await client.rpc("nlcc_claim_detail", {
    p_claim_id: pending.id,
  });
  expect(unchanged.data.claim.status).toBe("PENDING_FINANCE_REVIEW");
  expect(unchanged.data.claim.version).toBe(pending.version);
});
