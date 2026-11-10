# HG-Claims v2 implementation report

Branch: `feat/claims-workflow-v2`. Baseline commit: `c66f7ca1718f527d3f92d283747c93b06ad59c93`. Verification date: 2026-11-11 (Asia/Kuala_Lumpur).

## Implementation

| Area | Delivered behavior |
| --- | --- |
| Access and roles | Every active authenticated user has baseline submission/draft/own-history access with an empty role list. Only TEAM_LEAD and FINANCE are assignable through invitations, profile commands and a database role-assignment trigger. Legacy Finance Officer/System Administrator grants migrate to Finance; Claimant grants become baseline access. Existing Team Lead memberships receive the matching role. Users may hold both privileged roles. |
| Authorization | Database ownership and team assignments govern reads and mutations. Team selection grants no visibility. Budget rows and snapshots are scoped to Finance or assigned Team Leads. Team Leads receive no bank account or JomPAY reference information, including nested detail relations. Submitting a managed-supplier claim does not expose that supplier's private payment references to an ordinary member. Finance retains management access and may approve its own claims with normal actor/timestamp history. |
| Teams | Reuses ministries, membership and budget tables. Adds per-Team approval and context configuration. Only exact known Team names receive inferred context kinds; missing canonical special Teams are added without remapping old financial references. Invalid reviewer configuration is rejected and in-flight team reviews retain an active reviewer. No new budget setup module was introduced; the existing budget operation remains supported. |
| Claim form | Upload first, then Me/supplier, Team/context, line items and final actions. Camera and file inputs, optional receipts by default, no declaration step, optional merchant/description except configured requirements and Other. All 16 classifications, conditional beneficiary choices, receipt numbers and correct cent-based totals. Server repeats validation. |
| Review workflow | Optional Team Lead review, mandatory self-lead bypass, then Finance. Return/reject require notes. Returned claims remain editable and resubmit through current routing. Finance can return an unreserved Approved claim for payment-detail/amount correction, invalidating its approval snapshot. Pending Team reclassification rebuilds review routing. |
| Finance corrections | Restricted field allowlist; amount/payee/payment edits are rejected server-side. Team/context and item classification, beneficiary and description edits have per-field editor/time/old/new audits. |
| Duplicate Claim | New independent Draft, new ID and retry key. Keeps every Part 1 identity/contact/payment field and all eligible attachment rows. Clears Team/context, purpose, reference, expenses, approval/payment/batch relationships, using today's default date. Shares protected storage objects through independent rows; removing/deleting the duplicate preserves the original. Supplier snapshots survive saving despite later directory changes, unless explicitly refreshed. |
| Managed data | Finance CRUD/deactivation for suppliers, events, missions/outreach, meetings/conferences, speakers and expense classifications. Case-insensitive managed-name uniqueness. Other text is retained and can be promoted by Finance. No ledger codes appear in claimant classification selectors. |
| Payment verification | New/changed payment details become Unverified. Revision-checked profile verification and claim-specific verification. Finance sees “Review bank details before approving.” without an approval block. Payment changes are privately audited; general logs omit payment identifiers. New ciphertext uses a generated private database key; legacy ciphertext remains readable. |
| Statuses | Draft / Submitted / Returned / Rejected / Approved / Processed presentation across forms, queues, dashboards, details, reports, CSV and payment controls. Banking state values remain distinct and stored claim statuses remain compatible. Historical Cancelled records remain readable. |
| Alliance Bank transfers | Retains original XLS library, adapter, SBP_BIFF8_V1 contract, annual references, bank directory and frozen transfer rows. Receiving-payee identity and decrypted exact destinations govern aggregation. Server SHA-256, reservation uniqueness, export hash validation, explicit upload/confirmation, failed transfer release and void/release remain. Creation, export and completion are distinct. Whole-batch completion leaves failed instructions and their claims unchanged. |
| JomPAY | Separate payment-method batches using existing reservation/reconciliation infrastructure. Individual bills never aggregate. Text identifiers preserve zeros; each frozen instruction includes biller/code/references and configurable failure emails. The supplied B1 XLSX template is integrated with seven-column export, format/round-trip validation, SHA-256 recording and Record Bank Upload. Its original header styling, widths and print settings are retained; identifiers and two-decimal amounts are text cells. Historical pending-template batches remain exportable without rewriting their frozen version/fingerprint. Bank-portal acceptance remains externally unverified. |
| Recurring bills | Finance configuration for Unifi/Indah Water fixed bills and TNB/Air Selangor variable bills. Defaults to Utilities. One active schedule per configured payee. Persistent schedule/period records, idempotent 14-day generation, blank variable amount, exact previous-calendar-month reference, optional attachments and deduplicated 7-day in-app reminders. Active dates, shorter months, retries and missed executions are handled. Finance reviews/submits ordinary Drafts. No variation alerts exist. |
| Background receipts | Submission does not await uploads. Completed uploads attach to the newly saved claim through an ownership-checked, audited command while the claim remains editable or under review. A failure to attach after approval is surfaced to the user. |

