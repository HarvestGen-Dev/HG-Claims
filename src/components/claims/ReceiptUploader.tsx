"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  File,
  FileText,
  Image as ImageIcon,
  Trash2,
  Eye,
} from "lucide-react";
import { ClaimAttachment } from "@/lib/types/database";
import { formatFileSize } from "@/lib/utils/formatters";
import { ReceiptViewerModal } from "./ReceiptViewerModal";
import { saveReceipt } from "@/lib/data/receipts";

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
  maxFileSizeMb?: number;
  maxAttachments?: number;
}

export function ReceiptUploader({
  attachments,
  onChange,
  userId,
  disabled = false,
  maxFileSizeMb = 10,
  maxAttachments = 15,
}: ReceiptUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewItem, setPreviewItem] = useState<ClaimAttachment | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    complete: 0,
    total: 0,
  });
  const uploadLock = useRef(false);

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

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled || uploadLock.current) return;
    uploadLock.current = true;
    setUploading(true);
    setUploadProgress({ complete: 0, total: files.length });

    const newAttachments: AttachmentDraft[] = [...attachments];
    const errors: string[] = [];

    const fileList = Array.from(files);
    for (let index = 0; index < fileList.length; index++) {
      const file = fileList[index];
      // 10MB limit
      if (newAttachments.length >= maxAttachments) {
        errors.push(`A maximum of ${maxAttachments} attachments is allowed.`);
        continue;
      }
      if (file.size > maxFileSizeMb * 1024 * 1024) {
        errors.push(`${file.name} exceeds the ${maxFileSizeMb} MB limit.`);
        continue;
      }

      // Check mime
      const isAllowed =
        allowedTypes.includes(file.type) ||
        file.name.match(/\.(pdf|jpg|jpeg|png|xlsx|xls|docx|doc)$/i);
      if (!isAllowed) {
        errors.push(`${file.name}: use PDF, JPG, PNG, Excel or Word.`);
        continue;
      }

      const storagePath = `${userId}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      let finalStoragePath = storagePath;
      try {
        const uploadedPath = await saveReceipt(storagePath, file);
        if (uploadedPath) finalStoragePath = uploadedPath;
      } catch (err: any) {
        errors.push(
          `${file.name}: ${err?.message || "Upload failed. Check connection and size."}`,
        );
        continue;
      }

      newAttachments.push({
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        storage_path: finalStoragePath,
        file_category: "RECEIPT",
        uploaded_by: userId,
      });
      setUploadProgress({ complete: index + 1, total: files.length });
    }

    onChange(newAttachments);
    setError(Array.from(new Set(errors)).join(" "));
    if (fileInputRef.current) fileInputRef.current.value = "";
    uploadLock.current = false;
    setUploading(false);
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
    if (mime.includes("pdf") || name.endsWith(".pdf"))
      return <FileText className="w-4 h-4 text-rose-600" />;
    if (mime.startsWith("image/") || name.match(/\.(jpg|jpeg|png)$/i))
      return <ImageIcon className="w-4 h-4 text-emerald-600" />;
    return <File className="w-4 h-4 text-zinc-500" />;
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] text-zinc-400">
          {attachments.length} of {maxAttachments} files &middot; Up to{" "}
          {maxFileSizeMb} MB each
        </p>
      </div>

      {!disabled && (
        <div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraRef}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="min-h-11 border rounded-lg px-4 text-sm"
          >
            Take a photo
          </button>
        </div>
      )}
      {!disabled && (
        <div
          role="button"
          aria-busy={uploading}
          tabIndex={0}
          aria-label="Upload receipts"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-lg border border-dashed p-4 text-center transition-all ${
            isDragging
              ? "border-zinc-900 bg-zinc-100/60 dark:border-zinc-100 dark:bg-zinc-900/60"
              : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50/50 dark:border-zinc-700 dark:hover:border-zinc-600"
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
          <div className="flex items-center justify-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shrink-0">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                {uploading
                  ? `Saving files (${uploadProgress.complete} of ${uploadProgress.total})...`
                  : "Add receipts"}
              </p>
              <p className="text-[10px] text-zinc-400">
                PNG, JPG, PDF, Excel or Word
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Attachment List */}
      {(attachments || []).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(attachments || []).map((att, idx) => (
            <div
              key={att.id || idx}
              className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/60 text-xs shadow-2xs"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="h-7 w-7 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  {getFileIcon(att.mime_type, att.original_filename)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate text-xs">
                    {att.original_filename}
                  </p>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    {formatFileSize(att.file_size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewItem(att as any)}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded dark:hover:bg-zinc-800 transition-colors"
                  aria-label={`Preview ${att.original_filename}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded dark:hover:bg-rose-950/40 transition-colors"
                    aria-label={`Remove ${att.original_filename}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
