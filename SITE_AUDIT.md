# Site audit — 19 September 2026

Audited `https://nlcc-claim.vercel.app/`, the production application code, and the linked Supabase database. Live browser checks used an authorized account. No real claims were submitted, approved, paid, or deleted by this audit; database mutation tests ran in transactions that rolled back. No invitation or recovery emails were sent.

## Findings fixed

| Area | Defect | Correction |
| --- | --- | --- |
| Claim workflow | Production still used ministry/final approval stages | One shared Finance Review step; existing pending claims migrated while retaining workflow history |
| Workspace writes | Several endpoints swallowed errors or used mock data and returned success | All workspace mutations use the authenticated transactional database command; rejected writes return errors |
| Claim deletion | Admin endpoint could delete submitted claims and partially delete child records | Database restricts deletion to draft/cancelled claims and deletes atomically |
| Master data | Partial updates could null required fields; cost-centre ordering was not persisted | Merge patches with locked existing records; persist display order; preserve references when deactivating records in use |
| Claim return/resubmission | Return/rejection details were lost; old receipt verification remained visible after resubmission | Persist decision details; only expose verification from the current submission |
| Permissions | UI could offer prohibited payment/create/edit actions | Align controls and handlers with claimant/submitter, role, and status checks |
| Receipt storage | Failed uploads could appear successful; memory cache could serve receipts after an account change | Require successful private-storage upload; reauthorize every download |
| Invitations | Stored hashes accepted as tokens; failed provisioning was ignored; usage increments were not atomic | Hash-only lookup, server-only transactional redemption, account cleanup on provisioning failure, no mock fallback |
| Invitation links | Admin UI reconstructed links from hashes | Raw links are shown at creation only; old rows do not offer invalid reconstructed links |
| Database exposure | Obsolete privileged helpers were executable by public roles | Revoke access and pin search paths; restrict invitation provisioning to service role |
| Settings | Save All could partially commit; sequence digit and notification settings were ignored | Transactional settings batch; validate limits; honor numbering width and in-app notification switch |
| Workflow settings | UI offered obsolete multi-stage routing and thresholds | Replace with the actual direct Finance Review process |
| Export | Spreadsheet formulas could be interpreted from user-entered text | Escape potentially executable CSV cell values |
| Print view | Missing claims showed an endless loading message; mobile controls/table overflowed | Explicit missing/access-denied state and responsive screen layout preserving print format |

## Verification

- 88 automated tests passed, including production API, repository, upload, invitation provisioning, and permission regressions.
- TypeScript check and production build passed. Build reports 128 non-blocking lint warnings, primarily pre-existing `any` and unused symbols.
- Production dependency audit: zero reported vulnerabilities.
- Live browser sweep: 21 routes at 1440px and 390px, 42 page checks; no page exceptions or missing page headings. The print-page mobile overflow found in this sweep was fixed afterward.
- Local production-build browser checks covered the corrected admin, claims, finance, profile, workflow, settings, and missing-print routes, with application writes blocked.
- Real-schema rollback tests passed for draft/save/submit, direct finance routing, receipt attachment, return/resubmit, fresh verification, approval, and payment.
- Database integrity tests passed for profile onboarding, invitation consumption/exhaustion, hidden token hashes, submitted-claim deletion protection, master partial updates/order, and privileged helper restrictions.
- Post-migration security advisor no longer reports the exposed privileged functions. One Auth configuration warning remains: leaked-password protection is disabled.

## Limits and remaining configuration

- `npm run test:backend` requires local Supabase/Docker, which is not running. Its fixtures were updated to the current direct-finance workflow, but that separate suite was not executed successfully. Real-schema rollback tests were used for database verification instead.
- New-account creation through the live Auth service, invitation/recovery email delivery, and actual receipt uploads were not performed against production. Those would create accounts, send messages, or retain files. API failure paths are covered by automated tests; existing-account login and existing-receipt access are browser-checked.
- Claim-status email delivery is not implemented. The settings UI now explicitly shows it as unavailable instead of offering a switch that does nothing. Supabase Auth invitation/recovery emails are a separate feature.
- Leaked-password protection remains an external Supabase Auth configuration item; the audit did not change account passwords or subscription settings.
- This is a functional and targeted security audit, not an assertion that every possible data combination or concurrent browser interaction has been proven correct.

## Repeatable checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
supabase db query --linked --file tests/claim-save-submit.sql
supabase db query --linked --file tests/site-integrity.sql
```

The SQL files roll back all test changes and require suitable existing active accounts, master records, and an unused uploaded receipt. They do not retain test users or claims.
