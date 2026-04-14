import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastStore = {
  toasts: Toast[];
  add: (message: string, variant?: ToastVariant) => void;
  remove: (id: string) => void;
};

let counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, variant = "info") => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    // auto-dismiss after 4 s
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience hook for components
export function useToast() {
  const add = useToastStore((s) => s.add);
  return {
    success: (msg: string) => add(msg, "success"),
    error:   (msg: string) => add(msg, "error"),
    info:    (msg: string) => add(msg, "info"),
    warning: (msg: string) => add(msg, "warning"),
  };
}
