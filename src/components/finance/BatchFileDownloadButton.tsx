"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { workspaceStore } from "@/lib/domains";
import type { ReimbursementBatch } from "@/lib/types/database";

export function BatchFileDownloadButton({
  batch,
}: {
  batch: ReimbursementBatch;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isJompay = batch.payment_method === "JOMPAY";

  return (
    <div className="min-w-0 space-y-2">
      <Button
        variant="outline"
        className="min-h-11 gap-2"
        loading={busy}
        disabled={busy || batch.status === "VOIDED"}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch(
              `/api/v1/finance/batches/${batch.id}/export`,
              { cache: "no-store" },
            );
            if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(
                result.error ||
                  "Unable to download the bank file. Please try again.",
              );
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download =
              batch.exported_filename ||
              `${batch.batch_number}.${isJompay ? "xlsx" : "xls"}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            // A refresh failure must not turn a successful file download into a failed export.
            await Promise.allSettled([
              workspaceStore.refreshDomain("/api/v1/finance"),
              workspaceStore.refreshDomain("/api/v1/claims"),
            ]);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to download the bank file.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {!busy && <Download className="size-4" />}Download{" "}
        {isJompay ? "JomPAY XLSX" : "Bank Transfer XLS"}
      </Button>
      {error && (
        <p role="alert" className="max-w-md text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
