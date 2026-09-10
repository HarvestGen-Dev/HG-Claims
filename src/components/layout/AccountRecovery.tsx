import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function AccountRecovery() {
  return <main className="auth-page"><div className="auth-content">
    <span className="brand-mark mb-8">NL</span>
    <h1 className="text-2xl font-semibold mb-3">Account access</h1>
    <p className="text-sm text-zinc-600 leading-relaxed">This demo uses email-only sign in. Password changes and recovery emails are not available.</p>
    <Link href="/login" className="inline-flex items-center gap-2 text-sm text-emerald-700 font-medium mt-6"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
  </div></main>;
}