## Architecture and screens

See [complete claim and scheduler diagrams](hg-claims-v2-workflow.md).

Existing screens updated: claimant dashboard, creation/editing, details/history/print, Team Lead queue and assigned-team view, Finance queue/dashboard/reports, Teams, users/invitations, categories, batch queue/detail, settings and navigation. Added supplier management, managed context lists, JomPAY bill queue/detail and recurring utility configuration/generated bills. The existing brand, UI primitives and design tokens are reused.

Domain layering remains browser clients/store → authenticated Next API services → transactional PostgreSQL commands. The latest repository migration had replaced the central command handler with an incomplete variant; v2 restores the complete existing bank command engine behind an allowlisted dispatcher. Scoped Finance refresh now returns updated authorized claims so successful review actions do not clear the claim store.

## Database migration

`supabase/migrations/20261110070626_claims_workflow_v2.sql` and the follow-up `20261110164319_jompay_bulk_b1_template.sql` are additive and transactional. No database reset or deletion of claims, payments, receipts, batches, users or financial history is required.

It extends profiles, ministries, claims, expenses, attachments and existing reimbursement tables. New tables: `claim_dropdown_values`, `claim_classification_changes`, `recurring_payments`, `recurring_billing_periods`, and private payment-detail/key storage. The follow-up migration enables the actual B1 template, preserves historical snapshots, validates JomPAY export/upload actions and includes configured failure emails in new batch snapshot fingerprints. New indexes cover normalized directory names, per-claim attachment paths, active recurring payees and unique billing periods. The existing partial unique active-claim reservation index is preserved.

Role catalog entries and stored status strings remain available for historical interpretation. Unsupported old role assignments are removed; migration audit rows retain old assignments. No ambiguous legacy Team/category data is guessed or rewritten. Run `supabase/operations/v2-migration-review.sql` and have Finance review the retained legacy classifications/Teams. New forms offer the current classification set; historical selected values remain readable/editable.

Attachment uniqueness changes from global storage path to `(claim_id, storage_path)` to support independent shared-file attachment references. Application detach/delete never deletes storage objects. Do not add a storage cleanup process that deletes objects still referenced by another claim.

The generated encryption key and retained historical key must be included in protected database backups. New encryption uses `enc:v2:`; existing `enc:aes:` snapshots are preserved byte-for-byte. The old repository migration contained its historical key in source, so legacy ciphertext does not have the same key-secrecy guarantee as new writes. Historical rekeying requires a separate reviewed process that preserves frozen payment semantics and audit evidence.

## Verification evidence

Only isolated local Supabase projects were mutated. Production data, environment variables and live bank integrations were not changed.

