"use client";

import { Select } from "@/components/ui/select";
import React, {
  useState,
  useEffect,
  Suspense,
  useMemo,
  useDeferredValue,
  useRef,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Banknote,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  CheckSquare,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { BatchFileDownloadButton } from "@/components/finance/BatchFileDownloadButton";
import { previewJompayClaims } from "@/lib/banking/jompay";
import { ClaimLink } from "@/components/claims/ClaimLink";
import { MobileClaimList } from "@/components/claims/MobileClaimList";

const PaymentModal = dynamic(
  () => import("@/components/claims/PaymentModal").then((m) => m.PaymentModal),
  { ssr: false },
);
import { useAuth } from "@/lib/auth/context";
import {
  claimsClient,
  financeClient,
  masterDataClient,
  workspaceStore,
} from "@/lib/domains";
import { Claim, ReimbursementBatch } from "@/lib/types/database";
import { calculateTotalAmount } from "@/lib/utils/calculations";
import { evaluateClaimForReimbursement } from "@/lib/banking/reimbursement-preview";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";
import { showToast } from "@/lib/utils/toast";

function FinanceClaimsContent() {
  const { user, canApprove } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isJompay = searchParams.get("method") === "JOMPAY";
  const paymentMethod = isJompay ? "JOMPAY" : "BANK_TRANSFER";
  const batchRequest = useRef({ signature: "", key: "" });
  const [batchError, setBatchError] = useState("");
  const statusParam = searchParams.get("status") || "ALL";

  const [view, setView] = useState<"claims" | "files">(
    searchParams.get("view") === "files" ? "files" : "claims",
  );
  const [fileStatus, setFileStatus] = useState("active");
  useEffect(() => {
    setView(searchParams.get("view") === "files" ? "files" : "claims");
  }, [searchParams]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [batches, setBatches] = useState<ReimbursementBatch[]>([]);
  const [selectedStatus, setSelectedStatus] = useState(statusParam);
  const [selectedMinistry, setSelectedMinistry] = useState("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);

  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [paymentClaim, setPaymentClaim] = useState<Claim | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [generatingXls, setGeneratingXls] = useState(false);
  const [disbursingBatchId, setDisbursingBatchId] = useState<string | null>(
    null,
  );
  const [approvingClaimId, setApprovingClaimId] = useState<string | null>(null);

  const ministries = masterDataClient.getMinistries();

  useEffect(() => {
    if (!user) return;
    const sync = () => {
      const nextClaims = claimsClient.getClaims(user);
      setClaims(nextClaims);
      setBatches(financeClient.getReimbursementBatches());
      setSelectedClaimIds((prev) =>
        prev.filter((id) =>
          nextClaims.some(
            (c) =>
              c.id === id &&
              c.status === "APPROVED_FOR_PAYMENT" &&
              !c.active_batch_id,
          ),
        ),
      );
    };
    sync();
    return workspaceStore.subscribeDomains(
      ["claims", "finance", "master-data", "iam"],
      sync,
    );
  }, [user]);

  const batchById = useMemo(() => {
    return new Map(batches.map((b) => [b.id, b]));
  }, [batches]);

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      if ((c.payee_payment_method || "BANK_TRANSFER") !== paymentMethod)
        return false;
      if (selectedStatus !== "ALL" && c.status !== selectedStatus) return false;
      if (selectedMinistry !== "ALL" && c.ministry_id !== selectedMinistry)
        return false;
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        return (
          (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
          (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
          (c.claimant?.full_name &&
            c.claimant.full_name.toLowerCase().includes(q)) ||
          (c.submitted_by?.full_name &&
            c.submitted_by.full_name.toLowerCase().includes(q)) ||
          c.purpose.toLowerCase().includes(q) ||
          (c.payment?.payment_reference &&
            c.payment.payment_reference.toLowerCase().includes(q)) ||
          (c.payment?.notes && c.payment.notes.toLowerCase().includes(q)) ||
          (c.disbursement_voucher &&
            c.disbursement_voucher.toLowerCase().includes(q)) ||
          (c.batch_number && c.batch_number.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [claims, selectedStatus, selectedMinistry, deferredSearch, paymentMethod]);

  useEffect(() => {
    setPage(1);
  }, [selectedStatus, selectedMinistry, deferredSearch]);

  useEffect(() => {
    setSelectedClaimIds([]);
    setPage(1);
    setBatchError("");
  }, [paymentMethod]);

  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleClaims = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  const selectableApprovedIds = useMemo(() => {
    return filtered
      .filter(
        (c) =>
          c.status === "APPROVED_FOR_PAYMENT" &&
          !c.active_batch_id &&
          !c.payment &&
          (isJompay
            ? previewJompayClaims([c])[0].eligible
            : evaluateClaimForReimbursement(c).eligible),
      )
      .map((c) => c.id);
  }, [filtered, isJompay]);

  const selectedReadyIds = selectableApprovedIds.filter((id) =>
    selectedClaimIds.includes(id),
  );
  const selectedTotal = calculateTotalAmount(
    filtered
      .filter((claim) => selectedReadyIds.includes(claim.id))
      .map((claim) => ({ amount: claim.total_amount })),
  );

  const allApprovedSelected =
    selectableApprovedIds.length > 0 &&
    selectableApprovedIds.every((id) => selectedClaimIds.includes(id));

  const handleToggleSelectAllApproved = () => {
    if (allApprovedSelected) {
      setSelectedClaimIds((prev) =>
        prev.filter((id) => !selectableApprovedIds.includes(id)),
      );
    } else {
      setSelectedClaimIds((prev) =>
        Array.from(new Set([...prev, ...selectableApprovedIds])),
      );
    }
  };

  const handleToggleClaimSelection = (claimId: string) => {
    setSelectedClaimIds((prev) =>
      prev.includes(claimId)
        ? prev.filter((id) => id !== claimId)
        : [...prev, claimId],
    );
  };

  const handleQuickApprove = async (claim: Claim) => {
    if (!user || !canApprove(claim) || approvingClaimId) return;
    try {
      setApprovingClaimId(claim.id);
      await financeClient.approveStep(claim.id, user, "Approved by Finance.");
      await workspaceStore.refreshDomain("/api/v1/claims");
      showToast.success(`${claim.claim_number} approved.`, "Claim Approved");
    } catch (err: any) {
      showToast.error(
        err?.message || "Failed to approve claim.",
        "Approval Error",
      );
    } finally {
      setApprovingClaimId(null);
    }
  };

  const handleGenerateXlsForSelected = async (claimIdsToBatch?: string[]) => {
    if (generatingXls) return;
    const ids = (claimIdsToBatch || selectedClaimIds).filter((id) =>
      selectableApprovedIds.includes(id),
    );
    if (ids.length === 0) {
      showToast.error(
        "Select at least one approved claim that is ready for a batch.",
        "No Claims Selected",
      );
      return;
    }

    setGeneratingXls(true);
    setBatchError("");
    const signature = `${paymentMethod}:${[...ids].sort().join(",")}`;
    if (batchRequest.current.signature !== signature)
      batchRequest.current = { signature, key: crypto.randomUUID() };
    try {
      const created = await workspaceStore.dispatchDomainCommand(
        "/api/v1/finance",
        isJompay ? "finalize_jompay_batch" : "finalize_reimbursement_batch",
        {
          claim_ids: ids,
          request_key: batchRequest.current.key,
          notes: isJompay
            ? "Alliance Bank JomPAY B1 batch"
            : "Alliance Bank bulk transfer batch",
        },
        { skipRefresh: true },
      );
      setSelectedClaimIds([]);
      batchRequest.current = { signature: "", key: "" };
      await Promise.allSettled([
        workspaceStore.refreshDomain("/api/v1/finance"),
        workspaceStore.refreshDomain("/api/v1/claims"),
      ]);
      showToast.success(
        "Batch created. Download the bank file from the batch page.",
        "Batch Created",
      );
      router.push(`/finance/batches/${created.id}`);
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : "Unable to create the batch.",
      );
    } finally {
      setGeneratingXls(false);
    }
  };

  const handleMarkBatchProcessed = async (batch: ReimbursementBatch) => {
    window.location.assign(`/finance/batches/${batch.id}`);
  };

  const handleExport = () => {
    const csv = generateClaimsCsv(filtered);
    downloadCsv(
      `finance_vouchers_${new Date().toISOString().split("T")[0]}.csv`,
      csv,
    );
  };

  const handlePaymentConfirm = async (paymentData: any) => {
    if (!user || !paymentClaim) return;
    try {
      setLoadingAction(true);
      await financeClient.recordPayment({
        ...paymentData,
        claim_id: paymentClaim.id,
        processor: user,
      });
      setPaymentClaim(null);
      await workspaceStore.refreshDomain("/api/v1/claims");
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setLoadingAction(false);
    }
  };

  const isFiles = view === "files";
  const visibleBatches = batches.filter((batch) => {
    if ((batch.payment_method || "BANK_TRANSFER") !== paymentMethod)
      return false;
    const matchesStatus =
      fileStatus === "processed"
        ? batch.status === "SETTLED"
        : fileStatus === "all"
          ? true
          : !["SETTLED", "VOIDED", "REJECTED"].includes(batch.status);
    if (!matchesStatus) return false;
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      const matchesBatchNumber = batch.batch_number.toLowerCase().includes(q);
      const matchesInstruction = batch.instructions?.some(
        (inst) =>
          inst.payment_description.toLowerCase().includes(q) ||
          inst.beneficiary_name.toLowerCase().includes(q) ||
          inst.claims?.some((ic) =>
            ic.claim?.claim_number?.toLowerCase().includes(q),
          ),
      );
      return matchesBatchNumber || Boolean(matchesInstruction);
    }
    return true;
  });

  return (
    <div className="claim-page mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Reimbursements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review claims and prepare separate Bank Transfer and JomPAY files.
          </p>
        </div>
        {!isFiles && (
          <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            {!isJompay && (
              <>
                <Link
                  href="/finance/batches"
                  className={buttonVariants({
                    variant: "outline",
                    className: "min-h-11 gap-2",
                  })}
                >
                  <Banknote className="size-4" /> Bank batches
                </Link>
              </>
            )}
            <Button
              variant="outline"
              onClick={handleExport}
              className="min-h-11 gap-2"
            >
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
        )}
      </div>

      <nav
        aria-label="Payment method"
        className="flex gap-2 rounded-xl border border-border bg-card p-1.5 [&>a]:flex-1 sm:w-fit sm:min-w-80"
      >
        <ClaimLink
          href="/finance/claims"
          variant={isJompay ? "ghost" : "default"}
          aria-current={!isJompay ? "page" : undefined}
        >
          Bank Transfer
        </ClaimLink>
        <ClaimLink
          href="/finance/claims?method=JOMPAY"
          variant={isJompay ? "default" : "ghost"}
          aria-current={isJompay ? "page" : undefined}
        >
          JomPAY
        </ClaimLink>
      </nav>
      <div>
        <h2 className="text-base font-semibold">
          {isJompay ? "JomPAY bills" : "Bank Transfer claims"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isJompay
            ? "Each bill has its own row in the Alliance Bank B1 .xlsx file, even for the same payee."
            : "Approved claims for the same payee are combined into one transfer in the Alliance Bank .xls file."}
        </p>
      </div>

      <div role="group" aria-label="Reimbursements view" className="claim-tabs">
        <button
          type="button"
          aria-pressed={!isFiles}
          onClick={() => {
            setView("claims");
            router.replace(
              `/finance/claims${isJompay ? "?method=JOMPAY" : ""}`,
              { scroll: false },
            );
          }}
          className="min-h-11 border-b-2 border-transparent px-1 text-sm text-muted-foreground aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-foreground"
        >
          Claims
        </button>
        <button
          type="button"
          aria-pressed={isFiles}
          onClick={() => {
            setView("files");
            router.replace(
              `/finance/claims?${isJompay ? "method=JOMPAY&" : ""}view=files`,
              { scroll: false },
            );
          }}
          className="min-h-11 border-b-2 border-transparent px-1 text-sm text-muted-foreground aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-foreground"
        >
          Bank files
        </button>
      </div>

      {isFiles && (
        <div className="filter-bar grid gap-4 sm:grid-cols-[1fr_2fr]">
          <div>
            <label htmlFor="bank-file-status">File status</label>
            <Select
              id="bank-file-status"
              value={fileStatus}
              onValueChange={(nextValue) => setFileStatus(nextValue)}
              className="w-full"
            >
              <option value="active">Active files</option>
              <option value="processed">Processed files</option>
              <option value="all">All files</option>
            </Select>
          </div>
          <div>
            <label htmlFor="bank-file-search">Search files</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                id="bank-file-search"
                aria-label="Search bank files"
                placeholder="Voucher, batch number or payee"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full pl-10 pr-3 text-sm rounded-lg border border-zinc-200 bg-zinc-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
          </div>
        </div>
      )}

      {isFiles && (
        <section
          className="rounded-xl border border-border bg-card"
          aria-label="Bank files"
        >
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
            {isJompay ? "JomPAY" : "Bank Transfer"} bank files
          </h2>
          {visibleBatches.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No bank files match these filters.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visibleBatches.map((batch) => (
                <li
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/finance/batches/${batch.id}`}
                      className="break-words text-sm font-semibold hover:underline"
                    >
                      {batch.batch_number}
                      {batch.payment_method === "JOMPAY" ? ".xlsx" : ".xls"}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCurrency(batch.total_amount)} · {batch.claim_count}{" "}
                      {batch.claim_count === 1 ? "claim" : "claims"} ·{" "}
                      {formatDate(batch.settled_at || batch.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                      {batch.status === "SETTLED"
                        ? "Processed"
                        : batch.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <BatchFileDownloadButton batch={batch} />
                    {!["SETTLED", "VOIDED", "REJECTED"].includes(
                      batch.status,
                    ) && (
                      <Button
                        type="button"
                        variant="secondary"
                        loading={disbursingBatchId === batch.id}
                        onClick={() => handleMarkBatchProcessed(batch)}
                        className="min-h-11"
                      >
                        Confirm payment
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!isFiles && (
        <>
          {selectableApprovedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleToggleSelectAllApproved}
                className="min-h-11 gap-2"
              >
                <CheckSquare className="size-4" />
                {allApprovedSelected
                  ? "Clear selection"
                  : `Select all ready claims (${selectableApprovedIds.length})`}
              </Button>
              <Button
                type="button"
                loading={generatingXls}
                disabled={generatingXls || selectedReadyIds.length === 0}
                onClick={() => handleGenerateXlsForSelected()}
                className="min-h-11 gap-2"
              >
                {!generatingXls && <FileSpreadsheet className="size-4" />}
                Create {isJompay ? "JomPAY" : "Bank Transfer"} batch
                {selectedReadyIds.length > 0
                  ? ` (${selectedReadyIds.length})`
                  : ""}
              </Button>
              {selectedReadyIds.length > 0 && (
                <p
                  role="status"
                  className="w-full text-sm text-muted-foreground"
                >
                  {selectedReadyIds.length} claims selected ·{" "}
                  {formatCurrency(selectedTotal)}
                </p>
              )}
            </div>
          )}

          {batchError && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {batchError}
            </p>
          )}

          {/* Filter Controls */}
          <div className="filter-bar grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <label
                htmlFor="finance-status"
                className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider"
              >
                Status
              </label>
              <Select
                id="finance-status"
                value={selectedStatus}
                onValueChange={(nextValue) => setSelectedStatus(nextValue)}
                className="w-full"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_FINANCE_REVIEW">
                  Pending Finance Approval
                </option>
                <option value="APPROVED_FOR_PAYMENT">Approved</option>
                <option value="PAID">Processed</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="finance-ministry"
                className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider"
              >
                Team
              </label>
              <Select
                id="finance-ministry"
                value={selectedMinistry}
                onValueChange={(nextValue) => setSelectedMinistry(nextValue)}
                className="w-full"
              >
                <option value="ALL">All Teams</option>
                {ministries.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="finance-search"
                className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider"
              >
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  id="finance-search"
                  placeholder="Claim number, voucher, payee or purpose"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 w-full pl-10 pr-3 text-sm rounded-lg border border-zinc-200 bg-zinc-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
                />
              </div>
            </div>
          </div>

          {/* Claims Table */}
          <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-400">
                No claims match the selected finance criteria.
              </div>
            ) : (
              <>
                <MobileClaimList
                  claims={visibleClaims}
                  baseHref="/finance/claims"
                  showFinanceInfo={true}
                  selectedIds={selectedClaimIds}
                  selectableIds={selectableApprovedIds}
                  onSelect={handleToggleClaimSelection}
                />
                <div className="hidden xl:block overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            aria-label="Select all approved claims for XLS generation"
                            checked={allApprovedSelected}
                            disabled={selectableApprovedIds.length === 0}
                            onChange={handleToggleSelectAllApproved}
                            className="rounded border-zinc-300"
                          />
                        </th>
                        <th className="py-2.5 px-4">Claim #</th>
                        <th className="py-2.5 px-4">Claimant</th>
                        <th className="py-2.5 px-4">Team & Purpose</th>
                        <th className="py-2.5 px-4 text-right">Amount</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {(visibleClaims || []).map((c) => {
                        const isEligibleForXls =
                          c.status === "APPROVED_FOR_PAYMENT" &&
                          !c.active_batch_id &&
                          !c.payment &&
                          (isJompay
                            ? previewJompayClaims([c])[0].eligible
                            : evaluateClaimForReimbursement(c).eligible);
                        const isSelected = selectedClaimIds.includes(c.id);
                        const linkedBatch = c.active_batch_id
                          ? batchById.get(c.active_batch_id)
                          : null;

                        return (
                          <tr
                            key={c.id}
                            className={`hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors ${
                              isSelected ? "bg-zinc-50" : ""
                            }`}
                          >
                            <td className="py-3 px-3 text-center">
                              {c.status === "APPROVED_FOR_PAYMENT" &&
                              !c.active_batch_id ? (
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${c.claim_number || "claim"} for bank batch`}
                                  checked={isSelected}
                                  disabled={!isEligibleForXls}
                                  onChange={() =>
                                    handleToggleClaimSelection(c.id)
                                  }
                                  title={
                                    isEligibleForXls
                                      ? `Select for ${isJompay ? "JomPAY" : "Bank Transfer"} batch`
                                      : "Complete payment details are required for batching"
                                  }
                                  className="rounded border-zinc-300"
                                />
                              ) : null}
                            </td>
                            <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                              <Link
                                href={`/finance/claims/${c.id}`}
                                className="hover:underline hover:text-emerald-700 dark:hover:text-emerald-400"
                              >
                                {c.claim_number}
                              </Link>
                              {c.disbursement_voucher && (
                                <p className="mt-1 text-xs font-normal text-muted-foreground">
                                  Voucher {c.disbursement_voucher}
                                  {c.disbursement_line_order
                                    ? ` · Row ${c.disbursement_line_order}`
                                    : ""}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                              <div>
                                {c.claimant_name ||
                                  c.claimant?.full_name ||
                                  "-"}
                              </div>
                            </td>
                            <td className="py-3 px-4 max-w-xs">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200 block truncate">
                                {c.purpose}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {c.ministry?.name}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                              {formatCurrency(c.total_amount)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <ClaimStatusBadge
                                  status={c.status}
                                  reimbursementStatus={c.reimbursement_status}
                                />
                                {linkedBatch &&
                                  linkedBatch.status !== "SETTLED" && (
                                    <Link
                                      href={`/finance/batches/${linkedBatch.id}`}
                                      className="text-[10px] font-mono text-amber-800 hover:underline"
                                    >
                                      {linkedBatch.batch_number}
                                      {linkedBatch.payment_method === "JOMPAY"
                                        ? ".xlsx"
                                        : ".xls"}
                                    </Link>
                                  )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right w-px">
                              <div className="table-actions">
                                {c.status === "PENDING_FINANCE_REVIEW" &&
                                  canApprove(c) && (
                                    <Button
                                      loading={approvingClaimId === c.id}
                                      disabled={approvingClaimId === c.id}
                                      onClick={() => handleQuickApprove(c)}
                                      className="min-h-11 gap-2"
                                    >
                                      {approvingClaimId !== c.id && (
                                        <CheckCircle2 className="w-3 h-3" />
                                      )}
                                      <span>Approve</span>
                                    </Button>
                                  )}

                                {isEligibleForXls && (
                                  <Button
                                    variant="outline"
                                    disabled={generatingXls}
                                    onClick={() =>
                                      handleGenerateXlsForSelected([c.id])
                                    }
                                    className="min-h-11 gap-2"
                                  >
                                    <FileSpreadsheet className="w-3 h-3" />
                                    <span>Create batch</span>
                                  </Button>
                                )}

                                <Link
                                  href={`/finance/claims/${c.id}`}
                                  className={buttonVariants({
                                    variant: "ghost",
                                    className: "min-h-11",
                                  })}
                                >
                                  View
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {pageCount > 1 && (
            <nav
              aria-label="Finance claims pages"
              className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
            >
              <span>
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filtered.length)} of{" "}
                {filtered.length} claims (Page {currentPage} of {pageCount})
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      )}

      {paymentClaim && (
        <PaymentModal
          open={!!paymentClaim}
          claim={paymentClaim}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setPaymentClaim(null)}
          loading={loadingAction}
        />
      )}
    </div>
  );
}

export default function FinanceClaimsPage() {
  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="p-8 text-center text-xs">
            Loading finance claims...
          </div>
        }
      >
        <FinanceClaimsContent />
      </Suspense>
    </AppLayout>
  );
}
