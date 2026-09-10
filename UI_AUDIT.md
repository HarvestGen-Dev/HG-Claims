# UI and Workflow Audit

## Changes

- Rebuilt sign-in as a simple, branded form. Removed the ignored password field, ineffective remember-session checkbox, and password recovery screens that falsely reported success. Demo access is explicitly identified.
- Improved shared text sizes, contrast, focus indicators, control sizes, section headings, and spacing across claimant, approval, finance, and administration screens.
- Replaced stacked claim-form cards with divided sections and reduced dashboard decoration. Added mobile claim lists in place of wide tables on the main claimant screens.
- Fixed the app shell's horizontal overflow, header sizing, mobile navigation focus management, and dialog keyboard handling.
- Synchronized repeated global searches with claim filters. Matched dashboard status links to their counts and scoped My Claims to the signed-in claimant.
- Corrected ministry/cost-centre selection, associated form labels with their fields, focused validation errors, and added unsaved-change protection for link navigation and browser unload.
- Added inline receipt errors, configured file limits, keyboard upload access, and durable browser receipt storage. Previews no longer substitute an unrelated image or claim private cloud storage.
- Persisted demo claims, settings, profiles, notifications, and workflow changes across reloads. Fixed attachment updates being dropped when editing a saved draft.

## Verification

- All 14 Vitest tests passed, including new draft/attachment and profile/notification persistence regressions.
- Production build passed with an isolated output directory: `NLCC_BUILD_DIR=.next-check npm run build`.
- Browser checks at 1440px and 390px covered dashboard, claims, new claim, profile, notifications, approval, finance, reports, and administration routes. Privileged routes were also checked with the administrator account.
- Focused browser checks passed for sign-in, receipt-required validation, upload, submission, receipt preview after reload, incomplete draft save, ministry/cost-centre changes, repeated search, unsaved navigation, and mobile menu dismissal.
- Reviewed desktop and mobile screenshots. No page-level horizontal overflow or runtime JavaScript errors occurred in the checked flows.

## Remaining Boundaries

This is still a local demo, not a production financial system. Authentication and account switching use sample profiles; there is no password verification or recovery service. Workspace data lives in localStorage and receipt files in IndexedDB. Clearing browser data removes them, and changes are not synchronized between users, devices, or concurrently open tabs.

Existing sample attachments may not contain real receipt files. Unavailable files are shown explicitly. Administrative CRUD, every approval edge case, printing, and all browser/accessibility combinations were not exhaustively exercised in the browser; the existing workflow tests cover the core approval/payment lifecycle.

The optional `NLCC_BUILD_DIR` setting isolates verification and preview artifacts from an already-running Next.js server. Default development behavior is unchanged.
