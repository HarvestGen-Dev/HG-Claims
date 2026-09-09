"use client";

import React from "react";
import { Plus, Trash2, Copy, Receipt, DollarSign, Calendar, Tag, FileText } from "lucide-react";
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            Expense Line Items ({expenses.length})
          </h3>
          <p className="text-xs text-slate-500">
            Enter each expense receipt separately. Amounts in Malaysian Ringgit (MYR).
          </p>
        </div>

        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addExpense}
            className="flex items-center gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </Button>
        )}
      </div>

      {/* Responsive Cards for Mobile & Clean Grid for Desktop */}
      <div className="space-y-3">
        {expenses.map((item, idx) => (
          <div
            key={item.id || idx}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
                  {idx + 1}
                </span>
                Expense Entry #{idx + 1}
              </span>

              {!disabled && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => duplicateExpense(idx)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
                    title="Duplicate Expense Row"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {expenses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExpense(idx)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"
                      title="Remove Expense Row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Date */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Expense Date *
                </label>
                <Input
                  type="date"
                  value={item.expense_date}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "expense_date", e.target.value)}
                  required
                />
              </div>

              {/* Category */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-slate-400" />
                  Category *
                </label>
                <select
                  value={item.expense_category_id}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "expense_category_id", e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
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
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Vendor / Merchant
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Grab, Pelita, Popular"
                  value={item.vendor || ""}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "vendor", e.target.value)}
                />
              </div>

              {/* Amount */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-slate-400" />
                  Amount (RM) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
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
                    className="pl-9 font-semibold text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div className="md:col-span-8 space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-400" />
                  Description / Item Breakdown *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Grab to youth camp venue, volunteer lunch"
                  value={item.description}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "description", e.target.value)}
                  required
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-4 space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Notes (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 12 volunteers attended"
                  value={item.notes || ""}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "notes", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subtotal / Claim Total Banner */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900 text-white shadow-md">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            Total Claim Amount
          </p>
          <p className="text-xs text-slate-300">
            {expenses.length} item{expenses.length > 1 ? "s" : ""} included
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-emerald-400 tracking-tight">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
