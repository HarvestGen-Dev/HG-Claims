# New Life Community Church Expense Portal

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

The application does not currently send claim-status emails. Those are distinct
from Supabase Auth invitations/recovery. In-app claim notifications are implemented.

### Database and Roles

The confirmed hosted project already has all five migrations installed. For a new
project, authenticate with `supabase login`, link the intended project, review
`supabase db push --dry-run`, then run `supabase db push`.

Use `node tools/bootstrap-admin.mjs PROJECT_REFERENCE ADMIN_EMAIL` for the first
administrator. It creates an unverified account without a password or outgoing email.
Assign ministry leaders, finance officers, and final approvers before accepting claims.
See `PRODUCTION_SETUP.md` for verified setup status and outstanding launch work.
