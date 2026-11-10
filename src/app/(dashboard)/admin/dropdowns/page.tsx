"use client";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { workspaceStore } from "@/lib/domains";
import { CONTEXT_LABELS } from "@/lib/claims-v2";
import type { DirectoryKind, ManagedClaimValue } from "@/lib/types/database";

export default function DropdownsPage() {
  const [values, setValues] = useState(
    workspaceStore.getState().managedClaimValues,
  );
  const [kind, setKind] = useState<DirectoryKind>("EVENT");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<ManagedClaimValue | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [claims, setClaims] = useState(workspaceStore.getState().claims);
  useEffect(
    () =>
      workspaceStore.subscribeDomains(["master-data", "claims"], () => {
        setValues(workspaceStore.getState().managedClaimValues);
        setClaims(workspaceStore.getState().claims);
      }),
    [],
  );
  const custom = Array.from(
    new Map(
      claims
        .filter((c) => c.context_kind && !c.context_value_id && c.context_name)
        .map((c) => [
          `${c.context_kind}:${c.context_name?.trim().toLowerCase()}`,
          { kind: c.context_kind!, name: c.context_name! },
        ]),
    ).values(),
  ).filter(
    (c) =>
      !values.some(
        (v) =>
          v.kind === c.kind &&
          v.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
      ),
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await workspaceStore.dispatchDomainCommand(
        "/api/v1/master-data",
        "master_save",
        {
          table: "claim_dropdown_values",
          id: editing?.id,
          data: { kind, name, is_active: true },
        },
      );
      setEditing(null);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout>
      <div className="space-y-5 max-w-3xl">
        <header>
          <h1 className="text-xl font-semibold">Dropdown lists</h1>
          <p className="text-sm text-muted-foreground">
            Manage names available in claims. Custom submissions remain
            preserved.
          </p>
        </header>
        <Card>
          <CardContent className="p-4">
            <form onSubmit={save} className="space-y-3">
              <label className="block">
                List
                <Select
                  className="w-full"
                  value={kind}
                  disabled={!!editing}
                  onChange={(e) => setKind(e.target.value as DirectoryKind)}
                >
                  {Object.entries(CONTEXT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                Name
                <Input
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <div className="flex gap-2">
                <Button loading={busy}>
                  {editing ? "Save changes" : "Add name"}
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(null);
                      setName("");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <ul className="divide-y rounded-lg border">
          {values
            .filter((v) => v.kind === kind)
            .map((v) => (
              <li
                key={v.id}
                className="p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <span>
                  {v.name}
                  {!v.is_active && " (inactive)"}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(v);
                      setName(v.name);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await workspaceStore.dispatchDomainCommand(
                          "/api/v1/master-data",
                          "master_save",
                          {
                            table: "claim_dropdown_values",
                            id: v.id,
                            data: {
                              kind: v.kind,
                              name: v.name,
                              is_active: !v.is_active,
                            },
                          },
                        );
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Unable to save.",
                        );
                      }
                    }}
                  >
                    {v.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </li>
            ))}
        </ul>
        {custom.length > 0 && (
          <section>
            <h2 className="font-semibold mb-3">Names submitted as Other</h2>
            <ul className="divide-y border rounded-lg">
              {custom.map((v) => (
                <li
                  key={`${v.kind}:${v.name}`}
                  className="p-4 flex justify-between gap-3"
                >
                  <span>
                    {CONTEXT_LABELS[v.kind]}: {v.name}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setKind(v.kind);
                      setName(v.name);
                      setEditing(null);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Add to list
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
