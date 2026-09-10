import { createClient } from "@supabase/supabase-js";
import "server-only";
import { supabaseConfig } from "./config";

export function createAdminClient() {
  const { url } = supabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Server credentials for account provisioning are not configured.");
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
