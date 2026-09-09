"use client";

import React from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExpenseCategory } from "@/lib/types/database";
import { formatCurrency } from "@/lib/utils/formatters";

export interface ExpenseItemDraft {
  id?: string;
  expense_date: string;
  expense_category_id: string;
  vendor?: string;
  description: string;
  amount: number | string;
  notes?: string;
  sort_order: number;
}

interface ExpenseItemsEditorProps {
  expenses: ExpenseItemDraft[];
  categories: ExpenseCategory[];
  onChange: (items: ExpenseItemDraft[]) => void;
  disabled?: boolean;
}

export function ExpenseItemsEditor({
  expenses,
  categories,
  onChange,
  disabled = false,
}: ExpenseItemsEditorProps) {
  const addExpense = () => {
    const today = new Date().toISOString().split("T")[0];
    const newItem: ExpenseItemDraft = {
      expense_date: today,
      expense_category_id: categories[0]?.id || "",
      vendor: "",
      description: "",
      amount: "",
      notes: "",
      sort_order: expenses.length + 1,
    };
    onChange([...expenses, newItem]);
  };

  const removeExpense = (index: number) => {
    if (expenses.length <= 1) return;
    const updated = expenses.filter((_, i) => i !== index);
    onChange(updated);
  };

  const duplicateExpense = (index: number) => {
    const item = expenses[index];
    const duplicated: ExpenseItemDraft = {
      ...item,
      id: undefined,
      description: `${item.description} (Copy)`,
      sort_order: expenses.length + 1,
    };
    onChange([...expenses, duplicated]);
  };

  const updateField = (index: number, field: keyof ExpenseItemDraft, value: any) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const total = expenses.reduce((sum, item) => {
    const val = typeof item.amount === "string" ? parseFloat(item.amount) : item.amount;
    return isNaN(val) ? sum : sum + val;
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            Line Items ({expenses.length})
          </h3>
          <p className="text-[11px] text-zinc-400">
            Individual receipts and expenses (in RM).
          </p>
        </div>

        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addExpense}
            className="h-7 text-xs border-zinc-200 hover:bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:text-zinc-200 gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </Button>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-2.5">
        {expenses.map((item, idx) => (
          <div
            key={item.id || idx}
            className="rounded-lg border border-zinc-200/80 bg-zinc-50/40 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 transition-colors"
          >
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-zinc-200/60 dark:border-zinc-800 text-xs">
              <span className="font-mono text-[11px] font-semibold text-zinc-500 flex items-center gap-1.5">
                <span className="h-4 w-4 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[10px] font-bold">
                  {idx + 1}
                </span>
                Item #{idx + 1}
              </span>

              {!disabled && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => duplicateExpense(idx)}
                    className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
                    title="Duplicate Row"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {expenses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExpense(idx)}
                      className="p-1 text-zinc-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Remove Row"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2.5 text-xs">
              {/* Date */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Date *
                </label>
                <Input
                  type="date"
                  value={item.expense_date}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "expense_date", e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
                  required
                />
              </div>

              {/* Category */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Category *
                </label>
                <select
                  value={item.expense_category_id}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "expense_category_id", e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  required
                >
                  <option value="" disabled>Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Merchant / Vendor */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Vendor
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Grab, Pelita"
                  value={item.vendor || ""}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "vendor", e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>

              {/* Amount */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Amount (RM) *
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-[11px] font-semibold text-zinc-400">
                    RM
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={item.amount}
                    disabled={disabled}
                    onChange={(e) => updateField(idx, "amount", e.target.value)}
                    className="h-8 pl-8 font-mono font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-xs"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div className="md:col-span-8 space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Description / Purpose *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Grab transport to camp venue"
                  value={item.description}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "description", e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  required
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-4 space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Notes
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 12 volunteers"
                  value={item.notes || ""}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "notes", e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subtotal Banner */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-zinc-200/80 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div>
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
            Subtotal
          </span>
          <span className="text-xs text-zinc-500">
            {expenses.length} line item{expenses.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
