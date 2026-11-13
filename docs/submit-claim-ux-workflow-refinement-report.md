# HG-Claims — Submit Claim UX & Workflow Refinement Implementation Report

**Repository:** `https://github.com/HarvestGen-Dev/HG-Claims`  
**Branch:** `feat/submit-claim-ux-refinement`  
**Date:** 13 November 2026  
**Author:** Senior Full-Stack Software Engineer & Systems Architect  

---

## 1. Executive Summary

This engineering project delivers a streamlined **Submit Claim** experience, eliminates redundant data entry, integrates receipt management directly into individual expense items, and expands the recurring-payment architecture to support **Bank Account Transfers to church members and staff** (stipends, monthly allowances, recurring reimbursements) alongside directory payees and JomPAY utility bills.

All changes strictly preserve backward compatibility with existing claims, historical receipts, finance approval gates, reimbursement workflows, and database integrity.

### Summary of Core Achievements
1. **Eliminated Standalone Receipt Card:** Removed the redundant "Receipt / Invoice Photos" card from the main claim form. All receipt attachments are managed within their corresponding Expense Items.
2. **Eliminated Team and Purpose Fields:** Removed `ministry_id` (Team) and `purpose` inputs from the claim submission form. The backend securely derives team routing from the claimant's profile and active ministry memberships. Historical claims retain full visibility.
3. **Redesigned Expense Items Hierarchy:**
   - **Prominent Receipt Upload at Top:** Drag-and-drop zone, file browser, camera photo capture (`capture="environment"` for mobile smartphones), thumbnail preview modal, and replace/remove actions.
   - **Expense Details Below:** Clean inputs for Amount, Date, Category, and "Who was it for?".
   - **Removed Supplier / Merchant:** Removed the `vendor` input from expense items while preserving backward compatibility for historical records and exports.
   - **Defaulted "Who Was It For?" to Internal:** `beneficiary_type` defaults to `INTERNAL` on newly created and duplicated items; preserves existing selections during editing, validation, and category switching.
   - **Smart Item Duplication:** Duplicating an expense item duplicates all completed receipt attachments (safe reference management with fresh attachment IDs) while clearing amount, category, description, and resetting the beneficiary to `INTERNAL`. Deleting a copied attachment never deletes or damages the original attachment.
4. **Enabled Recurring Payments for Bank Transfers to Members & Suppliers:**
   - **User Bank Account Support:** Extended `private.save_recurring_payment_v4()` and `private.run_recurring_payments()` to support registered church members/staff (`is_payee_only = false`) with bank account numbers in addition to directory suppliers.
   - **Automatic Claim Generation & Attribution:** Every month, a claim is generated directly for the user (`claimant_id: user.id`), snapshotting their verified bank account details (Bank Name, Account Holder Name, Bank Account Number) and payment revision.
   - **Subjected to Team Lead & Finance Approval:** Generated claims route through standard church team approval policies. If the ministry requires Team Lead approval, the claim enters `PENDING_MINISTRY_APPROVAL` for Team Lead review, followed by `PENDING_FINANCE_REVIEW` for Finance review, before bulk reimbursement payout.
   - **Fixed Recurring Bill Card Layout:** Redesigned the entire dialog in `/finance/recurring` with structured form field containers, responsive 2-column grid, member vs directory payee grouping, clear bank details snapshot card, amount mode toggles, and clean helper labels.
5. **Quality Verification:**
   - 100% pass rate across 22 Vitest test files (202 passing tests), including an extensive 19-test suite for this feature (`tests/submit-claim-ux-refinement.test.ts`).
   - 100% pass rate on backend database integration suite (122 v2 backend assertions in `tests/backend.integration.mjs`).
   - Clean TypeScript check (`tsc --noEmit`), ESLint check (`eslint src`), and production Next.js build (`next build`).

---

## 2. Architecture & UX Refinement

### 2.1 Receipt Upload Consolidation
Previously, users faced a confusing two-tier upload architecture: a general "Receipt / Invoice Photos" card at the claim level and an item-level receipt uploader.

- **Changes in `src/components/claims/ClaimForm.tsx`:**
  - Removed the standalone `Receipt / invoice photos` card (`claimAttachments` state and dropzone).
  - Claims now derive their supporting documents directly from the aggregated item-level attachments in `ExpenseItemsEditor`.
  - Claims duplicated at the claim level (where Part 1 claimant/payee details and attachments are preserved while Part 2 expense details are cleared) automatically initialize one Expense Item per preserved attachment, providing an intuitive bridge between claim-level duplication and item-level editing.
  - Background/late-upload synchronization: Added `savedClaimId` ref and `onAttachmentUploaded` callback that invokes the domain command `attach_receipt` (`private.attach_claim_file`) if an upload completes after the user clicks Submit Claim.

