import { createClient } from "@/lib/supabase/client";

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

export async function saveReceipt(path: string, file: Blob): Promise<string> {
  const client = createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Sign in before uploading a receipt.");
  const parts = path.split("/");
  const uploadPath = parts.length >= 2 ? [user.id, ...parts.slice(1)].join("/") : `${user.id}/${path}`;
  const { error } = await client.storage.from("receipts").upload(uploadPath, file, {
    contentType: resolveMimeType(path, file.type), cacheControl: "0", upsert: false,
  });
  if (error) throw new Error(error.message || "Receipt upload failed. Please try again.");
  return uploadPath;
}

export async function getReceipt(path: string): Promise<Blob> {
  const { data, error } = await createClient().storage.from("receipts").download(path, {}, { cache: "no-store" });
  if (error || !data) throw new Error(error?.message || "Receipt unavailable or access denied.");
  return data;
}
