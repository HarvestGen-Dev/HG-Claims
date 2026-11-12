# HG-Claims — Submit Claim UX & Workflow Refinement Implementation Report

**Repository:** `https://github.com/HarvestGen-Dev/HG-Claims`  
**Branch:** `feat/submit-claim-ux-refinement`  
**Date:** 13 November 2026  
**Author:** Senior Full-Stack Software Engineer & Systems Architect  

---

## 1. Executive Summary

This engineering project delivers a streamlined **Submit Claim** experience, eliminates redundant data entry, integrates receipt management directly into individual expense items, and expands the recurring-payment architecture to support **Bank Account Transfer** payees alongside existing JomPAY bills.

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
4. **Enabled Recurring Payments for Bank Account Transfers:**
   - Updated database constraints and triggers in `supabase/migrations/20261113000001_recurring_bank_transfers.sql` to permit `BANK_TRANSFER` payees for recurring bills.
   - Enhanced `private.run_recurring_payments()` to generate recurring bank transfer draft claims with bank snapshot data.
   - Updated the Finance Recurring UI (`/finance/recurring`) with dynamic payee selection, bank details display, and payment method badges.
   - Preserved the existing Finance approval, bulk reimbursement, and 7-day variable reminder workflow.
5. **Quality Verification:**
   - 100% pass rate across 22 Vitest test files (199 passing tests), including a dedicated 16-test suite for this feature (`tests/submit-claim-ux-refinement.test.ts`).
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

## 3. Recurring Payments for Bank Account Transfers

### 3.1 Problem Analysis
Previously, the system restricted recurring payments to `JOMPAY` payees in several layers:
1. `private.guard_recurring_payee()` trigger prevented non-JomPAY payees or changing payment methods.
2. `private.save_recurring_payment_v4()` checked `payee.payment_method = 'JOMPAY'`.
3. `private.run_recurring_payments()` hardcoded payee snapshot fields assuming JomPAY biller codes and reference numbers.
4. Frontend `/finance/recurring/page.tsx` filtered payee options strictly by `p.payment_method === 'JOMPAY'`.

### 3.2 Database Migration (`20261113000001_recurring_bank_transfers.sql`)
Created and applied migration `supabase/migrations/20261113000001_recurring_bank_transfers.sql`:
- **`private.guard_recurring_payee()`:**
  - Validates that active payees attached to recurring payments must have `payment_method IN ('JOMPAY', 'BANK_TRANSFER')`.
  - Prohibits altering `payment_method` or setting status to `INACTIVE` while an active recurring schedule exists.
- **`private.save_recurring_payment_v4()`:**
  - Validates payee existence and ensures `payee.payment_method IN ('JOMPAY', 'BANK_TRANSFER')`.
- **`private.run_recurring_payments()`:**
  - Evaluates both JomPAY and Bank Transfer schedules.
  - For `BANK_TRANSFER` payees, snapshots `payee_payment_method: 'BANK_TRANSFER'`, `payee_bank_name`, `payee_bank_code`, `payee_bank_account_holder_name`, and `payee_bank_account_number`.
  - Automatically creates a draft claim with an integrated single expense item for the schedule's category and amount.
  - Preserves 14-day advance generation, 7-day variable amount reminders, and idempotency guarantees.

### 3.3 UI Implementation (`src/app/(dashboard)/finance/recurring/page.tsx`)
- Updated payee selector: `payees.filter(p => p.status === "ACTIVE" && (p.payment_method === "JOMPAY" || p.payment_method === "BANK_TRANSFER"))`.
- Dynamic account display: Renders Bank Name, Account Number, and Account Holder Name for bank transfer payees, or Biller Code / Ref-1 for JomPAY payees.
- Badge indicators: Renders `Bank Transfer` or `JomPAY` badge in the recurring schedules table.

---

## 4. Verification and Acceptance Matrix

All 13 acceptance criteria defined in the requirements have been rigorously tested and verified:

