"use client";

import { useToastStore, type ToastVariant } from "@/stores/toast-store";
import { cn } from "@/lib/utils/cn";
import { useEffect, useState } from "react";

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "bg-secondary-container text-on-secondary-container",
  error:   "bg-error-container text-on-error-container",
  warning: "bg-tertiary-container text-on-tertiary-container",
  info:    "bg-surface-container-highest text-on-surface",
};

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: "✓",
  error:   "✕",
  warning: "⚠",
  info:    "i",
};

function ToastItem({ id, message, variant }: { id: string; message: string; variant: ToastVariant }) {
  const remove = useToastStore((s) => s.remove);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // mount → slide in
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl px-4 py-3 shadow-xl text-sm font-medium",
        "transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        VARIANT_STYLES[variant]
      )}
    >
      <span className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-current/20 text-xs font-bold">
        {VARIANT_ICON[variant]}
      </span>
      <span className="flex-1 leading-snug">{message}</span>
      <button
        onClick={() => remove(id)}
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity ml-1 text-xs"
        aria-label="Schließen"
      >
        ✕
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      className="fixed bottom-20 right-4 z-[200] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
