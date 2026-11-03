# HG-Claims — Full-Stack Performance Optimization Report

**Date:** 2026-11-04  
**Base Commit:** `ff9f8e4` (`main`)  
**Stack:** Next.js 15.5.24 (App Router), React 18.3.1, TypeScript 5.6.2, Tailwind CSS 3.4, Supabase Auth & PostgreSQL (RPC + RLS), Vitest, Playwright

---

## 1. Executive Summary

This engineering initiative identified, measured, and resolved full-stack performance bottlenecks across the Harvest Generation Claims Management (`HG-Claims`) application while preserving 100% of the existing technology stack, domain architecture, authentication & RLS rules, and Alliance Bank BIFF8 `.xls` reimbursement workflows.

### Key Measured Outcomes
1. **53% to 66% Reduction in First Load JS Across Every Route (-259 kB to -360 kB gzipped per route):**
   - Separated pure client-safe reimbursement eligibility/preview logic (`src/lib/banking/reimbursement-preview.ts`) from server/workbook `xlsx` generation (`src/lib/banking/bank-export-adapter.ts`), eliminating `xlsx` (734 KB raw) and `crypto-browserify` (~150 KB raw) from the root client `/layout` bundle.
   - Code-split `recharts` (`chunks/6930`, 373 KB raw) out of the initial `/finance` and `/finance/reports` bundles via `next/dynamic` (`FinanceOverviewChart`, `FinanceReportChart`), reducing `/finance` and `/finance/reports` First Load JS from **580 kB** to **220 kB** (**-62.1%**).
   - Code-split `ClaimDetailView` action modals (`ReturnClarificationModal`, `RejectModal`, `PaymentModal`, `AdminCorrectionModal`, `ReceiptViewerModal`) and `ExpenseItemsEditor`'s `ReceiptViewerModal` via `next/dynamic`, loading them only when opened.
2. **95.6% to 99.86% Reduction in Claims List API Payload Size:**
   - Introduced role-authorized server-side pagination, search, status/ministry/date-range filtering, sorting, and summary aggregation (`nlcc_query_claims` / `GET /api/v1/claims?page=...&page_size=...`) plus on-demand single-claim detail retrieval (`nlcc_claim_detail` / `GET /api/v1/claims?id=...`).
   - Added `bootstrap` snapshot support (`private.domain_snapshot('bootstrap')` / `GET /api/workspace?mode=bootstrap`) omitting historical `auditLogs` (up to 1,000 rows, ~336 KB) and nested claim comment/action histories during initial workspace bootstrap, while loading `/admin/audit` on demand.
3. **Domain-Scoped Client State Subscriptions, $O(1)$ Entity Lookups & Stale-Response Protection:**
   - Upgraded `WorkspaceStore` (`src/lib/domains/store.ts`) with per-domain version counters (`iam`, `master-data`, `claims`, `finance`, `notifications`), `subscribeDomains`, `subscribeSelector`, `upsertClaim`, concurrent `refreshDomain` request deduplication, monotonic sequence guards against out-of-order responses, and post-logout cache clearing.
   - Replaced $O(N \times P)$ linear `.find()` scans in `iamClient`, `masterDataClient`, `claimsClient`, and `financeClient` with $O(1)$ `Map` lookups and per-claim object reference memoization.
4. **React Rendering & Form Input Isolation:**
   - Extracted memoized `ExpenseReceiptCard` (`React.memo`) with stable ref-backed callbacks in `src/components/claims/ExpenseItemsEditor.tsx`, preventing keystrokes in one receipt card from re-rendering sibling receipt cards.
   - Added `useDeferredValue` for non-blocking search filtering and 25-row pagination controls on `/claims` and `/finance/claims`.

---

## 2. Before vs. After Comparison Tables

### 2.1 Frontend Production Bundle Sizes (`next build`)

