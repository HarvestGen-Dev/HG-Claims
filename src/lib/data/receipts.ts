import { createClient } from "@/lib/supabase/client";

// In-memory/session fallback cache for reliable previewing and demo mode
const localBlobCache = new Map<string, Blob>();

function resolveMimeType(path: string, originalType?: string): string {
  if (originalType && originalType !== "application/octet-stream" && originalType !== "image/jpg") {
    return originalType;
  }
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "pdf":
      return "application/pdf";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    default:
      return originalType || "application/octet-stream";
  }
}

export async function saveReceipt(path: string, file: Blob): Promise<void> {
  const contentType = resolveMimeType(path, file.type);
  localBlobCache.set(path, file);

  try {
    const client = createClient();
    // Resolve logged in user id for RLS alignment
    const { data: { user } } = await client.auth.getUser();

    let uploadPath = path;
    if (user?.id && !path.startsWith(user.id)) {
      const parts = path.split("/");
      if (parts.length >= 2) {
        parts[0] = user.id;
        uploadPath = parts.join("/");
      }
    }

    const { error } = await client.storage.from("receipts").upload(uploadPath, file, {
      contentType,
      upsert: true,
    });

    if (error) {
      console.warn("Supabase storage upload returned:", error.message);
      // In demo/unconfigured bucket mode, keep in local cache without blocking user
      if (!error.message.toLowerCase().includes("bucket not found") && !error.message.toLowerCase().includes("not configured")) {
        throw new Error(error.message);
      }
    }
  } catch (err: any) {
    console.warn("saveReceipt notice:", err?.message);
    if (err?.message && !err.message.includes("is not configured") && !err.message.includes("Bucket not found")) {
      throw err;
    }
  }
}

export async function getReceipt(path: string): Promise<Blob> {
  if (localBlobCache.has(path)) {
    return localBlobCache.get(path)!;
  }
  try {
    const client = createClient();
    const { data, error } = await client.storage.from("receipts").download(path);
    if (error || !data) {
      throw new Error(error?.message || "Receipt unavailable or access denied.");
    }
    localBlobCache.set(path, data);
    return data;
  } catch (err: any) {
    if (localBlobCache.has(path)) {
      return localBlobCache.get(path)!;
    }
    throw new Error(err?.message || "Receipt unavailable or access denied.");
  }
}

