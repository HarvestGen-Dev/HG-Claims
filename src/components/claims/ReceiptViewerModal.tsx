"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClaimAttachment } from "@/lib/types/database";
import { formatFileSize } from "@/lib/utils/formatters";
import { getReceipt } from "@/lib/data/receipts";
import { Download, FileText } from "lucide-react";

export function ReceiptViewerModal({ attachment, onClose }: { attachment: ClaimAttachment | null; onClose: () => void }) {
  const [source, setSource] = useState<{ path: string; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setSource(null);
    setLoading(true);
    async function load() {
      try {
        const file = await getReceipt(attachment!.storage_path);
        const url = file ? (objectUrl = URL.createObjectURL(file)) : attachment!.signed_url || "";
        if (cancelled && objectUrl) URL.revokeObjectURL(objectUrl);
        if (!cancelled) setSource({ path: attachment!.storage_path, url });
      } catch {
        if (!cancelled) setSource({ path: attachment!.storage_path, url: attachment!.signed_url || "" });
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment]);
  if (!attachment) return null;
  const url = source?.path === attachment.storage_path ? source.url : "";
  const isImage = attachment.mime_type.startsWith("image/");
  return <Dialog open={!!attachment} onOpenChange={open => !open && onClose()}>
    <DialogHeader><DialogTitle className="break-words">{attachment.original_filename}</DialogTitle>
      <p className="text-sm text-zinc-500">{formatFileSize(attachment.file_size)}</p>
    </DialogHeader>
    <div className="min-h-40 flex items-center justify-center bg-zinc-50 p-4 border rounded-md">
      {loading ? <p role="status">Loading receipt...</p> : !url ? <p role="alert" className="text-sm text-zinc-600">This file is unavailable. Ask the claimant to attach it again.</p> : isImage ?
        <img src={url} alt={attachment.original_filename} className="max-h-[55dvh] max-w-full object-contain" onError={() => setSource(null)} /> :
        <FileText className="h-12 w-12 text-zinc-400" />}
    </div>
    <div className="flex items-center justify-between gap-3 mt-4">
      <p className="text-xs text-zinc-500">Private receipt</p>
      {url && <a href={url} download={attachment.original_filename} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-emerald-700 font-medium"><Download className="h-4 w-4" />Open file</a>}
    </div>
  </Dialog>;
}
