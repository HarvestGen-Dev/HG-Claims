"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, File, FileText, Image as ImageIcon, Trash2, Eye, CheckCircle2 } from "lucide-react";
import { ClaimAttachment } from "@/lib/types/database";
import { formatFileSize } from "@/lib/utils/formatters";
import { ReceiptViewerModal } from "./ReceiptViewerModal";

export interface AttachmentDraft {
  id?: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  file_category: "RECEIPT" | "INVOICE" | "SUPPORTING_DOC" | "OTHER";
  uploaded_by: string;
  signed_url?: string;
}

interface ReceiptUploaderProps {
  attachments: AttachmentDraft[];
  onChange: (attachments: AttachmentDraft[]) => void;
  userId: string;
  disabled?: boolean;
}

export function ReceiptUploader({
  attachments,
  onChange,
  userId,
  disabled = false,
}: ReceiptUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewItem, setPreviewItem] = useState<ClaimAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;

    const newAttachments: AttachmentDraft[] = [...attachments];

    Array.from(files).forEach((file) => {
      // 10MB limit
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds maximum 10MB limit.`);
        return;
      }

      // Check mime
      const isAllowed = allowedTypes.includes(file.type) || file.name.match(/\.(pdf|jpg|jpeg|png|xlsx|xls|docx|doc)$/i);
      if (!isAllowed) {
        alert(`File ${file.name} format is not supported. Please upload PDF, JPG, PNG, Excel or Word documents.`);
        return;
      }

      // Local mock preview URL
      const objectUrl = URL.createObjectURL(file);

      newAttachments.push({
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        storage_path: `receipts/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`,
        file_category: "RECEIPT",
        uploaded_by: userId,
        signed_url: objectUrl,
      });
    });

    onChange(newAttachments);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeAttachment = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onChange(updated);
  };

  const getFileIcon = (mime: string, name: string) => {
    if (mime.includes("pdf") || name.endsWith(".pdf")) return <FileText className="w-5 h-5 text-red-500" />;
    if (mime.startsWith("image/") || name.match(/\.(jpg|jpeg|png)$/i)) return <ImageIcon className="w-5 h-5 text-emerald-600" />;
    return <File className="w-5 h-5 text-blue-500" />;
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
          Supporting Documents & Receipts ({attachments.length})
        </h3>
        <p className="text-xs text-slate-500">
          Upload clear scans/photos of official receipts, tax invoices, and bank transfer slips (PDF, JPG, PNG up to 10MB).
        </p>
      </div>

      {!disabled && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
            isDragging
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
              : "border-slate-300 hover:border-emerald-500 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:border-emerald-600"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Click to browse or drag and drop receipt photos
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                PNG, JPG, PDF, Excel up to 10MB per file
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Attachment List */}
      {attachments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {attachments.map((att, idx) => (
            <div
              key={att.id || idx}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-2xs"
            >
              <div className="flex items-center gap-3 truncate pr-2">
                <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  {getFileIcon(att.mime_type, att.original_filename)}
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {att.original_filename}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatFileSize(att.file_size)} • {att.file_category}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewItem(att as any)}
                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg"
                  title="Preview Receipt"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Remove Receipt"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Viewer Modal */}
      <ReceiptViewerModal
        attachment={previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </div>
  );
}
