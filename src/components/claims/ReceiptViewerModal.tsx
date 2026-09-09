"use client";

import React from "react";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClaimAttachment } from "@/lib/types/database";
import { formatFileSize } from "@/lib/utils/formatters";
import { FileText, Download, ExternalLink } from "lucide-react";

interface ReceiptViewerModalProps {
  attachment: ClaimAttachment | null;
  onClose: () => void;
}

export function ReceiptViewerModal({ attachment, onClose }: ReceiptViewerModalProps) {
  if (!attachment) return null;

  const isImage = attachment.mime_type.startsWith("image/") || attachment.original_filename.match(/\.(jpg|jpeg|png|webp|gif)$/i);
  const isPdf = attachment.mime_type.includes("pdf") || attachment.original_filename.endsWith(".pdf");

  return (
    <Dialog open={!!attachment} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle className="text-base flex items-center justify-between pr-6 truncate">
          <span className="truncate">{attachment.original_filename}</span>
          <span className="text-xs font-normal text-slate-500 shrink-0 ml-2">
            ({formatFileSize(attachment.file_size)})
          </span>
        </DialogTitle>
      </DialogHeader>

      <div className="mt-2 max-h-[70vh] overflow-y-auto flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
        {isImage ? (
          <img
            src={attachment.signed_url || "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=800&auto=format&fit=crop"}
            alt={attachment.original_filename}
            className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-sm"
          />
        ) : isPdf ? (
          <div className="w-full h-96 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="h-16 w-16 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shadow-inner">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{attachment.original_filename}</p>
              <p className="text-xs text-slate-500">PDF Document • {formatFileSize(attachment.file_size)}</p>
            </div>
            <a
              href={attachment.signed_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
            >
              <ExternalLink className="w-4 h-4" />
              Open PDF in New Window
            </a>
          </div>
        ) : (
          <div className="py-12 text-center space-y-3">
            <FileText className="w-12 h-12 text-slate-400 mx-auto" />
            <p className="font-semibold text-sm">{attachment.original_filename}</p>
            <p className="text-xs text-slate-500">{attachment.mime_type}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between items-center text-xs text-slate-500">
        <span>Uploaded securely to private storage</span>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
        >
          Close Preview
        </button>
      </div>
    </Dialog>
  );
}