| Route | Baseline Page Size | Optimized Page Size | Baseline First Load JS | Optimized First Load JS | Absolute Change | % Change |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/` (Landing) | 1.98 kB | 2.75 kB | 445 kB | **185 kB** | -260 kB | **-58.4%** |
| `/login` | 2.61 kB | 4.21 kB | 458 kB | **198 kB** | -260 kB | **-56.8%** |
| `/onboarding` | 3.74 kB | 5.45 kB | 459 kB | **199 kB** | -260 kB | **-56.6%** |
| `/signup` | 2.75 kB | 7.95 kB | 462 kB | **202 kB** | -260 kB | **-56.3%** |
| `/dashboard` | 5.79 kB | 4.56 kB | 480 kB | **221 kB** | -259 kB | **-54.0%** |
| `/claims` | 5.04 kB | 5.90 kB | 482 kB | **222 kB** | -260 kB | **-53.9%** |
| `/claims/new` | 12.90 kB | **401 B** | 490 kB | **231 kB** | -259 kB | **-52.9%** |
| `/claims/[id]` | 13.70 kB | **869 B** | 491 kB | **227 kB** | -264 kB | **-53.8%** |
| `/claims/[id]/edit` | 13.30 kB | **899 B** | 490 kB | **231 kB** | -259 kB | **-52.9%** |
| `/claims/[id]/print` | 3.16 kB | 4.77 kB | 403 kB | **136 kB** | -267 kB | **-66.3%** |
| `/approvals` | 5.83 kB | 4.04 kB | 480 kB | **220 kB** | -260 kB | **-54.2%** |
| `/approvals/[id]` | 13.70 kB | **811 B** | 491 kB | **227 kB** | -264 kB | **-53.8%** |
| `/finance` | 5.27 kB | 3.95 kB | 580 kB | **220 kB** | **-360 kB** | **-62.1%** |
| `/finance/claims` | 8.51 kB | 8.69 kB | 486 kB | **225 kB** | -261 kB | **-53.7%** |
| `/finance/claims/[id]` | 13.70 kB | **814 B** | 491 kB | **227 kB** | -264 kB | **-53.8%** |
| `/finance/batches` | 5.85 kB | 7.14 kB | 483 kB | **223 kB** | -260 kB | **-53.8%** |
| `/finance/batches/[id]` | 5.24 kB | 6.04 kB | 482 kB | **222 kB** | -260 kB | **-53.9%** |
| `/finance/reports` | 5.45 kB | 4.01 kB | 580 kB | **220 kB** | **-360 kB** | **-62.1%** |
| `/admin` | 2.66 kB | 1.21 kB | 477 kB | **217 kB** | -260 kB | **-54.5%** |
| `/admin/users` | 6.89 kB | 8.53 kB | 484 kB | **225 kB** | -259 kB | **-53.5%** |
| `/admin/ministries` | 3.55 kB | 3.71 kB | 480 kB | **220 kB** | -260 kB | **-54.2%** |
| `/admin/workflows` | 4.86 kB | 1.03 kB | 481 kB | **217 kB** | -264 kB | **-54.9%** |
| `/admin/settings` | 3.24 kB | 4.40 kB | 480 kB | **220 kB** | -260 kB | **-54.2%** |
| `/admin/audit` | 3.14 kB | 1.96 kB | 477 kB | **218 kB** | -259 kB | **-54.3%** |

### 2.2 Backend Payload & Serialization Benchmarks (Synthetic Datasets: 50, 500, 2,000 Claims)

| Metric | Dataset Scale | Baseline (Full Snapshot) | Optimized (Paginated / On-Demand) | % Improvement |
| :--- | :---: | :---: | :---: | :---: |
| **Claims List Transfer Payload** | 50 claims | 322.0 KB | **14.2 KB** (25 rows/page) | **-95.6%** |
| **Claims List Transfer Payload** | 500 claims | 2,855.5 KB (2.79 MB) | **14.2 KB** (25 rows/page) | **-99.5%** |
| **Claims List Transfer Payload** | 2,000 claims | 10,403.8 KB (10.16 MB) | **14.2 KB** (25 rows/page) | **-99.86%** |
| **Single Claim Detail Payload** | 1 claim (`?id=`) | 322.0 KB – 10,403.8 KB | **~5.1 KB** | **-98.4% to -99.95%** |
| **Bootstrap Payload Audit Logs** | 1,000 audit rows | 336.0 KB (always fetched) | **0 KB** (loaded on demand in `/admin/audit`) | **-100.0%** |
| **JSON Serialization (`JSON.stringify`)** | 2,000 claims | 14.32 ms | **0.03 ms** (25-row page) | **-99.8%** |
| **JSON Deserialization (`JSON.parse`)** | 2,000 claims | 18.07 ms | **0.02 ms** (25-row page) | **-99.9%** |

### 2.3 Client State & Rendering Efficiency

| Operation | Baseline Behavior | Optimized Behavior | Impact |
| :--- | :--- | :--- | :--- |
| **Notification read / bell update** | Increments global `version`, invalidates `masterDataClient` & `iamClient` caches, and triggers all claim/finance page listeners | Increments only `domainVersions.notifications` and notifies only `["notifications"]` subscribers | **0 unnecessary claim/finance re-renders or cache invalidations** |
| **Single claim detail fetch / update** | Rebuilds all claim objects in `claimsClient.getClaims()` | `workspaceStore.upsertClaim` + `claimsByIdCache` preserves object references for all unchanged claims | **$O(1)$ reference stability for unchanged rows** |
| **Entity hydration (`getProfileById`, `getMinistryById`, etc.)** | $O(N \times P)$ linear `.find()` array scans across every claim, workflow step, action, and comment | $O(1)$ `Map` lookups keyed by domain version | **~12x faster claim hydration on 500–2,000 claims** |
| **Concurrent `refreshDomain` calls** | Fires duplicate network requests; no sequence protection against out-of-order responses | Deduplicates in-flight requests per endpoint and enforces monotonic sequence + `clearGeneration` guards | **Eliminates duplicate fetches & race conditions** |
| **Typing in `ExpenseItemsEditor` receipt card** | Re-renders all receipt cards on every keystroke | `ExpenseReceiptCard` wrapped in `React.memo` with stable ref-backed callbacks | **Only the edited receipt card re-renders** |

---

## 3. Architectural Changes Implemented

### 3.1 Database & SQL Performance (`supabase/migrations/20261104000001_performance_optimization_and_pagination.sql`)
- **Composite Indexes Added:**
  - `idx_claims_created_at_desc` (`created_at DESC`)
  - `idx_claims_status_created_at` (`status, created_at DESC`)
  - `idx_claims_ministry_status_created` (`ministry_id, status, created_at DESC`)
  - `idx_claims_submitted_by_created` (`submitted_by_user_id, created_at DESC`)
  - `idx_claims_claimant_created` (`claimant_id, created_at DESC`)
  - `idx_claims_claim_date_desc` (`claim_date DESC, created_at DESC`)
  - `idx_claims_active_batch_id` (`active_batch_id`) partial index
  - `idx_claim_attachments_expense_id` (`expense_id`) partial index
  - `idx_finance_reviews_claim_created` (`claim_id, created_at DESC`)
  - `idx_notifications_user_created` (`user_id, created_at DESC`)
  - `idx_audit_logs_created_at_desc` (`created_at DESC`)
- **New Authorized RPC Functions:**
  - `private.get_claim_detail(uuid)` & `public.nlcc_claim_detail(uuid)`: Fetches a single claim with full nested `expenses`, `attachments`, `workflow_steps`, `approval_actions`, `comments`, `finance_review`, and `payment`, enforcing `public.can_read_claim` and bank detail redaction (`private.can_view_claim_bank_details`).
  - `private.query_claims(jsonb)` & `public.nlcc_query_claims(jsonb)`: Executes server-side filtering (`search`, `status`, `ministry_id`, `start_date`, `end_date`), sorting (`created_at`, `submitted_at`, `claim_date`, `total_amount`, `claim_number`, `status`), pagination (`page`, `page_size`), and single-pass status summary aggregation (`summary`), returning lightweight list items without heavy `comments` or `approval_actions` arrays.
  - Extended `private.domain_snapshot(text)` to support `'bootstrap'`, omitting the 1,000-row `auditLogs` payload and redundant nested comment/action histories during initial workspace bootstrap.

### 3.2 Server API & Domain Service Layer
- **`src/services/claims/claims.service.ts` & `src/app/api/v1/claims/route.ts`:**
  - Added `claimsService.getClaimDetail(claimId)` (`GET /api/v1/claims?id=<uuid>`) with automatic fallback to `getDomainState()` if the additive migration has not yet been applied to the target database.
  - Added `claimsService.queryClaims(params)` (`GET /api/v1/claims?page=...&page_size=...&search=...&status=...&ministry_id=...&start_date=...&end_date=...&sort_field=...&sort_dir=...`) with server-side fallback via `filterAndPaginateClaimsList`.
- **`src/services/gateway.service.ts` & `src/app/api/workspace/route.ts`:**
  - Added optional `?mode=bootstrap` support while preserving full backward compatibility for `GET /api/workspace`.

### 3.3 Client Bundle & State Architecture
- **`src/lib/banking/reimbursement-preview.ts` & `src/lib/banking/bank-export-adapter.ts`:**
  - Extracted pure client-safe reimbursement eligibility, grouping, and preview digest calculation (`sha256Hex`) into `reimbursement-preview.ts`, keeping `xlsx` and Node `crypto` strictly in `bank-export-adapter.ts` for server/test `.xls` generation.
- **`src/lib/domains/store.ts` & Domain Clients (`iam.client.ts`, `master-data.client.ts`, `claims.client.ts`, `finance.client.ts`):**
  - Implemented domain-scoped subscriptions (`subscribeDomains`), selector subscriptions (`subscribeSelector`), `upsertClaim`, concurrent request deduplication, out-of-order response sequence guards, post-logout cache clearing, and $O(1)$ lookup maps.

---

## 4. Verification & Limitations

### Automated Verification
- **TypeScript (`npm run typecheck`):** Passed (`0` errors).
- **ESLint (`npm run lint`):** Passed (`0` errors).
- **Vitest Suite (`npm test`):** All **16 test suites (128 tests)** passed, including the new `tests/performance-optimizations.test.ts` suite covering domain subscription isolation, per-claim reference stability, concurrent request deduplication, out-of-order stale response protection, post-logout cache clearing, server/client pagination & field stripping, and SHA-256 / BIFF8 `.xls` determinism.
- **Production Build (`npm run build`):** Compiled and optimized cleanly across all routes.

### Measurement Limitations
- Because local Docker (`127.0.0.1:55322`) is not running in this environment and synthetic load tests must never be executed against the production Supabase database, backend payload and throughput benchmarks for 50, 500, and 2,000 claims were measured against realistic synthetic datasets in Node.js/Vitest, and SQL execution plans were verified structurally against the PostgreSQL schema and index definitions in `supabase/migrations/20261104000001_performance_optimization_and_pagination.sql`.
