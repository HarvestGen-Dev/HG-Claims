# Live role consolidation and JomPAY supplier fix

The user requested correction of existing Supabase role assignments and a JomPAY supplier blocker on 2026-11-11.

## Cause

The frontend was using the v2 roles and supplier screens, while the linked HG-Claims database still ended at migration `20261108211000`. It had no FINANCE catalog entry or JomPAY payment-method columns. Two users held both FINANCE_OFFICER and SYSTEM_ADMIN; the new labels rendered both as Finance. The old `create_payee_profile` handler required a bank account for every payee, including JomPAY.

## Applied database correction

Applied the existing tested migrations, in order:

- `20261110070626_claims_workflow_v2.sql`
- `20261110164319_jompay_bulk_b1_template.sql`

The migrations ran in one transaction with a lock timeout, migration-history registration, role-preservation assertions and before/after financial fingerprints. The deployment rolled back on any failed assertion. A protected application-data/function/catalog backup was captured outside the repository before applying the update. The standard direct PostgreSQL dump connection timed out; the backup used a read-only HTTPS management query instead and includes 27 tables and 37 function definitions. It is an application-level recovery backup, not a full cluster/Storage backup. Existing Auth accounts and Storage objects were not modified.

Final assigned roles: five FINANCE grants, zero legacy Finance/Admin/Claimant assignments and zero users with duplicate Finance aliases. All previous Finance/Admin users retained Finance access. Legacy role catalog entries and historical actor-role values remain for history. Every authenticated active user still has baseline own-claim access without a privileged role.

JomPAY supplier saves now reach the payment-method-aware handler. They require biller name, numeric Biller Code and Reference 1, with Reference 2 optional. Bank, account holder and account number validation runs only for Bank Transfer. A live create/edit probe passed with no bank details; the entire probe was rolled back, leaving no test supplier behind.

## Preservation and verification

- All three existing claims, two batches, one payment and five profiles remained present.
- Claim amounts/statuses/ownership/approval snapshots, batch states/references/fingerprints, instruction bank destinations/amounts, payment records, receipt rows, reservation links and profile bank destinations passed the atomic preservation guard.
- A separate read-only post-deployment comparison confirmed unchanged claim, batch, instruction and payment fingerprints and counts.
- No live bank upload, payment completion, outbound message or production environment-variable change was performed. Recurring Cron was not activated by this correction.
- Hosted advisors retained pre-existing guarded-RPC/Auth warnings and RLS performance notices. The three mutable encryption-function search-path warnings were resolved by the v2 definitions. No unrelated Auth configuration was changed.

## Frontend regression protection

`currentUserRoles` canonicalizes legacy Finance aliases and deduplicates displayed privileges in the account menu, users list and user-role editor. This also handles a cached pre-migration profile without changing historical audit labels.

The supplier payment-method and bank selectors now have explicit label/control associations. The browser suite includes creating and editing a JomPAY supplier with no bank-transfer fields, alongside the existing banking, claims and duplication regressions. Verification passed: `npm test` (177 tests in 19 files), 99 local database assertions, all five browser scenarios, type checking, lint (0 errors, 99 warnings) and the production build. See the main implementation report for final command results. Refresh the application to replace any cached legacy role profile.
