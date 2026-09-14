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

  return (
    <div className="app-gradient-bg flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-md rounded-3xl border border-ink/10 p-8 shadow-[0_8px_30px_rgba(23,20,15,0.08)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={buhleWordmark} alt="Buhle Farmers' Academy" className="mb-3 h-14 w-auto" />
          <h1 className="sr-only">Buhle Farmers Academy</h1>
          <p className="text-sm text-ink-soft/60">Integrated Business Dashboard &amp; Early Warning System</p>
        </div>

        <div className="mb-3 rounded-2xl border border-butter-dark/40 bg-butter/30 px-3 py-2 text-xs text-ink-soft/80">
          Demo mode — select a role below to sign in. Production deployment will use secure authentication
          (Supabase Auth) with real Buhle user accounts.
        </div>

        <div className="flex flex-col gap-2">
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

        <p className="mt-5 text-center text-[11px] text-ink-soft/30">Build v{BUILD_VERSION}</p>
      </div>
    </div>
  );
}
