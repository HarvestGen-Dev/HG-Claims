"use client";

import React, { useState, useRef } from "react";
import { Plus, Trash2, Copy, UploadCloud, FileText, Image as ImageIcon, File, Eye, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClaimAttachment } from "@/lib/types/database";
import { formatCurrency, formatFileSize } from "@/lib/utils/formatters";
import { calculateTotalAmount } from "@/lib/utils/calculations";
import { ReceiptViewerModal } from "./ReceiptViewerModal";
import { saveReceipt } from "@/lib/data/receipts";

export interface AttachmentDraft {
  id?: string;
  expense_id?: string | null;
  original_filename: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  file_category: "RECEIPT" | "INVOICE" | "SUPPORTING_DOC" | "OTHER";
  uploaded_by: string;
  signed_url?: string;
}

export interface ExpenseItemDraft {
  id?: string;
  temp_id?: string;
  expense_date: string;
  expense_category_id?: string | null;
  cost_centre_id: string;
  vendor?: string;
  description: string;
  amount: number | string;
  notes?: string;
  sort_order: number;
  attachment?: AttachmentDraft | null;
}

interface ExpenseItemsEditorProps {
  expenses: ExpenseItemDraft[];
  categories?: any[];
  userId: string;
  onChange: (items: ExpenseItemDraft[]) => void;
  disabled?: boolean;
  maxFileSizeMb?: number;
}

