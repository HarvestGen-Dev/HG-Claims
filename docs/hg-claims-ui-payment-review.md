# UI and payment-management review

Follow-up requirements, 2026-11-11: center the newer pages, tidy the claim form, use a card-style supplier editor, clarify bank verification, and treat JomPAY payees as directory entries with no verification or user account.

## Interface changes

- Suppliers, recurring bills, JomPAY, dropdown lists and classifications now use centered, full-width containers with consistent maximum widths and section spacing. JomPAY batch details use a wider centered container for the seven-column review table.
- Supplier create/edit, payment-detail review and history use the existing accessible Dialog component. Bank verification shows the actual details, explains its limited meaning and requires an explicit checked-details acknowledgment. The action is named **Mark bank details verified**. It does not approve a claim or confirm payment.
- JomPAY cards say **Verification not required**. Their details dialog has no verification control. Saved payees are excluded from user management and cannot be assigned a user role. Existing payee-profile storage is reused to preserve financial references; no Auth account or login is created.
- Payment history is a readable, timestamped field-change list with actor names and masked bank account numbers. Encrypted blobs and full account numbers are not returned by that history endpoint.
- Recurring create/edit uses a dialog. Fixed/variable amount behavior follows the four allowed utilities. Active JomPAY payees are selected by stable ID rather than requiring a particular display name. Schedule rows identify the payee and Team. Changes affect future drafts; generated bills retain their saved values.
- The claim form follows Photos → Pay to → Team/context → Expense items → Total/actions. Saved personal payment details are collapsed, all input sizes and section spacing use the shared components, optional metadata is collapsed and expense fields have a consistent order. File upload and expense entry are labeled separately. Existing totals, attachment reuse, draft saving, return/resubmission and multiple-item behavior are retained.
- The claim's supplier dialog is a sibling of the claim form, removing nested forms and preventing a supplier save from submitting the claim. Supplier search is cleared when switching from Me to A supplier. New claim/item dates use Asia/Kuala_Lumpur.

## Database and business logic

`20261111100656_payment_management_validation.sql` is additive. It does not rewrite existing claims, payments, snapshots, schedules or batch instructions.

- JomPAY claims never require payee verification. Historical verification audit data is retained. Bank-transfer verification and its revision checks remain in place.
- Supplier edits can send the captured payment revision; stale edits are rejected. Older callers remain compatible. Omitted contact fields are preserved.
- A supplier with an active recurring schedule cannot be deactivated or switched away from JomPAY until the schedule is deactivated. This prevents silent draft-generation gaps.
- Fixed schedules require a positive, nonblank amount with at most two decimals; variable schedules cannot contain a fixed amount. Invalid utility/mode combinations, dates, due days, inactive payees/Teams/categories and duplicate active schedules are rejected.
- A database CHECK closes the SQL NULL loophole for fixed amounts. If any legacy invalid fixed schedule exists, it is preserved for Finance correction and the job skips it; the constraint is validated automatically when no such exception exists. The management screen displays **Fixed amount needed** for an exception.
- Schedule saves/deactivation share the generator's transaction advisory lock. Existing period uniqueness, 14-day creation, 7-day deduplicated reminders, month-end handling and missed-run catchup are preserved. A missing previous-month amount is shown as unavailable rather than RM0.
- No bill-variation alerts, anomaly thresholds, new budget setup or automatic payment processing were introduced.

## Verification

- `npm test`: 180 tests in 20 files passed.
- `node tests/v2-backend.integration.mjs`: 122 assertions passed against isolated local Supabase.
- `npx playwright test`: 9 scenarios passed against the production-mode local app, including JomPAY create/edit without bank fields or verification, exclusion from users, bank review/reverification, safe claim supplier submission, fixed/variable recurring configuration and centered desktop/mobile pages.
- Type checking, lint and production build passed; exact final lint warning count is in the main report.
- Historical-upgrade assertions passed after the new migration. Local security advisors found no warning/error issues.
- Layout checks use 1440×1000 and 390×844 viewports. Narrow-page center offsets are checked against the available workspace, and mobile horizontal overflow is checked. Screenshots of the claim form, expense entry and submission area were visually reviewed outside the repository. The cramped item header found in that review was simplified and checked again.

