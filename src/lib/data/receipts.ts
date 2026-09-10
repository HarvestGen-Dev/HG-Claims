import { createClient } from "@/lib/supabase/client";
export async function saveReceipt(path: string, file: Blob): Promise<void> {
  const { error } = await createClient().storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Receipt upload failed. Check the file type, size, and connection.");
}
export async function getReceipt(path: string): Promise<Blob> {
  const { data, error } = await createClient().storage.from("receipts").download(path);
  if (error) throw new Error("Receipt unavailable or access denied.");
  return data;
}
