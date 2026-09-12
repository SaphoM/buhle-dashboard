import type { ReactNode } from "react";
import { TopNav } from "./TopNav";
import { DemoBanner } from "../common/DemoBanner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-gradient-bg min-h-screen">
      <DemoBanner />
      <TopNav />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
