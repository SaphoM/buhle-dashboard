import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import buhleWordmark from "../assets/buhle-wordmark.png";
import { BUILD_VERSION } from "../data/version";

const roleLabels: Record<string, string> = {
  board: "Board Member",
  executive: "Executive Management",
  finance: "Finance",
  operations: "Operations / Academic",
  farm: "Farm Management",
  hr: "Human Resources",
  marketing: "Marketing",
  alumni: "Alumni",
  admin: "System Administrator",
};

export function Login() {
  const { users, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showDemoNotice, setShowDemoNotice] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  // Placeholder submit handler — wired up to Supabase Auth in production.
  // For now it just points the user at the demo accounts below.
  function handleProductionSignIn(e: FormEvent) {
    e.preventDefault();
    setShowDemoNotice(true);
    setDemoOpen(true);
  }

  return (
    <div className="app-gradient-bg flex min-h-screen items-center justify-center px-4 py-8">
      <div className="card-surface w-full max-w-md rounded-3xl border border-ink/10 p-8 shadow-[0_8px_30px_rgba(23,20,15,0.08)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={buhleWordmark} alt="Buhle Farmers' Academy" className="mb-3 h-14 w-auto" />
          <h1 className="sr-only">Buhle Farmers Academy</h1>
          <p className="text-sm text-ink-soft/60">Integrated Business Dashboard &amp; Early Warning System</p>
        </div>

        {/* Production sign-in form — UI scaffolding for Supabase Auth.
            Not yet wired to a real backend; submitting points to demo accounts. */}
        <form onSubmit={handleProductionSignIn} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-left">
            <span className="text-xs font-medium text-ink-soft/60">Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="name@buhlefarmersacademy.co.za"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/30 outline-none focus:border-butter-dark"
            />
          </label>
          <label className="flex flex-col gap-1 text-left">
            <span className="text-xs font-medium text-ink-soft/60">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/30 outline-none focus:border-butter-dark"
            />
          </label>
          <button
            type="submit"
            className="mt-1 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-butter hover:bg-ink-soft"
          >
            Sign in
          </button>
        </form>

        {showDemoNotice && (
          <p className="mt-3 rounded-2xl border border-butter-dark/40 bg-butter/30 px-3 py-2 text-xs text-ink-soft/80">
            Production sign-in (Supabase Auth) isn't connected yet — use a demo account below instead.
          </p>
        )}

        <button
          type="button"
          onClick={() => setDemoOpen((v) => !v)}
          className="mt-5 flex w-full items-center justify-between rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-sm font-medium text-ink hover:bg-ink/[0.06]"
          aria-expanded={demoOpen}
        >
          <span>Demo accounts</span>
          <span className={`transition-transform ${demoOpen ? "rotate-180" : ""}`}>▾</span>
        </button>

        {demoOpen && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="rounded-2xl border border-butter-dark/40 bg-butter/30 px-3 py-2 text-xs text-ink-soft/80">
              Demo mode — select a role below to sign in instantly without a password. Production deployment will
              use secure authentication (Supabase Auth) with real Buhle user accounts.
            </div>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => login(u.id)}
                className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-2.5 text-left text-sm hover:border-butter-dark hover:bg-butter/20"
              >
                <span>
                  <span className="block font-medium text-ink">{u.name}</span>
                  <span className="block text-xs text-ink-soft/40">{u.department ?? "Cross-functional"}</span>
                </span>
                <span className="rounded-full bg-ink/5 px-2 py-1 text-xs font-medium text-ink-soft/70">
                  {roleLabels[u.role]}
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="mt-5 text-center text-[11px] text-ink-soft/30">Build v{BUILD_VERSION}</p>
      </div>
    </div>
  );
}