### 2.2 Removal of Team and Purpose Fields
Claimants previously had to manually select their Ministry/Team and type a Purpose, even though their user profile already established their organizational context.

- **Changes in `src/components/claims/ClaimForm.tsx` & `src/lib/validations/claim.ts`:**
  - Removed the `Team and purpose` card containing the Team select, Context dropdown, and Purpose textarea.
  - Optional claim metadata (`claimDate` and `internalRef`) moved into an unobtrusive collapsible "Additional claim details (optional)" section.
  - `ministry_id` and `purpose` marked optional and nullable in Zod schema `claimFormSchema`.
  - In `src/lib/mock-db/repository.ts` (and Supabase backend), `saveClaimDraft`, `submitClaim`, and `resubmitClaim` derive `ministry_id` from the submitter's profile (`profile.ministry_id`) or fall back to the first active ministry if not explicitly set.
  - Preserved historical display: Claim detail views (`ClaimDetailView.tsx`) continue to render team and purpose information for existing claims.

### 2.3 Expense Items Visual Hierarchy & Interactions
Each expense card in `src/components/claims/ExpenseItemsEditor.tsx` now follows this strict visual hierarchy:

```
┌────────────────────────────────────────────────────────┐
│ Expense Item #1                                        │
├────────────────────────────────────────────────────────┤
│ 1. RECEIPT / INVOICE UPLOAD (Prominent Top Area)       │
│    - Drag-and-drop or Browse / Take Photo              │
│    - Mobile camera capture (capture="environment")     │
│    - File preview modal, Replace, and Remove buttons   │
├────────────────────────────────────────────────────────┤
│ 2. EXPENSE DETAILS                                     │
│    - Amount (RM)                                       │
│    - Date of Expense                                   │
│    - Category (Dropdown)                               │
│    - Who was it for? [Internal | External] (Pills)     │
│    - Receipt / Invoice # (Optional)                    │
│    - Description (Optional)                            │
├────────────────────────────────────────────────────────┤
│ 3. ACTIONS                                             │
│    - [Duplicate]  [Remove Item]                        │
└────────────────────────────────────────────────────────┘
```

#### Key Improvements:
- **Removed Supplier / Merchant (`vendor`):** Removed from the item editor form. Historical data is preserved on existing claims, and database/mock-db storage continues to accept optional vendor fields.
- **Default "Who Was It For?" to Internal:** `beneficiary_type` is initialized to `'INTERNAL'` on new items and duplicated items. When editing or changing categories, the user's saved selection is preserved.
- **Duplication Mechanics:** Clicking **Duplicate** creates a new expense item where:
  - Any uploaded receipt attachment is copied with a fresh unique ID (`temp_id` reference) sharing the safe storage path.
  - Expense details (amount, category, description, invoice number) are cleared.
  - Date defaults to today, and `beneficiary_type` defaults to `'INTERNAL'`.
  - Deleting an attachment on the duplicated item (`handleRemoveAttachment`) unlinks `item.attachment` without deleting the underlying storage file, keeping the original item's attachment intact.
  - Smoothly auto-scrolls to and focuses the newly duplicated item.

---

## 3. Recurring Payments for Bank Transfers (Users & Suppliers)

### 3.1 Problem Analysis
Previously, the system restricted recurring payments in three ways:
1. `private.guard_recurring_payee()` trigger and `save_recurring_payment_v4()` checked `is_payee_only = true`, which excluded all registered church members and staff users (`is_payee_only = false`).
2. Table check constraints on `recurring_payments` hardcoded `utility IN ('Unifi','Indah Water','TNB','Air Selangor')`, preventing custom payment titles for member stipends, staff allowances, or rental reimbursements.
3. The UI dialog layout used unstyled raw inline `<label>` elements, causing inputs, helper text, and links to collapse together awkwardly without structured vertical margins or clean grid alignment.

