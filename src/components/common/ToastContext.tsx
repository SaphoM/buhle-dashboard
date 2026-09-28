import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// Global action-confirmation toast system (Section: "every meaningful manual
// action must provide clear visual confirmation"). One queue, one visual
// stack, one position (top-right) for the whole app - pages call
// useToast().success/error/warning/info() rather than rendering their own
// notification.

export type ToastKind = "success" | "warning" | "error" | "info";

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MAX_VISIBLE = 4;
// Success/info are informational and should clear themselves quickly;
// warning/error stay a little longer since they matter more.
const DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  error: 5000,
};

const kindStyles: Record<ToastKind, string> = {
  success: "bg-emerald-600 text-white border-emerald-700",
  warning: "bg-butter text-ink border-butter-dark",
  error: "bg-ink text-butter border-ink",
  info: "bg-white text-ink-soft border-ink/15",
};

const kindIcon: Record<ToastKind, string> = {
  success: "✓",
  warning: "⚠",
  error: "⚠",
  info: "•",
};

const kindRole: Record<ToastKind, "status" | "alert"> = {
  success: "status",
  info: "status",
  warning: "alert",
  error: "alert",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, kind, message }].slice(-MAX_VISIBLE));
      const timer = setTimeout(() => dismiss(id), DURATION[kind]);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      warning: (message) => push("warning", message),
      info: (message) => push("info", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={kindRole[t.kind]}
            aria-live={t.kind === "error" || t.kind === "warning" ? "assertive" : "polite"}
            className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-2xl border px-4 py-3 shadow-lg ${kindStyles[t.kind]}`}
          >
            <span className="text-sm">{kindIcon[t.kind]}</span>
            <p className="text-xs font-medium leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-1 shrink-0 opacity-60 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
