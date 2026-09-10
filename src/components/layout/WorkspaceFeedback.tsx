"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { ToastItem, ToastType } from "@/lib/utils/toast";

function WorkspaceFeedbackInner() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pathname = usePathname();

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [...prev.filter((t) => t.id !== toast.id), toast]);

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        removeToast(toast.id);
      }, toast.duration);
    }
  }, [removeToast]);

  // Check for flash toasts on route changes or mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const flash = sessionStorage.getItem("nlcc_flash_toast");
      if (flash) {
        sessionStorage.removeItem("nlcc_flash_toast");
        const parsed = JSON.parse(flash);
        addToast({
          id: Math.random().toString(36).substring(2, 9),
          type: parsed.type || "success",
          title: parsed.title,
          message: parsed.message,
          duration: parsed.duration || 4500,
        });
      }
    } catch {}
  }, [pathname, addToast]);

  // Event listeners
  useEffect(() => {
    const handleCustomToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastItem>;
      if (customEvent.detail) {
        addToast(customEvent.detail);
      }
    };

    const handleSuccess = (event: Event) => {
      const detail = (event as CustomEvent<string | { title?: string; message: string }>).detail;
      const message = typeof detail === "string" ? detail : detail.message;
      const title = typeof detail === "string" ? "Success" : (detail.title || "Success");
      addToast({
        id: Math.random().toString(36).substring(2, 9),
        type: "success",
        title,
        message,
        duration: 4000,
      });
    };

    const handleError = (event: Event) => {
      const detail = (event as CustomEvent<string | { title?: string; message: string }>).detail;
      const message = typeof detail === "string" ? detail : detail.message;
      const title = typeof detail === "string" ? "Error" : (detail.title || "Error");
      addToast({
        id: Math.random().toString(36).substring(2, 9),
        type: "error",
        title,
        message,
        duration: 5000,
      });
    };

    window.addEventListener("workspace-toast", handleCustomToast);
    window.addEventListener("workspace-success", handleSuccess);
    window.addEventListener("workspace-error", handleError);

    return () => {
      window.removeEventListener("workspace-toast", handleCustomToast);
      window.removeEventListener("workspace-success", handleSuccess);
      window.removeEventListener("workspace-error", handleError);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none sm:max-w-md"
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />;
      case "info":
      default:
        return <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />;
    }
  };

  const getBorderColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "border-emerald-200/90 dark:border-emerald-800/80 bg-white dark:bg-zinc-900";
      case "warning":
        return "border-amber-200/90 dark:border-amber-800/80 bg-white dark:bg-zinc-900";
      case "error":
        return "border-rose-200/90 dark:border-rose-800/80 bg-white dark:bg-zinc-900";
      case "info":
      default:
        return "border-blue-200/90 dark:border-blue-800/80 bg-white dark:bg-zinc-900";
    }
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${getBorderColor(
        toast.type
      )}`}
    >
      {getIcon(toast.type)}
      <div className="flex-1 min-w-0 pr-1">
        {toast.title && (
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">
            {toast.title}
          </h4>
        )}
        <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed break-words">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close notification"
        className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function WorkspaceFeedback() {
  return (
    <Suspense fallback={null}>
      <WorkspaceFeedbackInner />
    </Suspense>
  );
}
