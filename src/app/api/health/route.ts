import { NextResponse } from "next/server";
import { supabaseConfig } from "@/lib/supabase/config";
export async function GET() {
  try { supabaseConfig(); return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ status: "unconfigured" }, { status: 503 }); }
}
