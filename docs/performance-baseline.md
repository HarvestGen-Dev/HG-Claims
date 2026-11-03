# HG-Claims — Performance Baseline Report

**Date:** 2026-11-04  
**Baseline Commit:** `ff9f8e4` (`main`)  
**Stack:** Next.js 15.5.24 (App Router), React 18.3.1, TypeScript 5.6.2, Tailwind CSS 3.4, Supabase Auth & PostgreSQL (RPC + RLS), Vitest, Playwright

---

## 1. Measurement Methodology & Environment Limitations

### Environment Context
- **Application Build & Runtime:** Local macOS environment (`darwin`), Node.js v20+, Next.js 15.5.24 production build (`npm run build`).
- **Database Environment Limitation:** Local Docker / Supabase stack (`127.0.0.1:55322`) is not running in this environment (`DOCKER_NOT_RUNNING`), and destructive or synthetic load benchmarks must **never** be executed against the linked remote production Supabase project (`qynumdarrnkqzctineiz`).
- **How Backend & Dataset Metrics Were Measured:**
  - SQL execution plans and complexity were analyzed directly from the production migration definitions (`supabase/migrations/20261103000001_bulk_reimbursement_batches.sql`, `20261103035921_restrict_payee_bank_details.sql`, `20261103061554_optional_cost_centres.sql`).
  - Synthetic dataset benchmarks (`50`, `500`, and `2,000` claims with realistic nested receipts, attachments, workflow steps, approval actions, comments, profiles, ministries, categories, notifications, and audit logs) were executed locally in Node.js / Vitest to measure exact payload sizes, JSON serialization/deserialization times, and client-side hydration/aggregation durations.

---

## 2. Frontend Bundle Baseline (`next build` on `ff9f8e4`)

### Route-Level First Load JS
Shared by all routes: **102 kB** (`chunks/1255-7b4b5a04291b6a94.js` 45.7 kB + `chunks/4bd1b696-100b9d70ed4e49c1.js` 54.2 kB + runtime/other 1.97 kB).

| Route | Route Page Size | First Load JS (Gzipped) | Notes / Heavy Dependencies Included |
| :--- | :---: | :---: | :--- |
| `/` | 1.98 kB | **445 kB** | Includes root `AuthProvider` -> `@/lib/domains` barrel -> `xlsx` + `crypto` polyfill |
| `/login` | 2.61 kB | **458 kB** | Includes `xlsx` + `crypto` via `@/lib/domains` barrel |
| `/onboarding` | 3.74 kB | **459 kB** | Includes `xlsx` + `crypto` via `@/lib/domains` barrel |
| `/signup` | 2.75 kB | **462 kB** | Includes `xlsx` + `crypto` via `@/lib/domains` barrel |
| `/dashboard` | 5.79 kB | **480 kB** | Includes `xlsx` + `crypto` + full `AppLayout` |
| `/claims` | 5.04 kB | **482 kB** | Client-side filtering/sorting over full `claims` array |
| `/claims/new` | 12.9 kB | **490 kB** | Monolithic `ClaimForm` + `ExpenseItemsEditor` |
| `/claims/[id]` | 13.7 kB | **491 kB** | Eagerly bundles `ClaimDetailView`, `ReceiptViewerModal`, `PaymentModal`, `ReturnClarificationModal`, `RejectModal`, `AdminCorrectionModal` |
| `/claims/[id]/edit` | 13.3 kB | **490 kB** | Monolithic `ClaimForm` + `ExpenseItemsEditor` |
| `/claims/[id]/print` | 3.16 kB | **403 kB** | `PrintClaimView` + `@/lib/domains` barrel |
| `/approvals` | 5.83 kB | **480 kB** | Approvals inbox |
| `/approvals/[id]` | 13.7 kB | **491 kB** | Same eager modal bundle as `/claims/[id]` |
| `/finance` | 5.27 kB | **580 kB** | Eagerly bundles `recharts` (~110 kB gzipped / 373 kB raw) + `xlsx` |
| `/finance/claims` | 8.51 kB | **486 kB** | Imports `evaluateClaimForReimbursement` from `bank-export-adapter` (`xlsx`) |
| `/finance/claims/[id]` | 13.7 kB | **491 kB** | Same eager modal bundle as `/claims/[id]` |
| `/finance/batches` | 5.85 kB | **483 kB** | Imports `bank-export-adapter` (`xlsx` + `crypto`) |
| `/finance/batches/[id]` | 5.24 kB | **482 kB** | Batch detail & reconciliation |
| `/finance/reports` | 5.45 kB | **580 kB** | Eagerly bundles `recharts` (~110 kB gzipped / 373 kB raw) + `xlsx` |
| `/admin` | 2.66 kB | **477 kB** | Admin overview |
| `/admin/users` | 6.89 kB | **484 kB** | User & invitation management |
| `/admin/ministries` | 3.55 kB | **480 kB** | Ministry & category management |
| `/admin/workflows` | 4.86 kB | **481 kB** | Approval rules management |
| `/admin/settings` | 3.24 kB | **480 kB** | System settings |
| `/admin/audit` | 3.14 kB | **477 kB** | Historical audit logs |

