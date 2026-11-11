"use client";
import { useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { financeClient, workspaceStore } from "@/lib/domains";
import { JOMPAY_COLUMNS, getJompayReviewRows } from "@/lib/banking/jompay";
import { formatCurrency } from "@/lib/utils/formatters";
import type { ReimbursementBatch } from "@/lib/types/database";
export function JompayBatchDetail({ batch }: { batch: ReimbursementBatch }) {
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [uploadReference, setUploadReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await workspaceStore.refreshDomain("/api/v1/claims");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update batch.");
    } finally {
      setBusy(false);
    }
  }
  const rows = getJompayReviewRows(batch);
  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Link href="/finance/jompay" className="underline text-sm">
          JomPAY bills
        </Link>
        <header>
          <h1 className="text-xl font-semibold">{batch.batch_number}</h1>
          <p className="text-sm text-muted-foreground">
            {batch.claim_count} individual bills ·{" "}
            {formatCurrency(batch.total_amount)} · {batch.status}
          </p>
        </header>
        <section className="space-y-3 border rounded-lg p-4">
          <h2 className="font-semibold">Bank file and upload</h2>
          <p className="text-sm text-muted-foreground">
            Download the frozen JomPAY file, upload it in Alliance Bank, then
            record the upload here. Exporting or recording an upload keeps
            claims Approved until payment completion is confirmed.
          </p>
          {batch.status !== "VOIDED" && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const response = await fetch(
                    `/api/v1/finance/batches/${batch.id}/export`,
                  );
                  if (!response.ok) {
                    const result = await response.json();
                    throw new Error(
                      result.error || "Unable to download JomPAY file.",
                    );
                  }
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${batch.batch_number}.xlsx`;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  await workspaceStore.refreshDomain("/api/v1/finance");
                })
              }
            >
              Download JomPAY XLSX
            </Button>
          )}
          <p className="text-xs break-all text-muted-foreground">
            {batch.exported_file_hash_sha256
              ? `File SHA-256: ${batch.exported_file_hash_sha256}`
              : "Not exported yet"}
          </p>
          {batch.bank_uploaded_at && (
            <p className="text-sm">
              Bank upload recorded: {batch.bank_upload_reference}
            </p>
          )}
          {batch.status === "EXPORTED" && (
            <div className="space-y-2 max-w-md">
              <label className="block" htmlFor="jompay-upload-reference">
                Bank upload reference
              </label>
              <Input
                id="jompay-upload-reference"
                value={uploadReference}
                onChange={(e) => setUploadReference(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy || !uploadReference.trim()}
                onClick={() =>
                  void run(async () => {
                    await financeClient.recordBatchBankUpload({
                      batch_id: batch.id,
                      bank_upload_reference: uploadReference.trim(),
                    });
                    await workspaceStore.refreshDomain("/api/v1/finance");
                  })
                }
              >
                Record Bank Upload
              </Button>
            </div>
          )}
        </section>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <caption className="text-left p-3 font-medium">
              Frozen JomPAY instructions
            </caption>
            <thead>
              <tr>
                {JOMPAY_COLUMNS.map((h) => (
                  <th className="p-3 text-left whitespace-nowrap" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t">
                  {row.map((v, i) => (
                    <td className="p-3 whitespace-nowrap font-mono" key={i}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-muted-foreground break-all">
          Snapshot SHA-256: {batch.content_digest_sha256}
        </div>
        <section className="space-y-3">
          <h2 className="font-semibold">Bill reconciliation</h2>
          <p className="text-sm text-muted-foreground">
            Confirm Processed only after payment has completed. A failed bill is
            released for another batch.
          </p>
          <label className="block">
            Payment confirmation reference
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label className="block">
            Failure or void reason
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <ul className="border rounded-lg divide-y">
            {(batch.instructions || []).map((i) => (
              <li
                key={i.id}
                className="p-4 flex flex-wrap justify-between gap-3"
              >
                <div>
                  <p>
                    {i.payment_description} · {formatCurrency(i.amount)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {i.status === "PAID" ? "Processed" : i.status}{" "}
                    {i.failure_reason}
                  </p>
                </div>
                {!["PAID", "FAILED", "VOIDED"].includes(i.status) &&
                  batch.status !== "VOIDED" && (
                    <div className="flex gap-2">
                      <Button
                        disabled={busy || !reference.trim()}
                        onClick={() =>
                          void run(() =>
                            financeClient.reconcileBatchInstruction({
                              instruction_id: i.id,
                              outcome: "PAID",
                              bank_reference: reference,
                            }),
                          )
                        }
                      >
                        Confirm Processed
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          void run(() =>
                            financeClient.reconcileBatchInstruction({
                              instruction_id: i.id,
                              outcome: "FAILED",
                              failure_reason: reason,
                            }),
                          )
                        }
                      >
                        Record failure
                      </Button>
                    </div>
                  )}
              </li>
            ))}
          </ul>
          {!["SETTLED", "VOIDED"].includes(batch.status) &&
            !(batch.instructions || []).some((i) => i.status === "PAID") && (
              <Button
                variant="outline"
                disabled={busy || !reason.trim()}
                onClick={() =>
                  void run(() =>
                    financeClient.voidReimbursementBatch({
                      batch_id: batch.id,
                      void_reason: reason,
                    }),
                  )
                }
              >
                Void &amp; Release Claims
              </Button>
            )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
