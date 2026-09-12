import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AppUser } from "../types";
import { DEMO_USERS } from "../data/demoData";

// MVP auth: demo-mode role selection. Real deployment will use Supabase Auth
// (email/password, RLS-backed roles) per the technical recommendation —
// this context's shape is designed to swap in that implementation without
// touching any page component.

interface AuthContextValue {
  user: AppUser | null;
  users: AppUser[];
  login: (userId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      users: DEMO_USERS,
      login: (userId: string) => {
        const found = DEMO_USERS.find((u) => u.id === userId) ?? null;
        setUser(found);
      },
      logout: () => setUser(null),
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