### Largest Production Client Chunks (`.next/static/chunks/`)

| Chunk File | Raw Size | Included In | Root Cause |
| :--- | :---: | :--- | :--- |
| `2170a4aa-d5cd0e40bd2b64af.js` | **408.6 KB** (399 KiB) | **Root `/layout` (ALL routes)** | `xlsx` library pulled into client via `AuthProvider` -> `@/lib/domains` -> `finance.client.ts` -> `bank-export-adapter.ts` |
| `6930-612158175a95f1aa.js` | **373.2 KB** (364 KiB) | `/finance`, `/finance/reports` | `recharts` + `d3-*` sub-packages imported synchronously at page top level |
| `aaea2bcf-e608f17bc5063115.js` | **325.4 KB** (318 KiB) | **Root `/layout` (ALL routes)** | Second half of `xlsx` + Node `crypto` browserify polyfill pulled into `/layout` |
| `6140-734a5835c458ae49.js` | **172.5 KB** (169 KiB) | **Root `/layout` (ALL routes)** | `@supabase/supabase-js` + `@supabase/ssr` + Node stream/buffer polyfills |
| `308-35737d4896bed396.js` | **83.7 KB** (82 KiB) | **Root `/layout` (ALL routes)** | Shared UI & icon dependencies |
| `44530001-ccebb3bde0666775.js` | **67.6 KB** (66 KiB) | **Root `/layout` (ALL routes)** | Node `crypto` / `readable-stream` browser polyfills |

**Critical Bundle Finding:**  
Because `src/app/layout.tsx` renders `<AuthProvider>`, which imports `workspaceStore` from the `@/lib/domains` barrel (`src/lib/domains/index.ts`), and that barrel re-exports `financeClient` (`src/lib/domains/finance.client.ts`), which imports `evaluateClaimForReimbursement` and `previewReimbursementSelection` from `src/lib/banking/bank-export-adapter.ts`, and `bank-export-adapter.ts` has top-level `import * as XLSX from "xlsx"` and `import { createHash } from "crypto"`, **every single route in the application downloads ~800 KB of raw `xlsx` + `crypto-browserify` JavaScript (~240+ kB gzipped) on initial page load**, even though `.xls` generation only happens server-side in `GET /api/v1/finance/batches/[id]/export`!

---

## 3. Backend & Payload Baseline (`GET /api/workspace` vs Scoped/Paginated Queries)

### Architectural Bottleneck Analysis
1. **Full Workspace Fetching on Initial Boot & Route Refresh:**
   - `AuthProvider` calls `workspaceStore.refresh()` on mount and `workspaceStore.refreshIfStale(15000)` on route changes.
   - `workspaceStore.refresh()` calls `GET /api/workspace` -> `public.nlcc_snapshot()` -> `private.redact_workspace_snapshot(private.snapshot())`.
   - `private.snapshot()` executes correlated subqueries across `profiles`, `ministries`, `expense_categories`, `cost_centres`, `approval_rules`, `system_settings`, `notifications`, `audit_logs` (up to 1,000 rows), `signup_invitations`, `reimbursement_batches` (with nested instructions and instruction_claims), and **every readable claim** in `public.claims`.
   - For **every claim**, `private.snapshot()` executes **8 correlated subqueries**:
     1. `submitted_by` profile lookup
     2. `claimant` profile lookup
     3. `claim_expenses` aggregation + nested `cost_centres` lookup + nested `claim_attachments` aggregation per expense
     4. `claim_attachments` aggregation per claim
     5. `claim_workflow_steps` + `claim_workflows` join aggregation
     6. `approval_actions` aggregation
     7. `claim_comments` aggregation
     8. `finance_reviews` latest row subquery + `payments` row subquery
   - Then `private.redact_workspace_snapshot` unpacks and re-aggregates the entire `profiles` and `claims` JSON arrays a second time in PL/pgSQL (`jsonb_array_elements` -> `jsonb_agg` -> `jsonb_set`).

### Synthetic Dataset Payload & Serialization Measurements (50, 500, 2,000 Claims)