Actual Alliance Bank portal acceptance remains externally unverified. The existing SBP XLS and template-based JomPAY XLSX regressions continue to pass. The recurring Cron job is a separate deployment operation; this follow-up does not activate it or perform a bank upload or payment.

## Deployment

The migration was applied to the linked HG-Claims database after the two existing v2 migrations, using a protected backup and an atomic financial-preservation guard. The guard passed, with zero legacy fixed-amount exceptions. A read-only postcheck confirmed zero supplier Auth accounts, zero supplier role assignments and the active JomPAY no-verification rule. Existing supplier records, roles, recurring schedules, claims, payments, receipts and frozen batches were unchanged. For other environments, apply it in the same order and deploy the matching frontend. Preserve the existing private key tables and financial history in backups. Use a protected application backup and before/after record fingerprints for hosted deployment. No production environment-variable changes are required.

To inspect legacy fixed-amount exceptions before validation:

```sql
SELECT id, utility, payee_id
FROM public.recurring_payments
WHERE amount_mode = 'FIXED' AND (fixed_amount IS NULL OR fixed_amount <= 0);
```

Rollback must restore matching dispatcher/helper definitions with the application. Keep all existing records, payment revisions, history and keys. Do not delete generated bills, reverse completed payments or rewrite frozen batches to roll back interface changes.

## Claim actions and reimbursement navigation — 2026-11-12

The claim list, approval inbox, shared claim detail and Finance queue now use consistent button heights, readable controls, centered content and tablet/mobile card lists. Review actions are separated from duplicate, classification editing and delete actions. Optional empty purpose sections and duplicate Processed badges are removed. Receipt previews are keyboard accessible. Return/reject dialogs have associated labels and retain mandatory notes. Per-claim Print is removed; existing print URLs redirect to claim details.

Reimbursements now contains Bank Transfer and JomPAY tabs. Each has Claims and Bank files views. Finance can select approved bills on a phone, create a separate JomPAY batch, download the supplied B1 `.xlsx`, and find previously created files under Bank files. Active, processed and all file filters preserve payment history access. Old JomPAY URLs redirect to the same destination. The existing bank-transfer generator, JomPAY template renderer and server reservations remain unchanged.

A shared download control shows errors at the action and allows retry. A successful creation/download is not reported as failed merely because a subsequent state refresh fails. Batch details refresh their Finance domain when opened. Selection is validated against the current payment method and eligibility; the selected count and amount use the same eligible claims as the command.

The source template was checked again against the embedded template: SHA-256 `2cd25ce33c219a898354471021ae204ce96d2ff504ce91d86ae4a30c27a98cc2`, exact header, style XML, widths, margins and page setup. The export retains `.xlsx` because that is the supplied format. The template and SBP BIFF8 renderer require no changes.

No new database migration or production operation is included in this follow-up. Deploy the frontend/application after the existing three migrations. Previously created batches and immutable financial data remain authoritative on rollback.

Final follow-up verification:

- `npm run typecheck`: passed.
- `npm run lint`: passed, 0 errors and 93 existing warnings.
- `npm test`: 183 tests in 21 files passed.
- `node tests/v2-backend.integration.mjs`: 122 assertions passed with fresh isolated local fixtures.
- `npx playwright test`: all 12 scenarios passed against the production build. The added end-to-end case creates two same-payee JomPAY bills, selects them in Reimbursements on a 390px viewport, creates the actual database batch, tests a temporary download failure/retry, downloads/parses the real file, checks separate rows/leading zeros/amounts/hash and confirms both claims remain Approved. It also verifies download discovery after returning to Bank files.
- The two additional UI scenarios check claimant and Finance/review screens at 390, 768 and 1440px, action hit heights, absence of nested interactive controls/Print, keyboard receipt previews, dialog validation, active navigation states, page centering and horizontal overflow. Review-dialog cancellation leaves the claim version/status unchanged.
- `npm run build`: passed in production mode using only isolated local Supabase settings. Screenshots of the updated claim detail, mobile Finance review and JomPAY Bank files view were visually reviewed.

The three new browser scenarios were rerun against the final production build after the last navigation refinement: 3 passed. The follow-up is on `fix/claims-ui-jompay-tabs`, based on current main.

These are application/template and local database checks. They do not establish actual Alliance Bank portal acceptance.
