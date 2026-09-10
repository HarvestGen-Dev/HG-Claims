"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
export function WorkspaceFeedback() {
  const [error, setError] = useState("");
  useEffect(() => {
    const handle = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("workspace-error", handle);
    return () => window.removeEventListener("workspace-error", handle);
  }, []);
  if (!error) return null;
  return <div role="alert" className="fixed bottom-5 left-4 right-4 mx-auto max-w-lg z-[70] flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-lg">
    <span className="flex-1">{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X className="h-5 w-5" /></button>
  </div>;
}
