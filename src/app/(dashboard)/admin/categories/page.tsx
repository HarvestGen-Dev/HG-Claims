"use client";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { masterDataClient, workspaceStore } from "@/lib/domains";
import type { ExpenseCategory } from "@/lib/types/database";
export default function CategoriesPage() {
  const [categories, setCategories] = useState(
    masterDataClient.getCategories(),
  );
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      workspaceStore.subscribeDomains(["master-data"], () =>
        setCategories(masterDataClient.getCategories()),
      ),
    [],
  );
  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <h1 className="text-xl font-semibold">Expense classifications</h1>
        <p className="text-sm text-muted-foreground">
          User-friendly What was it? labels. Historical classifications remain
          attached to existing claims.
        </p>
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (editing)
                await masterDataClient.updateCategory(editing.id, {
                  name: name.trim(),
                });
              else
                await masterDataClient.createCategory({
                  code: `V2_CUSTOM_${crypto.randomUUID()}`,
                  name: name.trim(),
                  display_order: categories.length + 1,
                  is_active: true,
                });
              setEditing(null);
              setName("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            Classification name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <div className="flex gap-2">
            <Button loading={busy}>
              {editing ? "Save changes" : "Add classification"}
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
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
        </form>
        <ul className="divide-y border rounded-lg">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap justify-between items-center p-4 gap-3"
            >
              <span>
                {c.name}
                {!c.is_active && " (inactive)"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(c);
                    setName(c.name);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await masterDataClient.updateCategory(c.id, {
                        is_active: !c.is_active,
                      });
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Unable to update.",
                      );
                    }
                  }}
                >
                  {c.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppLayout>
  );
}
