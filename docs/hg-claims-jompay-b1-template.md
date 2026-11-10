# Alliance JomPAY B1 template contract

The user supplied `JomPay_Bulk_Sample_B1.xlsx` on 2026-11-11. Its SHA-256 is `2cd25ce33c219a898354471021ae204ce96d2ff504ce91d86ae4a30c27a98cc2`. The source file in Downloads was inspected without modification. Bank-portal acceptance is not established by the sample or local tests.

## Observed workbook layout

One XLSX worksheet, named `Sheet1`. Row 1 contains exactly these headers; data starts at row 2. No extra notes, totals, date columns or worksheets are added.

| Column | Header | Exported cell value |
| --- | --- | --- |
| A | Biller Code | Frozen identifier as text, preserving leading zeros |
| B | Reference 1 | Frozen required reference as text, including long identifiers |
| C | Reference 2 | Frozen optional reference as text; blank when absent |
| D | Amount | Positive amount expressed as text with exactly two decimal places, matching the supplied sample's text-format Amount column |
| E | Fail Email Address 1 | Frozen configurable system setting |
| F | Fail Email Address 2 | Frozen configurable optional setting; blank by default |
| G | Biller Name | Frozen payee biller name |

The template's green header fill, Calibri font, original column widths, text format and page settings are preserved. Identifier text cells intentionally preserve information that Excel numeric conversion could lose. Formula-looking values remain literal text, and XML-special characters are escaped.

## Implementation and frozen data

`src/lib/banking/templates/jompay-bulk-b1.json` embeds a sanitized copy of the original XLSX archive. The sample bill row, unused sample strings and document author/path metadata are removed. The sanitized archive SHA-256 is `732d7c44a6c8a3a33a21f6b044c3aa2a0bf3f99320add8b9f6a1745bc4d5ea42`; the server verifies it before rendering. The source sample does not seed supplier accounts, utility schedules or real claims.

`jompay-export-adapter.ts` uses the existing XLSX package's archive support. It changes only the worksheet data region and dimensions of that sanitized template. It preserves the remaining template parts and fixes ZIP timestamps so repeat downloads have identical bytes. The existing SBP BIFF8 adapter and dependency versions are unchanged.

The Finance-authenticated export endpoint renders frozen instruction snapshots, validates the resulting workbook against every expected cell, records the file SHA-256, and responds with `.xlsx`, the XLSX MIME type and `X-Template-Version: JOMPAY_BULK_B1_XLSX_V1`. Batch totals, individual-bill counts, text identifiers, references, emails and positive cent amounts are checked before download. Changes to directory payment details or export-email settings cannot change a previously frozen file. Re-exporting different bytes or changing a recorded filename is rejected.

Each bill remains its own instruction and export row even when multiple bills have the same payee. New snapshot fingerprints include the frozen bill details and failure-email settings. Previous `JOMPAY_TEMPLATE_PENDING` batches are accepted through a compatibility path; their original stored template version, content fingerprint and financial snapshots remain unchanged. An export audit records the actual B1 template used.

## Deployment and payment lifecycle

Apply `20261110164319_jompay_bulk_b1_template.sql` after the original v2 migration, before deploying the matching application. It enables only the measured B1 format; unknown template versions remain rejected. No production data or live bank service was used during development.

Finance downloads the XLSX, uploads it to Alliance Bank separately, and records the bank upload reference in HG-Claims. A recorded export is required before recording that upload. Both steps leave claims Approved. Finance records a completion reference only after payment actually finishes; only that explicit reconciliation creates the JomPAY payment record and displays Processed. Whole-batch completion also requires the recorded upload. Failed bills and voided batches follow the existing release/audit rules.

Rollback of this follow-up must restore the pre-B1 dispatcher/finalizer together with its matching application and disable JomPAY exports. Retain all new file hashes, snapshots, payments and audit history. Do not reverse payment completion or rewrite frozen instructions to roll back code. Use a reviewed forward fix after financial writes.

## Verification

- Template and workbook tests: source layout, no sample bill, original styles, exact cell types/values, leading zeros, long references, two decimals, configured email, separate rows, deterministic bytes, escaped text and rejection of invalid or inconsistent frozen data.
- Database tests: Finance-only export recording, supported template and extension, frozen hash protection, upload prerequisite/reference, historical pending-template compatibility, unchanged claim status on export/upload, failure and void release.
- Browser test: actual HTTP/UI download and re-download equality, workbook parsing, recorded file hash, bank upload recording, claim remains Approved, then explicit completion produces a JomPAY payment record. The existing bank-transfer XLS download regression also passes.
- Historical-upgrade assertions and local security advisors pass after applying the additive migration.

The remaining external check is acceptance by the actual Alliance Bank portal and the authorized Finance operator. No live upload or real payment was attempted.
