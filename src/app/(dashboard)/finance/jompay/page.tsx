"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { financeClient, claimsClient, workspaceStore } from "@/lib/domains";
import { formatCurrency } from "@/lib/utils/formatters";
import { previewJompayClaims } from "@/lib/banking/jompay";
export default function JompayPage() {
  const [claims, setClaims] = useState(claimsClient.getClaims());
  const [batches, setBatches] = useState(
    financeClient.getReimbursementBatches(),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sync = () => {
      setClaims(claimsClient.getClaims());
      setBatches(financeClient.getReimbursementBatches());
    };
    return workspaceStore.subscribeDomains(["claims", "finance"], sync);
  }, []);
  const eligible = claims.filter((c) => previewJompayClaims([c])[0].eligible);
  return (
    <AppLayout>
      <div className="space-y-5 max-w-4xl">
        <header>
          <h1 className="text-xl font-semibold">JomPAY bills</h1>
          <p className="text-sm text-muted-foreground">
            Each bill remains a separate payment row, including bills for the
            same payee.
          </p>
        </header>
        <Link className="underline text-sm" href="/finance/batches">
          Bank Transfer batches
        </Link>
        <fieldset className="divide-y border rounded-lg">
          <legend className="font-semibold px-2">Approved bills</legend>
          {eligible.map((c) => (
            <label key={c.id} className="flex gap-3 p-4 items-center">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />
              <span className="flex-1">
                {c.claim_number} · {c.claimant_name}
              </span>
              <span>{formatCurrency(c.total_amount)}</span>
            </label>
          ))}
        </fieldset>
        <Button
          disabled={!selected.length || busy}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await workspaceStore.dispatchDomainCommand(
                "/api/v1/finance",
                "finalize_jompay_batch",
                { claim_ids: selected, request_key: crypto.randomUUID() },
              );
              await workspaceStore.refreshDomain("/api/v1/claims");
              setSelected([]);
              window.location.assign(`/finance/batches/${r.id}`);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to reserve bills.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Create frozen JomPAY batch
        </Button>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <section>
          <h2 className="font-semibold mb-3">JomPAY batches</h2>
          <ul className="border rounded-lg divide-y">
            {batches
              .filter((b) => b.payment_method === "JOMPAY")
              .map((b) => (
                <li
                  className="p-4 flex flex-wrap gap-3 justify-between"
                  key={b.id}
                >
                  <Link className="underline" href={`/finance/batches/${b.id}`}>
                    {b.batch_number}
                  </Link>
                  <span>
                    {b.claim_count} bills · {formatCurrency(b.total_amount)}
                  </span>
                  <span>{b.status}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}
