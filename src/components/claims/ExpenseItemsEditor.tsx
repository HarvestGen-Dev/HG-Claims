"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
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
  Camera,
  RefreshCw,
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
  onAttachmentUploaded?: (attachment: AttachmentDraft, index: number) => void;
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
  registerCameraInput: (index: number, el: HTMLInputElement | null) => void;
  triggerFileInput: (index: number) => void;
  triggerCameraInput: (index: number) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}

function getFileIcon(mime: string, name: string) {
  if (mime?.includes("pdf") || name?.endsWith(".pdf"))
    return <FileText className="w-5 h-5 text-rose-600 shrink-0" />;
  if (mime?.startsWith("image/") || name?.match(/\.(jpg|jpeg|png)$/i))
    return <ImageIcon className="w-5 h-5 text-emerald-600 shrink-0" />;
  return <File className="w-5 h-5 text-zinc-500 shrink-0" />;
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
  onUpdateField,
  onDuplicate,
  onDelete,
  onFileUpload,
  onRetryUpload,
  onRemoveAttachment,
  onPreviewAttachment,
  onDragOverChange,
  registerFileInput,
  registerCameraInput,
  triggerFileInput,
  triggerCameraInput,
  cardRef,
}: ExpenseReceiptCardProps) {
  const selectedCategory = categories.find(
    (c) => c.id === item.expense_category_id,
  );
  const showBeneficiary = needsBeneficiary(selectedCategory);

  return (
    <div
      ref={cardRef}
      data-testid={`expense-item-${index + 1}`}
      className="expense-item-card rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 space-y-4"
    >
      {/* 0. Card Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {index + 1}
          </span>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Expense Item {index + 1}
          </h3>
        </div>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {item.attachment ? "Receipt attached" : "Attach receipt below"}
        </span>
      </div>

      {/* 1. Receipt / Invoice Upload Section (Prominent at Top) */}
      <div className="receipt-upload-section space-y-2">
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
          Receipt / Invoice Upload
        </label>

        {/* Hidden inputs for file selection and mobile camera */}
        <input
          type="file"
          ref={(el) => registerFileInput(index, el)}
          accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc"
          className="hidden"
          onChange={(e) => onFileUpload(index, e.target.files)}
        />
        <input
          type="file"
          ref={(el) => registerCameraInput(index, el)}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFileUpload(index, e.target.files)}
        />

        {item.attachment ? (
          /* Attached Receipt Preview Card */
          <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/30 text-xs">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="h-9 w-9 rounded-md bg-white dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900 shadow-2xs">
                {getFileIcon(
                  item.attachment.mime_type,
                  item.attachment.original_filename,
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate text-xs" title={item.attachment.original_filename}>
                  {item.attachment.original_filename}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                  {formatFileSize(item.attachment.file_size)} &middot; Ready for review
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onPreviewAttachment(
                    item.attachment as unknown as ClaimAttachment,
                  )
                }
                className="h-8 px-2.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100/70 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                title="Preview attachment"
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                <span>Preview</span>
              </Button>
              {!disabled && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => triggerFileInput(index)}
                    className="h-8 px-2 text-xs text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    title="Replace receipt"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    <span>Replace</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveAttachment(index)}
                    className="h-8 w-8 p-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title={`Remove ${item.attachment.original_filename}`}
                    aria-label={`Remove ${item.attachment.original_filename}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Prominent Drag & Drop Upload Zone */
          <div className="space-y-2">
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
              className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-all ${
                isDragOver
                  ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-400 dark:bg-emerald-950/40"
                  : "border-zinc-300 hover:border-emerald-500 hover:bg-emerald-50/20 dark:border-zinc-700 dark:hover:border-emerald-500 dark:hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {isUploading
                      ? "Uploading receipt..."
                      : "Click to upload receipt or drag & drop"}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    PDF, JPG, PNG, Excel or Word (up to {maxFileSizeMb}MB)
                  </p>
                </div>
              </div>

              {/* Mobile Quick Actions: Take Photo / Choose File */}
              {!disabled && !isUploading && (
                <div className="mt-3 flex items-center justify-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 sm:hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerCameraInput(index);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Take photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerFileInput(index);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Browse files</span>
                  </button>
                </div>
              )}
            </div>

            {uploadError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
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

      {/* 2. Expense Details Section */}
      <div className="expense-details-section pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
        <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
          Expense Details
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {showBeneficiary && (
            <div className="sm:col-span-2 space-y-1">
              <label htmlFor={`receipt-${index}-beneficiary`}>
                Who was it for? *
              </label>
              <Select
                className="w-full"
                id={`receipt-${index}-beneficiary`}
                value={item.beneficiary_type || "INTERNAL"}
                disabled={disabled}
                onChange={(e) =>
                  onUpdateField(index, "beneficiary_type", e.target.value)
                }
                required
              >
                <option value="INTERNAL">Internal</option>
                <option value="EXTERNAL">External</option>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor={`receipt-${index}-invoice`}>
              Receipt / invoice number (optional)
            </label>
            <Input
              id={`receipt-${index}-invoice`}
              value={item.invoice_number || ""}
              disabled={disabled}
              placeholder="e.g. INV-10492"
              onChange={(e) =>
                onUpdateField(index, "invoice_number", e.target.value)
              }
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label htmlFor={`receipt-${index}-description`}>
              {selectedCategory?.code === "V2_OTHER"
                ? "Description *"
                : "Description (optional)"}
            </label>
            <Input
              id={`receipt-${index}-description`}
              value={item.description}
              disabled={disabled}
              required={selectedCategory?.code === "V2_OTHER"}
              onChange={(e) =>
                onUpdateField(index, "description", e.target.value)
              }
              placeholder="Add a short explanation if needed"
            />
          </div>
        </div>
      </div>

      {/* 3. Actions Section (At the Bottom) */}
      <div className="expense-actions-section pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
        <div>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDuplicate(index)}
              className="text-xs h-8 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 gap-1.5"
              title="Duplicate receipt (copies attachment for another expense)"
            >
              <Copy className="w-3.5 h-3.5 text-zinc-500" />
              <span>Duplicate</span>
            </Button>
          )}
        </div>
        <div>
          {!disabled && canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(index)}
              className="text-xs h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5"
              title="Remove this expense item"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Remove item</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

export function ExpenseItemsEditor({
  expenses,
  categories = [],
  userId,
  onChange,
  onAttachmentUploaded,
  disabled = false,
  maxFileSizeMb = 10,
}: ExpenseItemsEditorProps) {
  const [previewAttachment, setPreviewAttachment] =
    useState<ClaimAttachment | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const [retryableFiles, setRetryableFiles] = useState<Record<number, File>>(
    {},
  );
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAttachmentUploadedRef = useRef(onAttachmentUploaded);
  onAttachmentUploadedRef.current = onAttachmentUploaded;

  // Auto-scroll to newly added or duplicated item
  useEffect(() => {
    if (scrollTargetId && cardRefs.current[scrollTargetId]) {
      cardRefs.current[scrollTargetId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      setScrollTargetId(null);
    }
  }, [scrollTargetId, expenses]);

  const registerFileInput = useCallback(
    (index: number, el: HTMLInputElement | null) => {
      fileInputRefs.current[index] = el;
    },
    [],
  );

  const registerCameraInput = useCallback(
    (index: number, el: HTMLInputElement | null) => {
      cameraInputRefs.current[index] = el;
    },
    [],
  );

  const triggerFileInput = useCallback((index: number) => {
    fileInputRefs.current[index]?.click();
  }, []);

  const triggerCameraInput = useCallback((index: number) => {
    cameraInputRefs.current[index]?.click();
  }, []);

  const addReceipt = useCallback(() => {
    const current = expensesRef.current;
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
    });
    const newTempId = crypto.randomUUID();
    const newItem: ExpenseItemDraft = {
      temp_id: newTempId,
      expense_date: today,
      expense_category_id: undefined,
      description: "",
      amount: "",
      notes: "",
      invoice_number: "",
      vendor: "",
      beneficiary_type: "INTERNAL",
      sort_order: current.length + 1,
      attachment: null,
    };
    setScrollTargetId(newTempId);
    onChangeRef.current([...current, newItem]);
  }, []);

  const removeReceipt = useCallback((index: number) => {
    const current = expensesRef.current;
    if (current.length <= 1) return;
    const updated = current.filter((_, i) => i !== index);
    onChangeRef.current(updated);
  }, []);

  // Duplication: Copies receipt attachment, NOT entered expense details. Defaults to Internal.
  const duplicateReceipt = useCallback((index: number) => {
    const current = expensesRef.current;
    const item = current[index];
    if (!item) return;

    const sourceAttachment = item.attachment;
    const newTempId = crypto.randomUUID();
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
    });

    const duplicatedAttachment: AttachmentDraft | null = sourceAttachment
      ? {
          ...sourceAttachment,
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          expense_id: newTempId,
        }
      : null;

    const duplicated: ExpenseItemDraft = {
      temp_id: newTempId,
      expense_date: today,
      expense_category_id: undefined,
      description: "",
      amount: "",
      invoice_number: "",
      notes: "",
      vendor: "",
      beneficiary_type: "INTERNAL",
      sort_order: current.length + 1,
      attachment: duplicatedAttachment,
    };

    setScrollTargetId(newTempId);
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
        // Preserve saved or selected beneficiary_type; default to INTERNAL if unset
        ...(field === "expense_category_id"
          ? { beneficiary_type: existing.beneficiary_type || "INTERNAL" }
          : {}),
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
        onAttachmentUploadedRef.current?.(newAttachment, index);
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
        if (cameraInputRefs.current[index]) {
          cameraInputRefs.current[index]!.value = "";
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
      <div className="flex items-center justify-between text-sm text-muted-foreground pb-1">
        <span>
          {expenses.length} expense {expenses.length === 1 ? "item" : "items"}
        </span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          Subtotal: {formatCurrency(total)}
        </span>
      </div>

      {/* Expense Item Cards */}
      <div className="space-y-4">
        {(expenses || []).map((item, idx) => {
          const key = item.id || item.temp_id || `item-${idx}`;
          return (
            <ExpenseReceiptCard
              key={key}
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
              onUpdateField={updateField}
              onDuplicate={duplicateReceipt}
              onDelete={removeReceipt}
              onFileUpload={handleFileUpload}
              onRetryUpload={handleRetryUpload}
              onRemoveAttachment={removeAttachmentFromReceipt}
              onPreviewAttachment={setPreviewAttachment}
              onDragOverChange={setDragOverIdx}
              registerFileInput={registerFileInput}
              registerCameraInput={registerCameraInput}
              triggerFileInput={triggerFileInput}
              triggerCameraInput={triggerCameraInput}
              cardRef={(el) => {
                if (item.temp_id) cardRefs.current[item.temp_id] = el;
                else if (item.id) cardRefs.current[item.id] = el;
              }}
            />
          );
        })}
      </div>

      {/* Add Expense Item Button */}
      {!disabled && (
        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={addReceipt}
            className="w-full h-11 border-dashed border-zinc-300 hover:border-emerald-600 hover:bg-emerald-50/50 hover:text-emerald-700 text-zinc-700 dark:border-zinc-700 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300 text-xs font-semibold gap-2 transition-all shadow-2xs"
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