| Command/check | Result |
| --- | --- |
| Baseline `npm test` | PASS — 135 tests, 17 files |
| Baseline `npm run build` | PASS — pre-existing lint warnings |
| Final `npm run typecheck` | PASS |
| Final `npm run lint` | PASS — 0 errors, 99 warnings |
| Final `npm test` | PASS — 176 tests, 19 files |
| `node tests/v2-backend.integration.mjs` | PASS — 99 assertions against actual isolated local Supabase |
| `npx playwright test` | PASS — 4 scenarios, production-mode app, Chromium |
| Final `npm run build` | PASS — isolated local configuration and `.next-v2-test` output |
| `supabase db advisors --workdir /private/tmp/hg-claims-v2-clean --type security --level warn` | PASS — no warning/error issues found, local database port 59322 |
| Complete migration replay on fresh local backend with pre-v2 fixtures | PASS |
| Historical migration assertions | PASS — role conversion, baseline access, original claim amount/status, frozen snapshot, encrypted bank destination, batch fingerprint/status and reservation retained |
| Persistent Cron installation | PASS locally — `hg-claims-recurring-drafts`, `5 17 * * *`, active |
| Actual Alliance bank portal acceptance | Not externally verified |
| JomPAY supplied B1 workbook contract | PASS locally — original layout/styles, exact text values, frozen rows, stable file SHA-256 and actual HTTP/UI download/upload; bank portal not externally verified |

Backend coverage includes roleless access, role combinations, team/budget scope, self-lead bypass, conditional fields, Other explanation, Finance financial-field rejection, classification audits, returns/resubmission, verification revisions, same-payee aggregation, duplicate reservations, frozen JomPAY rows, void/failure releases, processed confirmation, duplication independence/multiple receipts, recurring boundary/retry/reminder/reference behavior and session expiry.

Browser coverage uses 390×844 and 1440×1000 viewports, verifies no horizontal overflow on the main member flow, conditionally required beneficiaries, submission without receipts, independent duplication, management screens, actual HTTP BIFF8 download/re-download equality, an upload that finishes after submission, and template-based JomPAY download/upload/completion. JomPAY tests verify that export and upload keep claims Approved, and only explicit completion produces a JomPAY payment record. Local screenshots are stored outside the repository under `/private/tmp/hg-v2-*.png`.

The static/mock tests remain useful regression checks, but bank acceptance is not claimed from them. Failed intermediate test runs were corrected and rerun; the table above records the final outcomes. Production-mode browser testing found simultaneous post-login redirects; login now navigates once to the correct dashboard/onboarding destination. Sandbox-restricted browser/network attempts were rerun with permission against the same isolated targets.

## Reproducible local verification

1. Use a separate Supabase CLI workspace, copying this repository's `supabase/config.toml`, `templates/` and `migrations/`. Set `project_id = "hg-claims-v2-test"`, API port 58321 and database port 58322; use distinct remaining service ports. Do not link or push to production.
2. Start that workspace with `supabase start --workdir /private/tmp/hg-claims-v2-local`. For the verification environment, unrelated local services were excluded using `--exclude realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
3. Run `npm run test:backend`. The suite accepts only localhost API port 58321 and uses the standard isolated CLI demo credentials. It creates synthetic records and writes browser credentials only to `/private/tmp/hg-v2-browser-fixtures.json`.
4. Set `NLCC_BUILD_DIR=.next-v2-test`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:58321`, the isolated public key and `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100` explicitly. Run `npm run build`, then start that build on 127.0.0.1:3100 with the same environment. A separate output directory prevents cached public configuration from another build being reused. Use only local server credentials when testing invitation endpoints; no invitation delivery was tested here. Never use production-linked credentials for this verification session.
5. Run `npm run test:e2e`. The browser suite blocks Auth requests to a non-test origin. Run `npm run typecheck`, `npm run lint` and `npm test` as separate quality checks.
6. To repeat the historical upgrade check, use another new local workspace. Copy `tests/fixtures/v2-upgrade-before.sql` into that workspace's migration chain immediately before the v2 migration (as `20261109000000_upgrade_test_fixtures.sql`), replay the chain, and execute `tests/fixtures/v2-upgrade-after.sql`. That fixture migration must never be included in production migrations.

## Deployment steps

