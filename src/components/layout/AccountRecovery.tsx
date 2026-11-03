import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export function AccountRecovery() {
  return <main className="auth-page"><div className="auth-content">
    <BrandLogo className="mb-8" />
    <h1 className="text-2xl font-semibold mb-3">Account access</h1>
    <p className="text-sm text-zinc-600 leading-relaxed">Use the password recovery form to regain access to your account.</p>
    <Link href="/login" className="inline-flex items-center gap-2 text-sm text-emerald-700 font-medium mt-6"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
  </div></main>;
}