export function ExpenseItemsEditor({
  expenses,
  categories: _categories,
  userId,
  onChange,
  disabled = false,
  maxFileSizeMb = 10,
}: ExpenseItemsEditorProps) {
  const [previewAttachment, setPreviewAttachment] = useState<ClaimAttachment | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});


  const addReceipt = () => {
    const today = new Date().toISOString().split("T")[0];
    const defaultCostCentre = "";
    const newItem: ExpenseItemDraft = {
      temp_id: crypto.randomUUID(),
      expense_date: today,
      expense_category_id: undefined,
      cost_centre_id: defaultCostCentre,
      vendor: "",
      description: "",
      amount: "",
      notes: "",
      sort_order: expenses.length + 1,
      attachment: null,
    };
    onChange([...expenses, newItem]);
  };

  const removeReceipt = (index: number) => {
    if (expenses.length <= 1) return;
    const updated = expenses.filter((_, i) => i !== index);
    onChange(updated);
  };

  const duplicateReceipt = (index: number) => {
    const item = expenses[index];
    // Copy all metadata, but assign a new temp_id and CLEAR the receipt attachment
    const duplicated: ExpenseItemDraft = {
      ...item,
      id: undefined,
      temp_id: crypto.randomUUID(),
      description: item.description ? `${item.description} (Copy)` : "",
      sort_order: expenses.length + 1,
      attachment: null, // Clear attachment as per requirement
    };
    onChange([...expenses, duplicated]);
  };

  const updateField = (index: number, field: keyof ExpenseItemDraft, value: any) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleFileUpload = async (index: number, files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;
    const file = files[0];

    // File size check
    if (file.size > maxFileSizeMb * 1024 * 1024) {
      setUploadErrors((prev) => ({
        ...prev,
        [index]: `${file.name} exceeds the ${maxFileSizeMb} MB limit.`,
      }));
      return;
    }

    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    const isAllowed = allowedMimes.includes(file.type) || file.name.match(/\.(pdf|jpg|jpeg|png|xlsx|xls|docx|doc)$/i);
    if (!isAllowed) {
      setUploadErrors((prev) => ({
        ...prev,
        [index]: `${file.name}: invalid format. Please use PDF, JPG, PNG, Excel, or Word.`,
      }));
      return;
    }

    setUploadingIdx(index);
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });

    const storagePath = `${userId}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    try {
      const uploadedPath = await saveReceipt(storagePath, file);
      const currentItem = expenses[index];
      const targetExpenseId = currentItem.id || currentItem.temp_id || `temp-${index}`;
      const newAttachment: AttachmentDraft = {
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        expense_id: targetExpenseId,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        storage_path: uploadedPath || storagePath,
        file_category: "RECEIPT",
        uploaded_by: userId,
      };

      const updated = [...expenses];
      updated[index] = { ...updated[index], attachment: newAttachment };
      onChange(updated);
    } catch (err: any) {
      setUploadErrors((prev) => ({
        ...prev,
        [index]: `${file.name} upload failed: ${err?.message || "Please check connection or file size."}`,
      }));
    } finally {
      setUploadingIdx(null);
      if (fileInputRefs.current[index]) {
        fileInputRefs.current[index]!.value = "";
      }
    }
  };

  const removeAttachmentFromReceipt = (index: number) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], attachment: null };
    onChange(updated);
  };

  const getFileIcon = (mime: string, name: string) => {
    if (mime?.includes("pdf") || name?.endsWith(".pdf")) return <FileText className="w-4 h-4 text-rose-600" />;
    if (mime?.startsWith("image/") || name?.match(/\.(jpg|jpeg|png)$/i)) return <ImageIcon className="w-4 h-4 text-emerald-600" />;
    return <File className="w-4 h-4 text-zinc-500" />;
  };

  const total = calculateTotalAmount(expenses);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1 border-b border-zinc-200/60 dark:border-zinc-800">
        <div>
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            Receipts & Invoices ({(expenses || []).length})
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Add the amount and supporting document for each receipt.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Total Receipts</span>
            <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Receipt Cards */}
      <div className="space-y-3.5">
        {(expenses || []).map((item, idx) => (
          <div
            key={item.id || item.temp_id || idx}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            {/* Card Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[11px] font-bold font-mono">
                  {idx + 1}
                </span>
                <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  Receipt #{idx + 1}
                </h4>
                {item.attachment ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> Attached
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    Receipt required
                  </span>
                )}
              </div>

              {!disabled && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => duplicateReceipt(idx)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 rounded-md hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Duplicate Receipt details (resets attachment)"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate</span>
                  </button>
                  {expenses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeReceipt(idx)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Delete Receipt"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 text-xs">
              {/* Date */}
              <div className="md:col-span-3 space-y-1">
                <label htmlFor={`receipt-${idx}-date`} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Receipt Date *
                </label>
                <Input
                  type="date"
                  id={`receipt-${idx}-date`}
                  value={item.expense_date}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "expense_date", e.target.value)}
                  className="h-8 text-xs bg-zinc-50/50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
                  required
                />
              </div>

              {/* Amount (RM) */}
              <div className="md:col-span-4 space-y-1">
                <label htmlFor={`receipt-${idx}-amount`} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
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
                    id={`receipt-${idx}-amount`}
                    value={item.amount}
                    disabled={disabled}
                    onChange={(e) => updateField(idx, "amount", e.target.value)}
                    className="h-8 pl-9 font-mono font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-50/50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-xs"
                    required
                  />
                </div>
              </div>

              {/* Vendor */}
              <div className="md:col-span-4 space-y-1">
                <label htmlFor={`receipt-${idx}-vendor`} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Vendor / Merchant
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Grab, MR DIY, Popular"
                  id={`receipt-${idx}-vendor`}
                  value={item.vendor || ""}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "vendor", e.target.value)}
                  className="h-8 text-xs bg-zinc-50/50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>

              {/* Description */}
              <div className="md:col-span-5 space-y-1">
                <label htmlFor={`receipt-${idx}-description`} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Item Description *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Transport equipment to camp venue"
                  id={`receipt-${idx}-description`}
                  value={item.description}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "description", e.target.value)}
                  className="h-8 text-xs bg-zinc-50/50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  required
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-3 space-y-1">
                <label htmlFor={`receipt-${idx}-notes`} className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Notes (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 12 setup volunteers"
                  id={`receipt-${idx}-notes`}
                  value={item.notes || ""}
                  disabled={disabled}
                  onChange={(e) => updateField(idx, "notes", e.target.value)}
                  className="h-8 text-xs bg-zinc-50/50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>
            </div>

            {/* Embedded Receipt Uploader Section */}
            <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
              <input
                type="file"
                ref={(el) => { fileInputRefs.current[idx] = el; }}
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc"
                className="hidden"
                onChange={(e) => handleFileUpload(idx, e.target.files)}
              />

              {item.attachment ? (
                /* Attached Receipt Card */
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="h-7 w-7 rounded bg-white dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900 shadow-2xs">
                      {getFileIcon(item.attachment.mime_type, item.attachment.original_filename)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate text-xs">
                        {item.attachment.original_filename}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                        {formatFileSize(item.attachment.file_size)} &middot; Receipt file attached
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment(item.attachment as any)}
                      className="inline-flex items-center gap-1 p-1 px-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100/60 rounded dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors"
                      title="Preview Receipt"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeAttachmentFromReceipt(idx)}
                        className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded dark:hover:bg-rose-950/40 transition-colors"
                        title="Remove Receipt File"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Drag & Drop Upload Zone */
                <div>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Upload receipt for item ${idx + 1}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRefs.current[idx]?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIdx(idx);
                    }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverIdx(null);
                      handleFileUpload(idx, e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRefs.current[idx]?.click()}
                    className={`cursor-pointer rounded-lg border border-dashed p-3 text-center transition-all ${
                      dragOverIdx === idx
                        ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-400 dark:bg-emerald-950/40"
                        : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50/60 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="h-7 w-7 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shrink-0">
                        <UploadCloud className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                          {uploadingIdx === idx ? "Uploading receipt..." : "Upload supporting receipt"}
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          PDF, JPG, PNG, Excel or Word (up to {maxFileSizeMb}MB)
                        </p>
                      </div>
                    </div>
                  </div>

                  {uploadErrors[idx] && (
                    <p role="alert" className="mt-1.5 text-xs text-rose-600 font-medium">
                      {uploadErrors[idx]}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Receipt Button (below last receipt upload section, above declaration) */}
      {!disabled && (
        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={addReceipt}
            className="w-full h-10 border-dashed border-zinc-300 hover:border-emerald-600 hover:bg-emerald-50/50 hover:text-emerald-700 text-zinc-700 dark:border-zinc-700 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300 text-xs font-semibold gap-2 transition-all shadow-2xs"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Add Receipt</span>
          </Button>
        </div>
      )}

      {/* Viewer Modal */}
      <ReceiptViewerModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
}
