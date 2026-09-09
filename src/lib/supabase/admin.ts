import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nlcc-demo.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "demo-service-key";
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
