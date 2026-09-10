export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export function emitToast(item: Omit<ToastItem, "id"> & { id?: string }) {
  if (typeof window === "undefined") return;
  const id = item.id || Math.random().toString(36).substring(2, 9);
  const detail: ToastItem = {
    id,
    type: item.type || "success",
    title: item.title,
    message: item.message,
    duration: item.duration ?? 4000,
  };
  window.dispatchEvent(new CustomEvent("workspace-toast", { detail }));
}

export const showToast = {
  success: (message: string, title = "Success", duration = 4000) => {
    emitToast({ type: "success", title, message, duration });
  },
  error: (message: string, title = "Error", duration = 5000) => {
    emitToast({ type: "error", title, message, duration });
  },
  info: (message: string, title = "Notice", duration = 4000) => {
    emitToast({ type: "info", title, message, duration });
  },
  warning: (message: string, title = "Warning", duration = 4000) => {
    emitToast({ type: "warning", title, message, duration });
  },
  flashSuccess: (message: string, title = "Success") => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("nlcc_flash_toast", JSON.stringify({ type: "success", title, message }));
      } catch {
        emitToast({ type: "success", title, message });
      }
    }
  },
  flashInfo: (message: string, title = "Notice") => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("nlcc_flash_toast", JSON.stringify({ type: "info", title, message }));
      } catch {
        emitToast({ type: "info", title, message });
      }
    }
  },
};