Each synthetic claim contains 3 expense lines, 3 receipt attachment records, 1 workflow step, 1 approval action, 1 comment, and finance review/payment records where applicable, plus 40 profiles, 6 ministries, 8 categories, 30 notifications, and up to 1,000 audit logs.

| Metric | 50 Claims | 500 Claims | 2,000 Claims |
| :--- | :---: | :---: | :---: |
| **`GET /api/workspace` Full Payload Size** | **322.0 KB** | **2,855.5 KB (2.79 MB)** | **10,403.8 KB (10.16 MB)** |
| — Claims array portion (with nested children) | 246.7 KB | 2,494.5 KB | 10,042.7 KB |
| — Audit logs portion (up to 1,000 rows) | 50.1 KB | 335.9 KB | 336.0 KB |
| **Paginated Claims List Payload (25 rows/page)** | **14.2 KB** | **14.2 KB** | **14.2 KB** |
| **Full Snapshot `JSON.stringify` Duration** | 1.16 ms | 4.24 ms | 14.32 ms |
| **Full Snapshot `JSON.parse` Duration** | 1.76 ms | 6.77 ms | 18.07 ms |
| **Paginated List (25 rows) `JSON.stringify` Duration** | 0.01 ms | 0.03 ms | 0.03 ms |
| **Paginated List (25 rows) `JSON.parse` Duration** | 0.02 ms | 0.02 ms | 0.02 ms |
| **Correlated SQL Subqueries per Full Snapshot** | ~450 subqueries | ~4,050 subqueries | ~16,050 subqueries |

---

## 4. Client State Management & React Rendering Baseline

### Identified Client-Side Bottlenecks
1. **Global Version Counter & Unscoped Listeners in `WorkspaceStore` (`src/lib/domains/store.ts`):**
   - `WorkspaceStore` maintains a single `this.version` integer and a single global `this.listeners` set.
   - Any call to `patchState` (such as marking a notification as read in `TopHeader`) increments `this.version` and notifies **all** subscribed components (`TopHeader`, `Sidebar`, `DashboardPage`, `ClaimsListPage`, `FinanceClaimsPage`, `FinanceBatchesPage`, `UserManagementPage`, etc.).
   - Furthermore, `masterDataClient.getMinistries()`, `masterDataClient.getCategories()`, and `iamClient.getSignupInvitations()` key their memoization caches off `workspaceStore.getVersion()`. When a notification is marked read, `workspaceStore.getVersion()` increments, invalidating `masterDataClient` and `iamClient` caches even though master data and IAM state did not change.
2. **Repeated $O(N \times P)$ Linear Lookups During Claim Hydration & Finance Summaries:**
   - `iamClient.getProfileById(id)` performs `this.getProfiles().find(p => p.id === id)` ($O(P)$ array scan) instead of an $O(1)$ `Map` lookup.
   - `claimsClient.hydrateClaim(c)` calls `iamClient.getProfileById` for `submitted_by`, `claimant`, every workflow step's `assigned_user` and `completed_by_user`, every approval action's `actor`, every comment's `author`, `finance_review.reviewer`, and `payment.processor`, plus `.find()` on `ministries`, `categories`, and `costCentres`.
   - `financeClient.getDashboardSummary()`, `getMinistryBreakdown()`, `getCategoryBreakdown()`, `getStatusBreakdown()`, and `getMonthlySpending()` re-iterate all hydrated claims on every render without memoization.
3. **Lack of In-Flight Deduplication & Stale-Response Protection on `refreshDomain`:**
   - While `workspaceStore.refresh()` deduplicates concurrent calls via `this.inflightRefresh`, `workspaceStore.refreshDomain(endpoint)` has **no** in-flight deduplication and **no** request sequence guard. Concurrent calls to `refreshDomain("/api/v1/claims")` fire duplicate network requests and can resolve out of order.
4. **Monolithic `ClaimForm.tsx` & `ExpenseItemsEditor.tsx` Rendering:**
   - `ExpenseItemsEditor` renders all receipt rows inline without `React.memo` row isolation; typing a single character in one receipt's description or amount recreates the `expenses` array and re-renders every receipt card and the entire `ClaimForm`.
   - `ClaimDetailView.tsx` eagerly imports all 5 action modals (`ReceiptViewerModal`, `PaymentModal`, `ReturnClarificationModal`, `RejectModal`, `AdminCorrectionModal`) even when viewing a read-only claim.
5. **Client-Only Unpaginated Tables on `/claims` and `/finance/claims`:**
   - `/claims` and `/finance/claims` render every matching claim row into the DOM at once without pagination controls, causing DOM node count to scale linearly with total claims.