1. Review the branch and create a protected database backup, including private key/audit tables. Run the read-only migration inventory on staging and resolve any uncertain Team/category mapping with Finance; retain unmappable history.
2. Rehearse the migration against a recent staging copy. Verify at least one active Finance grant, legacy bank snapshot readability, team assignments, budgets, current batches and invitation conversion.
3. Apply both v2 migrations in timestamp order before deploying the matching Next.js application. Keep the existing Supabase/Vercel credentials and one-hour session configuration. No new production environment variables are required for the scheduler.
4. Confirm Finance and baseline member logins, dual-role review, no budget leakage, supplier verification and returned-claim editing. Obtain Finance confirmation of Unifi, Indah Water, TNB and Air Selangor JomPAY details and create their real schedules. Do not seed guessed biller codes, references, amounts, due dates or Teams.
5. Install `supabase/operations/install-recurring-job.sql` on the intended deployed database. It creates the persistent Postgres Cron job at 17:05 UTC, which is 01:05 the following day in Asia/Kuala_Lumpur. The function derives its business date explicitly in Malaysia time.
6. Monitor `cron.job` and `cron.job_run_details` through the Supabase Cron dashboard or the script's query. The deployment owner should check daily success and Finance should review generated Drafts/in-app reminders. A failed run rolls back; the next run catches up eligible periods. Trigger a controlled staging retry to confirm no duplication.
7. Validate SBP XLS with the authorized Alliance Bank operator using the bank's normal acceptance procedure. Local binary/round-trip verification does not establish bank portal acceptance.
8. Validate the template-based JomPAY B1 XLSX with the authorized Alliance Bank operator before operational use. The user-supplied sample is integrated and local contract/HTTP/UI tests pass; the sample alone does not establish portal acceptance. Compare identifiers, optional references, failure-email fields, amount text and individual bill rows during staging acceptance. See [the measured JomPAY contract](hg-claims-jompay-b1-template.md).
9. Keep existing Auth SMTP invitation/recovery checks in the launch procedure. Claim and recurring reminders are in-app; no new outbound status-email integration is claimed.

## Rollback and operational considerations

Pause the recurring job with `supabase/operations/pause-recurring-job.sql` during maintenance. This preserves schedules and generated bills.

No destructive automatic down migration is supplied. A pre-v2 application cannot safely process the new Finance role/JomPAY/recurring records. Before any v2 writes, rollback may restore the reviewed pre-deployment database/application backup together. After v2 writes, prefer a forward fix; retain the new tables, encryption keys, audit records, billing periods and frozen instructions. A compatibility rollback requires a reviewed role/function bridge and must prevent the old app from treating JomPAY as SBP transfers. Never drop new financial data or regenerate historical batch references as a rollback shortcut.

Repository local changes were present at task start. They were preserved; overlapping claim/role/batch modules were extended for the confirmed requirements. No force push or automatic merge is part of this release.

## External dependencies and limitations

- The supplied JomPAY template blocker is resolved. The actual B1 format is implemented and tested locally; live bank-portal acceptance is still required.
- Live Alliance portal acceptance of either payment path requires the authorized bank operator. No live banking operations were performed.
- Real utility billing details/schedules and production Cron activation require deployment configuration by Finance/IT; no values were guessed or written to production.
- Historical category/Team exceptions are preserved for Finance review. Legacy encryption key exposure remains relevant to historical ciphertext; new writes use the generated private key.
- Existing repository lint warnings may remain; final counts are recorded in verification results.

## Git deliverables

Implementation commit: `8dabd4c` (`feat: implement claims v2 roles, review, payees and recurring billing`). The documentation is committed separately on the same branch. See the branch history for the documentation commit and subsequent review amendments.