### 3.2 Database Migration (`20261113000001_recurring_bank_transfers.sql`)
Created and applied migration `supabase/migrations/20261113000001_recurring_bank_transfers.sql`:
- **Table Constraints:** Dropped `recurring_payments_utility_check` and `recurring_payments_check2`; added `recurring_payments_utility_nonempty` ensuring `length(trim(utility)) > 0`.
- **`private.guard_recurring_payee()`:** Validates that active payees attached to recurring payments must have `payment_method IN ('JOMPAY', 'BANK_TRANSFER')` and protects against deactivation or method switching while active.
- **`private.save_recurring_payment_v4()`:**
  - Validates payee existence in `public.profiles` (`status = 'ACTIVE'`).
  - Supports both registered users (`is_payee_only = false`) and directory payees (`is_payee_only = true`).
  - For JomPAY: enforces directory payee and one of the 4 utility bills (preserving JomPAY bulk export template rules).
  - For Bank Transfer: requires `bank_account_number` and `bank_account_holder_name`; supports custom payment titles (e.g. "Monthly Staff Allowance", "Pastoral Stipend", "Rent") and either `FIXED` or `VARIABLE` amount modes.
- **`private.run_recurring_payments()`:**
  - Evaluates both JomPAY and Bank Transfer schedules for users and suppliers.
  - When generating claims for a member user:
    - Sets `claimant_id: user.id` and `submitted_by_user_id: user.id`.
    - Snapshots bank details: `bank_name`, `bank_code`, `bank_account_holder_name`, `bank_account_number`, and `payee_payment_revision`.
    - Notifies both Finance and the claimant user.
  - Generates claims in `DRAFT` status ready for review and submission.
  - Once submitted, `private.build_workflow(cid)` automatically routes the claim through **Team Lead approval** (`PENDING_MINISTRY_APPROVAL`) if the team requires it, and then **Finance review** (`PENDING_FINANCE_REVIEW`) before bulk bank reimbursement.

### 3.3 UI Redesign (`src/app/(dashboard)/finance/recurring/page.tsx`)
- **Fixed Layout & Structured Fields:**
  - Replaced unstyled raw labels with dedicated `space-y-1.5` containers and `<label className="block text-sm font-medium text-foreground">`.
  - Clear 2-column responsive grid (`grid-cols-1 sm:grid-cols-2 gap-4`).
- **Payee Selector with Optgroups:**
  - Group 1: `Members & Staff (Bank Account Transfer)` — lists all active church members with their email and bank transfer details.
  - Group 2: `Directory Payees & Utilities` — lists suppliers and utility billers.
- **Payee Details Snapshot Card:**
  - Renders user vs supplier badge, payment method badge (`Bank Account Transfer` or `JomPAY`), bank name, account holder name, and masked account number.
- **Amount Mode Toggle:**
  - Interactive segmented buttons for `Fixed Amount` and `Variable Amount`.
  - Fixed amount input with RM formatting and validation.
- **Generated Bills Lifecycle Actions:**
  - Displays generated claims with `ClaimStatusBadge` and claimant attribution.
  - Provides direct "Review & Submit" link for drafts, directing to claim review and submission into the Team Lead / Finance approval workflow.

---

## 4. Verification and Acceptance Matrix

| # | Requirement / Acceptance Criterion | Test Verification | Status |
|---|----------------------|-------------------|:------:|
| 1 | Standalone receipt upload section removed from Submit Claim | `tests/submit-claim-ux-refinement.test.ts` (Test 1), `tests/e2e/claims-v2.spec.ts` | **PASS** |
| 2 | Expense Item displays receipt uploader above detail fields | `tests/submit-claim-ux-refinement.test.ts` (Test 2), `ExpenseItemsEditor.tsx` | **PASS** |
| 3 | Team, Purpose, and Supplier/Merchant not required on new claim forms | `tests/submit-claim-ux-refinement.test.ts` (Tests 3-5), schema validation | **PASS** |
| 4 | Newly added Expense Items default "Who Was It For?" to Internal | `tests/submit-claim-ux-refinement.test.ts` (Test 6) | **PASS** |
| 5 | Existing expense items retain saved Who Was It For selections | `tests/submit-claim-ux-refinement.test.ts` (Tests 7-8) | **PASS** |
| 6 | Duplicating Expense Item copies attachments and clears details | `tests/submit-claim-ux-refinement.test.ts` (Test 9), `ExpenseItemsEditor.tsx` | **PASS** |
| 7 | Deleting duplicated attachment does not damage original attachment | `tests/submit-claim-ux-refinement.test.ts` (Test 10) | **PASS** |
| 8 | Duplicating unsaved item produces no orphaned attachments | `tests/submit-claim-ux-refinement.test.ts` (Test 11) | **PASS** |
| 9 | Bank Account Transfer supports recurring-payment configuration for Users & Suppliers | `tests/submit-claim-ux-refinement.test.ts` (Tests 12-13), SQL migration | **PASS** |
| 10 | Recurring bank-transfer claims for users route through Team Lead and Finance approval | `tests/submit-claim-ux-refinement.test.ts` (Tests 14-15), `run_recurring_payments` | **PASS** |
| 11 | Historical claims remain readable without errors | `tests/submit-claim-ux-refinement.test.ts` (Test 16) | **PASS** |
| 12 | Claim-level duplication behavior remains unchanged | `tests/submit-claim-ux-refinement.test.ts` (Test 17) | **PASS** |
| 13 | Mobile/desktop workflows and clean card layout with structured containers | `tests/submit-claim-ux-refinement.test.ts` (Tests 18-19), Playwright 390px | **PASS** |

