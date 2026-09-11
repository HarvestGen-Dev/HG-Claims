"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CategoryManagementPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-500 text-sm">
      Redirecting to Admin Dashboard...
    </div>
  );
}
