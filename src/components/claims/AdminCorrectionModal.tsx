"use client";
import { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { masterDataClient, workspaceStore } from "@/lib/domains";
import { CONTEXT_LABELS, needsBeneficiary } from "@/lib/claims-v2";
import type { Claim, DirectoryKind } from "@/lib/types/database";
interface Props {
  open: boolean;
  claim: Claim | null;
  onConfirm: (
    data: Record<string, unknown> & { reason: string },
  ) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}
export function AdminCorrectionModal({
  open,
  claim,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const [team, setTeam] = useState(claim?.ministry_id || "");
  const [kind, setKind] = useState<DirectoryKind | null>(
    claim?.context_kind || null,
  );
  const [valueId, setValueId] = useState(claim?.context_value_id || "");
  const [name, setName] = useState(claim?.context_name || "");
  const [items, setItems] = useState(
    (claim?.expenses || []).map((e) => ({
      id: e.id,
      expense_category_id: e.expense_category_id || "",
      beneficiary_type: e.beneficiary_type || null,
      description: e.description,
    })),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  if (!claim) return null;
  const teams = masterDataClient.getMinistries(),
    cats = masterDataClient.getCategories(),
    values = workspaceStore.getState().managedClaimValues;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogHeader>
        <DialogTitle>Edit claim classifications</DialogTitle>
        <DialogDescription>
          Each changed field is audited. Return the claim to the submitter if
          the amount or payee needs correction.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 my-4">
        <label className="block">
          Team
          <Select
            className="w-full"
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setKind(
                teams.find((t) => t.id === e.target.value)?.context_kind ||
                  null,
              );
              setName("");
              setValueId("");
            }}
          >
            {teams
              .filter((t) => t.is_active || t.id === team)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </label>
        {!teams.find((t) => t.id === team)?.context_kind && (
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={kind === "EVENT"}
              onChange={(e) => {
                setKind(e.target.checked ? "EVENT" : null);
                setName("");
                setValueId("");
              }}
            />
            This is for an event
          </label>
        )}
        {kind && (
          <label className="block">
            {CONTEXT_LABELS[kind]}
            <Select
              className="w-full"
              value={valueId || "OTHER"}
              onChange={(e) => {
                const v = values.find((v) => v.id === e.target.value);
                setValueId(v?.id || "");
                setName(v?.name || "");
              }}
            >
              <option value="OTHER">Other – type the name</option>
              {values
                .filter((v) => v.kind === kind && v.is_active)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </Select>
            {!valueId && (
              <Input
                aria-label={CONTEXT_LABELS[kind]}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </label>
        )}
        {items.map((item, index) => (
          <fieldset key={item.id} className="space-y-3 p-3 border rounded-lg">
            <legend className="px-2">Item {index + 1}</legend>
            <label className="block">
              What was it?
              <Select
                className="w-full"
                value={item.expense_category_id}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            expense_category_id: e.target.value,
                            beneficiary_type: null,
                          }
                        : x,
                    ),
                  )
                }
              >
                {cats
                  .filter(
                    (c) => c.is_active || c.id === item.expense_category_id,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </label>
            {needsBeneficiary(
              cats.find((c) => c.id === item.expense_category_id),
            ) && (
              <label className="block">
                Who was it for?
                <Select
                  className="w-full"
                  value={item.beneficiary_type || ""}
                  onChange={(e) =>
                    setItems(
                      items.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              beneficiary_type: e.target.value as
                                | "INTERNAL"
                                | "EXTERNAL",
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="">Choose</option>
                  <option value="INTERNAL">Internal</option>
                  <option value="EXTERNAL">External</option>
                </Select>
              </label>
            )}
            <label className="block">
              Description
              <Textarea
                value={item.description}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === index ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
          </fieldset>
        ))}
        <label className="block">
          Reason for correction
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          loading={loading}
          disabled={!reason.trim() || loading}
          onClick={async () => {
            if (kind && !name.trim()) {
              setError(`${CONTEXT_LABELS[kind]} is required.`);
              return;
            }
            setError("");
            await onConfirm({
              ministry_id: team,
              context_kind: kind,
              context_value_id: valueId || null,
              context_name: name || null,
              expenses: items,
              reason: reason.trim(),
            });
          }}
        >
          Save classifications
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
