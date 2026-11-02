# Production Setup

## Verified on 2026-11-03

- Hosted project: `qynumdarrnkqzctineiz` (HG-Claims).
- All 13 repository migrations applied to the project.
- All public application tables have RLS enabled; clients cannot insert claims directly.
- The receipts bucket is private, and anonymous workspace access is denied.
- Hosted database security advisor: no warnings or errors.
- Local backend suite: 26 assertions passed, including concurrent approvals and payments.
- Initial administrator provisioned using Supabase Auth, with CLAIMANT and SYSTEM_ADMIN roles.
  The account remains email-unverified, without an assigned password. No activation email sent.
- Matching public and server credentials are in the ignored `.env.production.local`.
  Configure hosting secrets separately; never commit this file or expose its server key.

## Required Before Launch

1. Confirm the production application origin and set `NEXT_PUBLIC_APP_URL` in hosting.
2. Configure Supabase Auth Site URL and the exact `/auth/callback` redirect URL for that origin.
3. Disable public and anonymous signups, require email confirmation, and use a minimum
   password length of 12. Local `config.toml` has not been pushed to hosted Auth.
4. Configure a verified SMTP sender for invitations and recovery. Default Supabase email
   delivery is restricted and is not suitable for production onboarding.
5. Send a verified account activation/password-setup email to the initial administrator
   after confirming the redirect and email templates work with the application's callback.
6. Assign ministry leaders, finance officers, and final approvers before accepting claims.
   No approval roles are fabricated or assigned to the administrator automatically.
7. Complete application build and deployed browser workflow checks, and configure backups,
   monitoring, and notification email delivery. Claim email notifications remain disabled.

## Administrator Bootstrap

Run only for a confirmed project after migrations are installed:

```sh
node tools/bootstrap-admin.mjs PROJECT_REFERENCE ADMIN_EMAIL
```

This uses the CLI login, keeps privileged credentials in memory, and refuses to add a
different bootstrap administrator once one already exists. It does not send email,
verify mailbox ownership, or set a shared password.

## Local Verification Environment

The original `supabase_db_NLCC` database reported a corrupted replication checkpoint.
It has not been reset or deleted. A separate verification instance was created at
`/private/tmp/nlcc-verify`, with API port 56321 and database port 56322.

```sh
NLCC_TEST_WORKDIR=/private/tmp/nlcc-verify node tests/backend.integration.mjs
```

The suite creates synthetic accounts and claims only on localhost. Do not run test
fixtures against the hosted project. The original `.env.local` remains unchanged and
still points at the original local instance; it requires repair or explicit replacement.
