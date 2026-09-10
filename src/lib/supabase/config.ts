export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("nlcc-demo") || url.includes("your-")) {
    throw new Error("Supabase is not configured. Set the project URL and publishable key.");
  }
  return { url, key };
}
