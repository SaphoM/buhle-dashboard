import type { ReactNode } from "react";
import { TopNav } from "./TopNav";
import { DemoBanner } from "../common/DemoBanner";
import { BuiltByBadge } from "../common/BuiltByBadge";

// Action-confirmation toasts render globally from ToastProvider (App.tsx),
// not per-shell - a single stack survives route changes instead of resetting.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-gradient-bg min-h-screen">
      <DemoBanner />
      <TopNav />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      <BuiltByBadge />
    </div>
  );
}