---

## 5. Test Suite Execution Logs

### 5.1 Unit & Integration Suite (`npm test`)
```bash
> hg-claims@1.0.0 test
> vitest run

 ✓ tests/submit-claim-ux-refinement.test.ts (19 tests)
 ✓ tests/simplified-roles-and-invitations.test.ts (17 tests)
 ✓ tests/workflow-engine.test.ts (4 tests)
 ✓ tests/comprehensive-system-audit.test.ts (18 tests)
 ✓ tests/domain-services.test.ts (17 tests)
 ✓ tests/new-claim-model.test.ts (6 tests)
 ✓ tests/v2-domain.test.ts (21 tests)
 ✓ tests/bulk-reimbursement-workflow.test.ts (13 tests)
 ✓ tests/performance-optimizations.test.ts (8 tests)
 ✓ tests/team-leads-budgets-encryption.test.ts (4 tests)
 ✓ tests/production-api.test.ts (9 tests)
 ✓ tests/invitation-signup.test.ts (4 tests)
 ✓ tests/finance-verification-permissions.test.ts (18 tests)
 ✓ tests/payee-management.test.ts (3 tests)
 ✓ tests/demo-persistence.test.ts (2 tests)
 ✓ tests/claim-hydration.test.ts (1 test)
 ✓ tests/calculations.test.ts (5 tests)
 ✓ tests/production-receipts.test.ts (3 tests)
 ✓ tests/claim-number.test.ts (4 tests)
 ✓ tests/production-repository.test.ts (2 tests)
 ✓ tests/claim-status-presentation.test.ts (3 tests)
 ✓ tests/jompay-export.test.ts (21 tests)

Test Files  22 passed (22)
     Tests  202 passed (202)
  Duration  1.19s
```

### 5.2 Backend Integration Suite (`npm run test:backend`)
```bash
> hg-claims@1.0.0 test:backend
> node tests/backend.integration.mjs

PASS member has no privileged role and loads workspace
...
PASS recurring bill binds an active JomPAY payee by stable ID, independent of display name
PASS payee can be deactivated after its recurring schedule is stopped
PASS recurring edits do not rewrite previously generated bill amounts
PASS 122 v2 backend assertions. Local fixtures: 66015490
```

### 5.3 Typecheck, Lint, and Production Build
- `npm run typecheck`: **0 errors**
- `npm run lint`: **0 errors** (104 pre-existing warnings in untouched files)
- `npm run build`: **Compiled successfully** into dynamic Next.js production bundle.

---

## 6. Modified Files Manifest

- `src/app/(dashboard)/finance/recurring/page.tsx`: Redesigned recurring bill dialog with structured containers; supports users & suppliers with bank transfer details card; amount mode toggle; clean generated bills actions.
- `src/lib/types/database.ts`: Broadened `RecurringPayment.utility` to allow custom titles.
- `supabase/migrations/20261113000001_recurring_bank_transfers.sql`: Relaxed utility check constraints; updated `private.save_recurring_payment_v4` and `private.run_recurring_payments` for user bank transfers and workflow routing.
- `src/components/claims/ClaimForm.tsx`: Standalone receipt card removed; Team & Purpose fields removed; item-level attachment synchronization.
- `src/components/claims/ExpenseItemsEditor.tsx`: Prominent receipt upload zone at top; details below; vendor removed; beneficiary defaults to `INTERNAL`; duplicate copies receipt and clears details; safe attachment deletion.
- `src/lib/validations/claim.ts`: Optional/nullable `ministry_id`, `purpose`, and `vendor`.
- `src/lib/mock-db/repository.ts`: Ministry auto-derivation; item attachment mapping; receipt validation.
- `tests/submit-claim-ux-refinement.test.ts`: Automated tests for all 13 criteria (19 passing assertions).