Branch: [feat/claims-workflow-v2](https://github.com/HarvestGen-Dev/HG-Claims/tree/feat/claims-workflow-v2). No merge into `main` is authorized or performed. The branch is pushed and [draft PR #12](https://github.com/HarvestGen-Dev/HG-Claims/pull/12) is open. The JomPAY-template follow-up is committed separately; its hash is provided with the handoff.

## Files changed

### Application and configuration

- `.gitignore`
- `next.config.mjs`
- `package.json`
- `src/app/(auth)/login/page.tsx`
- `src/app/(dashboard)/admin/audit/page.tsx`
- `src/app/(dashboard)/admin/categories/page.tsx`
- `src/app/(dashboard)/admin/dropdowns/page.tsx`
- `src/app/(dashboard)/admin/ministries/page.tsx`
- `src/app/(dashboard)/admin/page.tsx`
- `src/app/(dashboard)/admin/settings/page.tsx`
- `src/app/(dashboard)/admin/suppliers/page.tsx`
- `src/app/(dashboard)/admin/users/page.tsx`
- `src/app/(dashboard)/approvals/page.tsx`
- `src/app/(dashboard)/claims/new/page.tsx`
- `src/app/(dashboard)/claims/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/finance/batches/[id]/page.tsx`
- `src/app/(dashboard)/finance/batches/page.tsx`
- `src/app/(dashboard)/finance/claims/page.tsx`
- `src/app/(dashboard)/finance/jompay/page.tsx`
- `src/app/(dashboard)/finance/page.tsx`
- `src/app/(dashboard)/finance/recurring/page.tsx`
- `src/app/(dashboard)/finance/reports/page.tsx`
- `src/app/api/users/invite/route.ts`
- `src/app/api/v1/finance/batches/[id]/export/route.ts`
- `src/components/claims/AdminCorrectionModal.tsx`
- `src/components/claims/ClaimComments.tsx`
- `src/components/claims/ClaimDetailView.tsx`
- `src/components/claims/ClaimForm.tsx`
- `src/components/claims/ClaimStatusBadge.tsx`
- `src/components/claims/ExpenseItemsEditor.tsx`
- `src/components/claims/PaymentModal.tsx`
- `src/components/claims/PrintClaimView.tsx`
- `src/components/claims/ReceiptUploader.tsx`
- `src/components/finance/JompayBatchDetail.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/components/layout/BottomNav.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/lib/auth/context.tsx`
- `src/lib/auth/permissions.ts`
- `src/lib/auth/roles.ts`
- `src/lib/banking/jompay.ts`
- `src/lib/banking/jompay-export-adapter.ts`
- `src/lib/banking/templates/jompay-bulk-b1.json`
- `src/lib/banking/reimbursement-preview.ts`
- `src/lib/claims-v2.ts`
- `src/lib/data/repository.ts`
- `src/lib/domains/claims.client.ts`
- `src/lib/domains/finance.client.ts`
- `src/lib/domains/iam.client.ts`
- `src/lib/domains/store.ts`
- `src/lib/types/database.ts`
- `src/lib/utils/export-csv.ts`
- `src/lib/utils/formatters.ts`
- `src/lib/validations/claim.ts`
- `src/lib/validations/finance.ts`
- `src/services/claims/claims.service.ts`
- `src/services/finance/finance.service.ts`
- `src/services/master-data/master-data.service.ts`
- `src/services/shared/http.ts`

### Documentation

- `PRODUCTION_SETUP.md`
- `README.md`
- `docs/hg-claims-requirements-implementation.md`
- `docs/hg-claims-v2-implementation-report.md`
- `docs/hg-claims-v2-workflow.md`
- `docs/hg-claims-jompay-b1-template.md`

### Tests and tooling

- `playwright.config.ts`
- `tests/backend.integration.mjs`
- `tests/comprehensive-system-audit.test.ts`
- `tests/domain-services.test.ts`
- `tests/e2e/claims-v2.spec.ts`
- `tests/fixtures/v2-upgrade-after.sql`
- `tests/fixtures/v2-upgrade-before.sql`
- `tests/new-claim-model.test.ts`
- `tests/performance-optimizations.test.ts`
- `tests/simplified-roles-and-invitations.test.ts`
- `tests/v2-backend.integration.mjs`
- `tests/v2-domain.test.ts`
- `tests/jompay-export.test.ts`
- `tools/bootstrap-admin.mjs`
- `vitest.config.ts`

### Database and operations

- `supabase/migrations/20261110070626_claims_workflow_v2.sql`
- `supabase/migrations/20261110164319_jompay_bulk_b1_template.sql`
- `supabase/operations/install-recurring-job.sql`
- `supabase/operations/pause-recurring-job.sql`
- `supabase/operations/v2-migration-review.sql`
