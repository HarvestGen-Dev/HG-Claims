# HG-Claims v2 repository audit and implementation plan

Audit date: 2026-11-10. Feature branch: `feat/claims-workflow-v2`.

## Existing architecture

Next.js 15.5 / React 18 / TypeScript App Router; Tailwind and local UI primitives. Browser domain clients use a shared, versioned workspace store. Next API services authenticate using Supabase SSR and delegate transactional mutations to `nlcc_command` / `private.command`. PostgreSQL is the authoritative domain layer; no ORM. Supabase Auth, one-hour database-enforced sessions, private receipt Storage, RLS, scoped snapshots and pagination are already implemented. Deployment targets Vercel (`output: standalone`). No deployed recurring job exists.

The existing lifecycle is draft → direct Finance review → receipt verification/approval → approved snapshot and eligibility → atomic bank reservation/finalization → BIFF8 XLS export and SHA-256 record → explicit bank upload → transfer reconciliation and payment record. Failures release claims; void releases unpaid instructions. Export does not settle payment. Internal banking statuses and SBP_BIFF8_V1 must remain.

Roles are currently Claimant, Finance Officer, System Administrator, with recently added Team Lead and legacy roles. `ministry_team_leads` and `ministry_budgets` exist. Payee-only profiles reuse bank profiles. Expense categories, cost centres, settings, in-app notifications, audit logs, workflow instances and approval history exist.

## Audit findings and gaps

| Requirement | Existing support / implementation needed |
| --- | --- |
| Baseline authenticated access | Current frontend and SQL require a role. Remove that requirement. Only TEAM_LEAD and FINANCE are assignable; migrate legacy grants without modifying ownership. |
| Finance access | Admin and Finance are separate. Consolidate capabilities and retain legacy compatibility for historical data. |
| Team approval | Membership exists; no per-team switch. Add switch, assignment validation, self-lead bypass and scoped actions. |
| Budget privacy | Existing SQL snapshot and SELECT policy expose all budgets. Restrict in SQL and serialized snapshots. Never gate submission on budget. |
| Claim form | Receipt-last, declaration, mandatory descriptions, no beneficiary classification. Replace with upload-first, Me/supplier, Team context, item classification. |
| Directory lists | Categories exist; add managed speaker/event/mission/meeting values and retain custom text. Preserve legacy Teams/categories rather than guessing mappings. |
| Finance corrections | Historical handler permits bank edits. Restrict to classification fields with field-level audits and version checks. |
| Verification | No payment-detail verification fingerprint. Add revision-aware verification and private audit history. |
| Banking | Preserve existing adapter, template, reservation and reconciliation. Correct payee aggregation identity and encryption handling. |
| JomPAY | No supplied JomPAY template found in repository/workspace search. Implement independent bill rows and frozen domain batches; bank-compliant export is blocked until actual template is supplied. |
| Recurring | Add four supported utilities, fixed/variable schedules, persisted periods, 14-day draft generation, 7-day reminders, KL timezone and database Cron. |
| Statuses | Preserve stored statuses; centralize Submitted / Returned / Approved / Processed presentation. |

Recent `20261108174500` replaces `private.command` with an incomplete variant, including attachment column names that do not match the schema and missing current UI commands. Restore the complete previously implemented command path before extending it. The existing encryption migration includes a source-controlled encryption key: do not claim production key-management readiness; document rotation as deployment work, preserving ability to read historical ciphertext.

## Migration strategy

Add forward migrations only, on a development database. Never reset or mutate production. Extend existing profiles, claims, expenses, ministries and reimbursement tables. Retain legacy status values, role catalog records and financial history. Migrate role assignments with an audit record; remove baseline Claimant grants. Retain unmappable historic Team/category values and report them for Finance review. Add constrained directory kinds and unique normalized names, recurring period uniqueness and active instruction uniqueness. Sensitive data is restricted to owners/Finance; Team Leads do not need bank details. Rollback application and database functions together; do not drop new financial tables after use.

## Implementation phases

1. Foundation: two privileged roles, baseline permissions, RLS/snapshot privacy, team switch, category seeds and managed context lists.
2. Claims: form order, optional receipts/descriptions, suppliers, validated context/beneficiary fields, Team Lead routing, return/resubmit, Finance classification audit.
3. Payments: verification revisions, official labels, preserve SBP exports, separate JomPAY frozen rows/reservation/failure/void. Block unsupported export clearly.
4. Recurring: Finance configuration, utilities-only schedules, idempotent billing periods, SQL scheduler, deduplicated in-app reminders and management UI.
5. Verification: meaningful domain and database integration tests, mobile/desktop browser coverage, typecheck/lint/test/build, implementation report and deployment instructions.

## Regression-sensitive areas

Bank identity must be receiving payee, not submitting user. Existing encrypted account values must be decrypted before grouping/export and protected afterward. Approval snapshots, content/file fingerprints and reservation links must remain immutable. A Finance correction cannot change amount/payee. Team selection never grants team visibility. Returned drafts preserve ownership and new workflow history. All command paths require active sessions and optimistic versions. Variable bills need blank amounts without allowing zero-valued submitted expenses.

## Baseline verification

- `npm test`: PASS, 17 files / 135 tests.
- `npm run build`: PASS, with existing ESLint warnings.
- No production database or banking connection used.
- Existing tests include significant mock and SQL source-inspection coverage; these alone do not verify migration execution or bank acceptance.

## Testing strategy

Test baseline users with empty and absent roles, combined roles, team scope, lead self-bypass, required context and beneficiaries, Other explanations, monetary precision, protected corrections, payment revisions, bank grouping versus individual JomPAY rows, frozen snapshots, duplicate reservations, void/failure releases and calendar/idempotency boundaries. Run integration tests only against an isolated local backend. Browser tests must use local fixtures. Actual Alliance portal acceptance and missing JomPAY template remain external verification gates.