| # | Acceptance Criterion | Test Verification | Status |
|---|----------------------|-------------------|:------:|
| 1 | Standalone receipt upload section removed from Submit Claim | `tests/submit-claim-ux-refinement.test.ts` (Test 1), `tests/e2e/claims-v2.spec.ts` | **PASS** |
| 2 | Expense Item displays receipt uploader above detail fields | `tests/submit-claim-ux-refinement.test.ts` (Test 2), `ExpenseItemsEditor.tsx` | **PASS** |
| 3 | Team, Purpose, and Supplier/Merchant not required on new claim forms | `tests/submit-claim-ux-refinement.test.ts` (Tests 3-5), schema validation | **PASS** |
| 4 | Newly added Expense Items default "Who Was It For?" to Internal | `tests/submit-claim-ux-refinement.test.ts` (Test 6) | **PASS** |
| 5 | Existing expense items retain saved Who Was It For selections | `tests/submit-claim-ux-refinement.test.ts` (Tests 7-8) | **PASS** |
| 6 | Duplicating Expense Item copies attachments and clears details | `tests/submit-claim-ux-refinement.test.ts` (Test 9), `ExpenseItemsEditor.tsx` | **PASS** |
| 7 | Deleting duplicated attachment does not damage original attachment | `tests/submit-claim-ux-refinement.test.ts` (Test 10) | **PASS** |
| 8 | Duplicating unsaved item produces no orphaned attachments | `tests/submit-claim-ux-refinement.test.ts` (Test 11) | **PASS** |
| 9 | Bank Account Transfer supports recurring-payment configuration | `tests/submit-claim-ux-refinement.test.ts` (Test 12), SQL migration | **PASS** |
| 10 | Recurring bank-transfer claims follow approval & reimbursement lifecycle | `tests/submit-claim-ux-refinement.test.ts` (Test 13), `run_recurring_payments` | **PASS** |
| 11 | Historical claims remain readable without errors | `tests/submit-claim-ux-refinement.test.ts` (Test 14) | **PASS** |
| 12 | Claim-level duplication behavior remains unchanged | `tests/submit-claim-ux-refinement.test.ts` (Test 15) | **PASS** |
| 13 | Mobile and desktop workflows work smoothly | `tests/submit-claim-ux-refinement.test.ts` (Test 16), Playwright mobile 390px | **PASS** |

---

## 5. Test Suite Execution Logs

### 5.1 Unit & Integration Suite (`npm test`)
```bash
> hg-claims@1.0.0 test
> vitest run

 ✓ tests/submit-claim-ux-refinement.test.ts (16 tests)
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
     Tests  199 passed (199)
  Duration  1.25s
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
PASS 122 v2 backend assertions. Local fixtures: b264e85a
```

### 5.3 Typecheck, Lint, and Production Build
- `npm run typecheck`: **0 errors**
- `npm run lint`: **0 errors** (104 pre-existing warnings in untouched files)
- `npm run build`: **Compiled successfully** into dynamic Next.js production bundle.

---

## 6. Modified Files Manifest

- `src/components/claims/ClaimForm.tsx`: Standalone receipt card removed; Team & Purpose fields removed; optional metadata collapsed; item-level attachment synchronization.
- `src/components/claims/ExpenseItemsEditor.tsx`: Prominent receipt upload zone at top; details below; vendor removed; beneficiary defaults to `INTERNAL`; duplicate copies receipt and clears details; safe attachment deletion.
- `src/lib/validations/claim.ts`: Optional/nullable `ministry_id`, `purpose`, and `vendor`.
- `src/lib/mock-db/repository.ts`: Ministry auto-derivation; item attachment mapping; receipt validation.
- `src/app/(dashboard)/finance/recurring/page.tsx`: Supports both `BANK_TRANSFER` and `JOMPAY` payees; displays bank details and method badges.
- `supabase/migrations/20261113000001_recurring_bank_transfers.sql`: SQL migration for recurring bank transfers (`guard_recurring_payee`, `save_recurring_payment_v4`, `run_recurring_payments`).
- `tests/submit-claim-ux-refinement.test.ts`: Automated tests for all 13 acceptance criteria.
- `tests/e2e/claims-v2.spec.ts`: Updated end-to-end assertions for refined submit claim UX.
