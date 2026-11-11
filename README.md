# Harvest Generation Expense Portal

Next.js 15, React 18, TypeScript, and Supabase Auth, PostgreSQL, and private Storage.
Claims, receipts, approvals, payments, and audit records use the real backend.
Demo accounts and browser-only persistence are not used by the application.

## Development

Install dependencies with `npm ci`. Configure the four variables in `.env.example`
in your ignored `.env.local`, using your development Supabase project credentials.
Run `supabase start` for a local backend, then `npm run dev`.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:backend
```

Backend tests require running local Supabase and create synthetic users and claims.
They refuse a non-local API URL. Set `NLCC_TEST_WORKDIR` to test a separate CLI workspace.

## Pull requests

Use the [pull request template](.github/pull_request_template.md) to describe the
problem, changes, actual validation results, deployment/rollback steps, and known
limitations. Include mobile and desktop evidence for UI changes where relevant.
Keep descriptions current with the final implementation and mark checks as not
run when they were skipped. Remove optional sections that do not apply.

## Deploy to Vercel

Import this repository with the Next.js framework preset. Use `npm ci` and
`npm run build`, and keep the default Next.js output settings.
Add these variables to Vercel's Production environment:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Hosted project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public browser key from that project |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for administrator invitations |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS application origin, without a trailing slash |

Never commit `.env.local` or `.env.production.local`. Never prefix the service key
with `NEXT_PUBLIC_`. Do not set `NLCC_BUILD_DIR` on Vercel. Use a separate Supabase
project for previews instead of granting preview builds access to production data.
Redeploy after changing environment variables.

### Supabase Authentication and Email

1. Set Auth > URL Configuration > Site URL to the canonical Vercel/custom domain.
2. Allow `https://YOUR_DOMAIN/auth/callback` and
   `https://YOUR_DOMAIN/auth/callback?next=/reset-password` as redirect URLs.
3. Disable public signup and anonymous sign-in; require email confirmation and a
   minimum password length of 12.
4. Configure Auth > SMTP Settings with a verified sender and provider credentials.
   For Resend, configure its SMTP credentials here, not a `RESEND_API_KEY` in Vercel.
5. Replace the Invite user and Reset password email template bodies with
   `supabase/templates/invite.html` and `supabase/templates/recovery.html` respectively.
   These token-hash links establish the server session through `/auth/callback`;
   they do not depend on a PKCE verifier in the browser that opens an invitation.
6. Test invitation and password recovery emails on the deployed domain. The initial
   administrator can use Forgot password to verify the mailbox and set a password.

The database enforces a one-hour sign-in limit for claims, bank details, and receipts.
Apply the hourly-session migration before deploying the corresponding app code.
Set the hosted JWT expiry to 3,600 seconds. If your Supabase plan includes time-boxed
sessions, set the time box to one hour so Auth also stops refreshing expired sessions.
Users signed in for more than an hour will need to sign in again after rollout.

The application does not currently send claim-status emails. Those are distinct
from Supabase Auth invitations/recovery. In-app claim notifications are implemented.

### Database and Roles

The confirmed hosted project uses the migrations in `supabase/migrations`. For a new
project, authenticate with `supabase login`, link the intended project, review
`supabase db push --dry-run`, then run `supabase db push`.

Use `node tools/bootstrap-admin.mjs PROJECT_REFERENCE ADMIN_EMAIL` for the first
administrator. It creates an unverified account without a password or outgoing email.
Every active authenticated member can submit claims and track their own claims, including users with no assigned roles. Only TEAM_LEAD and FINANCE are assignable; a user may hold both. Teams optionally require Team Lead review, with a mandatory self-lead bypass. Finance may approve its own claims. Display statuses are Draft, Submitted, Returned, Rejected, Approved and Processed.
See `PRODUCTION_SETUP.md` for verified setup status and outstanding launch work.

See [SITE_AUDIT.md](SITE_AUDIT.md) for the latest functional audit, fixes, verification, and remaining configuration items.

## Claims workflow v2

Apply `20261110070626_claims_workflow_v2.sql` and then
`20261110164319_jompay_bulk_b1_template.sql`, followed by
`20261111100656_payment_management_validation.sql`, before deploying the v2 application.
Review [the implementation report](docs/hg-claims-v2-implementation-report.md) and
[workflow architecture](docs/hg-claims-v2-workflow.md) for deployment, migration,
financial invariants and the persistent recurring billing job.

The existing Alliance Bank BIFF8 XLS adapter is retained. JomPAY has separate frozen
bill instructions and reconciliation. Its XLSX export now uses the supplied
`JomPay_Bulk_Sample_B1.xlsx` template, preserving one row per bill and text identifiers.
JomPAY payees have no user account or verification stage. See [the JomPAY file contract](docs/hg-claims-jompay-b1-template.md). Bank-portal acceptance
remains an external verification step.

`npm run test:backend` now exercises v2 against an isolated local Supabase stack on
port 58321. It never reads production env files and refuses a non-local target.
`npm run test:e2e` uses the local fixtures written by that suite and an app on port
3100 configured to the same isolated backend. See the report for reproducible setup.

## Finance reimbursement files

Open **Reimbursements**, then choose **Bank Transfer** or **JomPAY**. Under **Claims**, select approved items and create a batch. Download its file from the batch details or the **Bank files** view. Bank Transfer uses the existing Alliance BIFF8 `.xls`; JomPAY follows the supplied `JomPay_Bulk_Sample_B1.xlsx` and keeps each bill as a separate row. Exporting a file never confirms payment completion. The former `/finance/jompay` address redirects to the JomPAY tab. Per-claim Print has been removed; old print links open claim details.
