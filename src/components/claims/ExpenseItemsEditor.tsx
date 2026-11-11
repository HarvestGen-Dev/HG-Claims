"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Trash2,
  Copy,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  File,
  Eye,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { needsBeneficiary } from "@/lib/claims-v2";
import { Select } from "@/components/ui/select";
import { ExpenseCategory, ClaimAttachment } from "@/lib/types/database";
import { formatCurrency, formatFileSize } from "@/lib/utils/formatters";
import { calculateTotalAmount } from "@/lib/utils/calculations";
import { saveReceipt } from "@/lib/data/receipts";

const ReceiptViewerModal = dynamic(
  () => import("./ReceiptViewerModal").then((m) => m.ReceiptViewerModal),
  { ssr: false },
);

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
  vendor?: string;
  invoice_number?: string;
  beneficiary_type?: "INTERNAL" | "EXTERNAL" | null;
  description: string;
  amount: number | string;
  notes?: string;
  sort_order: number;
  attachment?: AttachmentDraft | null;
}

interface ExpenseItemsEditorProps {
  expenses: ExpenseItemDraft[];
  categories?: ExpenseCategory[];
  userId: string;
  onChange: (items: ExpenseItemDraft[]) => void;
  disabled?: boolean;
  maxFileSizeMb?: number;
  requireVendorName?: boolean;
}

interface ExpenseReceiptCardProps {
  categories: ExpenseCategory[];
  item: ExpenseItemDraft;
  index: number;
  canDelete: boolean;
  disabled: boolean;
  isUploading: boolean;
  isDragOver: boolean;
  uploadError?: string;
  hasRetryableFile?: boolean;
  maxFileSizeMb: number;
  requireVendorName: boolean;
  onUpdateField: (
    index: number,
    field: keyof ExpenseItemDraft,
    value: any,
  ) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onFileUpload: (index: number, files: FileList | null) => void;
  onRetryUpload: (index: number) => void;
  onRemoveAttachment: (index: number) => void;
  onPreviewAttachment: (attachment: ClaimAttachment) => void;
  onDragOverChange: (index: number | null) => void;
  registerFileInput: (index: number, el: HTMLInputElement | null) => void;
  triggerFileInput: (index: number) => void;
}

function getFileIcon(mime: string, name: string) {
  if (mime?.includes("pdf") || name?.endsWith(".pdf"))
    return <FileText className="w-4 h-4 text-rose-600" />;
  if (mime?.startsWith("image/") || name?.match(/\.(jpg|jpeg|png)$/i))
    return <ImageIcon className="w-4 h-4 text-emerald-600" />;
  return <File className="w-4 h-4 text-zinc-500" />;
}

const ExpenseReceiptCard = React.memo(function ExpenseReceiptCard({
  item,
  categories,
  index,
  canDelete,
  disabled,
  isUploading,
  isDragOver,
  uploadError,
  hasRetryableFile,
  maxFileSizeMb,
  requireVendorName,
  onUpdateField,
  onDuplicate,
  onDelete,
  onFileUpload,
  onRetryUpload,
  onRemoveAttachment,
  onPreviewAttachment,
  onDragOverChange,
  registerFileInput,
  triggerFileInput,
}: ExpenseReceiptCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="flex flex-wrap items-start justify-between gap-2 pb-3 mb-4 border-b border-border">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold whitespace-nowrap">
            Expense {index + 1}
          </h3>
          <p className="text-xs text-muted-foreground">
            {item.attachment ? "Document attached" : "Attachment optional"}
          </p>
        </div>
        {!disabled && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onDuplicate(index)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 rounded-md hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Duplicate expense details (attachment is not copied)"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                title="Remove expense"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor={`receipt-${index}-date`}>Date *</label>
          <Input
            type="date"
            id={`receipt-${index}-date`}
            value={item.expense_date}
            disabled={disabled}
            onChange={(e) =>
              onUpdateField(index, "expense_date", e.target.value)
            }
            required
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`receipt-${index}-vendor`}>
            Supplier / merchant {requireVendorName ? "*" : "(optional)"}
          </label>
          <Input
            id={`receipt-${index}-vendor`}
            value={item.vendor || ""}
            disabled={disabled}
            required={requireVendorName}
            onChange={(e) => onUpdateField(index, "vendor", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`receipt-${index}-invoice`}>
            Receipt / invoice number (optional)
          </label>
          <Input
            id={`receipt-${index}-invoice`}
            value={item.invoice_number || ""}
            disabled={disabled}
            onChange={(e) =>
              onUpdateField(index, "invoice_number", e.target.value)
            }
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`receipt-${index}-amount`}>Amount (RM) *</label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            id={`receipt-${index}-amount`}
            value={item.amount}
            disabled={disabled}
            onChange={(e) => onUpdateField(index, "amount", e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label htmlFor={`receipt-${index}-category`}>What was it? *</label>
          <Select
            className="w-full"
            id={`receipt-${index}-category`}
            value={item.expense_category_id || ""}
            disabled={disabled}
            onChange={(e) =>
              onUpdateField(index, "expense_category_id", e.target.value)
            }
            required
          >
            <option value="">Choose an expense type</option>
            {categories
              .filter(
                (c) =>
                  (c.is_active && c.code.startsWith("V2_")) ||
                  c.id === item.expense_category_id,
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label htmlFor={`receipt-${index}-description`}>
            {categories.find((c) => c.id === item.expense_category_id)?.code ===
            "V2_OTHER"
              ? "Description *"
              : "Description (optional)"}
          </label>
          <Input
            id={`receipt-${index}-description`}
            value={item.description}
            disabled={disabled}
            required={
              categories.find((c) => c.id === item.expense_category_id)
                ?.code === "V2_OTHER"
            }
            onChange={(e) =>
              onUpdateField(index, "description", e.target.value)
            }
            placeholder="Add a short explanation if needed"
          />
        </div>
        {needsBeneficiary(
          categories.find((c) => c.id === item.expense_category_id),
        ) && (
          <div className="sm:col-span-2 space-y-1">
            <label htmlFor={`receipt-${index}-beneficiary`}>
              Who was it for? *
            </label>
            <Select
              className="w-full"
              id={`receipt-${index}-beneficiary`}
              value={item.beneficiary_type || ""}
              disabled={disabled}
              onChange={(e) =>
                onUpdateField(index, "beneficiary_type", e.target.value)
              }
              required
            >
              <option value="">Choose</option>
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
            </Select>
          </div>
        )}
      </div>

      {/* Embedded Receipt Uploader Section */}
      <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        <input
          type="file"
          ref={(el) => registerFileInput(index, el)}
          accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc"
          className="hidden"
          onChange={(e) => onFileUpload(index, e.target.files)}
        />

        {item.attachment ? (
          /* Attached Receipt Card */
          <div className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20 text-xs">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="h-7 w-7 rounded bg-white dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900 shadow-2xs">
                {getFileIcon(
                  item.attachment.mime_type,
                  item.attachment.original_filename,
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate text-xs">
                  {item.attachment.original_filename}
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                  {formatFileSize(item.attachment.file_size)} &middot; Receipt
                  file attached
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onPreviewAttachment(
                    item.attachment as unknown as ClaimAttachment,
                  )
                }
                className="inline-flex items-center gap-1 p-1 px-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100/60 rounded dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors"
                title="Preview Receipt"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(index)}
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
              aria-label={`Upload receipt for item ${index + 1}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  triggerFileInput(index);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                onDragOverChange(index);
              }}
              onDragLeave={() => onDragOverChange(null)}
              onDrop={(e) => {
                e.preventDefault();
                onDragOverChange(null);
                onFileUpload(index, e.dataTransfer.files);
              }}
              onClick={() => triggerFileInput(index)}
              className={`cursor-pointer rounded-lg border border-dashed p-3 text-center transition-all ${
                isDragOver
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
                    {isUploading
                      ? "Uploading receipt..."
                      : "Upload supporting receipt"}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    PDF, JPG, PNG, Excel or Word (up to {maxFileSizeMb}MB)
                  </p>
                </div>
              </div>
            </div>

            {uploadError && (
              <div
                role="alert"
                className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
              >
                <span className="font-medium">{uploadError}</span>
                {hasRetryableFile && !isUploading && (
                  <button
                    type="button"
                    onClick={() => onRetryUpload(index)}
                    className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 dark:bg-zinc-900 dark:border-rose-800 dark:text-rose-300"
                  >
                    Retry Upload
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export function ExpenseItemsEditor({
  expenses,
  categories = [],
  userId,
  onChange,
  disabled = false,
  maxFileSizeMb = 10,
  requireVendorName = false,
}: ExpenseItemsEditorProps) {
  const [previewAttachment, setPreviewAttachment] =
    useState<ClaimAttachment | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const [retryableFiles, setRetryableFiles] = useState<Record<number, File>>(
    {},
  );
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Keep a mutable ref to current expenses and onChange so card callbacks remain referentially stable
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const registerFileInput = useCallback(
    (index: number, el: HTMLInputElement | null) => {
      fileInputRefs.current[index] = el;
    },
    [],
  );

  const triggerFileInput = useCallback((index: number) => {
    fileInputRefs.current[index]?.click();
  }, []);

  const addReceipt = useCallback(() => {
    const current = expensesRef.current;
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
    });
    const newItem: ExpenseItemDraft = {
      temp_id: crypto.randomUUID(),
      expense_date: today,
      expense_category_id: undefined,
      vendor: "",
      description: "",
      amount: "",
      notes: "",
      sort_order: current.length + 1,
      attachment: null,
    };
    onChangeRef.current([...current, newItem]);
  }, []);

  const removeReceipt = useCallback((index: number) => {
    const current = expensesRef.current;
    if (current.length <= 1) return;
    const updated = current.filter((_, i) => i !== index);
    onChangeRef.current(updated);
  }, []);

  const duplicateReceipt = useCallback((index: number) => {
    const current = expensesRef.current;
    const item = current[index];
    if (!item) return;
    const duplicated: ExpenseItemDraft = {
      ...item,
      id: undefined,
      temp_id: crypto.randomUUID(),
      description: item.description ? `${item.description} (Copy)` : "",
      sort_order: current.length + 1,
      attachment: null,
    };
    onChangeRef.current([...current, duplicated]);
  }, []);

  const updateField = useCallback(
    (index: number, field: keyof ExpenseItemDraft, value: any) => {
      const current = expensesRef.current;
      const existing = current[index];
      if (!existing || existing[field] === value) return;
      const updated = [...current];
      updated[index] = {
        ...existing,
        [field]: value,
        ...(field === "expense_category_id" ? { beneficiary_type: null } : {}),
      };
      onChangeRef.current(updated);
    },
    [],
  );

  const handleFileUpload = useCallback(
    async (index: number, files: FileList | null) => {
      if (!files || files.length === 0 || disabled) return;
      const file = files[0];

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

      const isAllowed =
        allowedMimes.includes(file.type) ||
        file.name.match(/\.(pdf|jpg|jpeg|png|xlsx|xls|docx|doc)$/i);
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
        const current = expensesRef.current;
        const currentItem = current[index];
        if (!currentItem) return;
        const targetExpenseId =
          currentItem.id || currentItem.temp_id || `temp-${index}`;
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

        const updated = [...current];
        updated[index] = { ...currentItem, attachment: newAttachment };
        onChangeRef.current(updated);
        setRetryableFiles((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      } catch (err: any) {
        setRetryableFiles((prev) => ({
          ...prev,
          [index]: file,
        }));
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
    },
    [disabled, maxFileSizeMb, userId],
  );

  const retryableFilesRef = useRef(retryableFiles);
  retryableFilesRef.current = retryableFiles;

  const handleRetryUpload = useCallback(
    (index: number) => {
      const file = retryableFilesRef.current[index];
      if (!file) return;
      const dt = {
        0: file,
        length: 1,
        item: (i: number) => (i === 0 ? file : null),
      } as unknown as FileList;
      void handleFileUpload(index, dt);
    },
    [handleFileUpload],
  );

  const removeAttachmentFromReceipt = useCallback((index: number) => {
    const current = expensesRef.current;
    if (!current[index]) return;
    const updated = [...current];
    updated[index] = { ...current[index], attachment: null };
    onChangeRef.current(updated);
  }, []);

  const total = useMemo(() => calculateTotalAmount(expenses), [expenses]);
  const canDelete = (expenses || []).length > 1;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {expenses.length} expense {expenses.length === 1 ? "item" : "items"} ·{" "}
        {formatCurrency(total)}
      </p>

      {/* Receipt Cards */}
      <div className="space-y-3.5">
        {(expenses || []).map((item, idx) => (
          <ExpenseReceiptCard
            key={item.id || item.temp_id || idx}
            item={item}
            categories={categories}
            index={idx}
            canDelete={canDelete}
            disabled={disabled}
            isUploading={uploadingIdx === idx}
            isDragOver={dragOverIdx === idx}
            uploadError={uploadErrors[idx]}
            hasRetryableFile={Boolean(retryableFiles[idx])}
            maxFileSizeMb={maxFileSizeMb}
            requireVendorName={requireVendorName}
            onUpdateField={updateField}
            onDuplicate={duplicateReceipt}
            onDelete={removeReceipt}
            onFileUpload={handleFileUpload}
            onRetryUpload={handleRetryUpload}
            onRemoveAttachment={removeAttachmentFromReceipt}
            onPreviewAttachment={setPreviewAttachment}
            onDragOverChange={setDragOverIdx}
            registerFileInput={registerFileInput}
            triggerFileInput={triggerFileInput}
          />
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
            <span>Add expense item</span>
          </Button>
        </div>
      )}

      {/* Viewer Modal */}
      {previewAttachment && (
        <ReceiptViewerModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
