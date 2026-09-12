import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { canAccess } from "./auth/permissions";
import { AppShell } from "./components/layout/AppShell";
import { Login } from "./pages/Login";
import { ExecutiveOverview } from "./pages/ExecutiveOverview";
import { Finance } from "./pages/Finance";
import { Operations } from "./pages/Operations";
import { Farming } from "./pages/Farming";
import { Hr } from "./pages/Hr";
import { Marketing } from "./pages/Marketing";
import { Alumni } from "./pages/Alumni";
import { RiskCentre } from "./pages/RiskCentre";
import { CorrectiveActions } from "./pages/CorrectiveActions";
import { Reports } from "./pages/Reports";
import { Administration } from "./pages/Administration";

function Protected({ path, children }: { path: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(user.role, path)) {
    return (
      <AppShell>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          You do not have access to this section. Contact your System Administrator if you believe this is an
          error.
        </div>
      </AppShell>
    );
  }
  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected path="/"><ExecutiveOverview /></Protected>} />
      <Route path="/finance" element={<Protected path="/finance"><Finance /></Protected>} />
      <Route path="/operations" element={<Protected path="/operations"><Operations /></Protected>} />
      <Route path="/farming" element={<Protected path="/farming"><Farming /></Protected>} />
      <Route path="/hr" element={<Protected path="/hr"><Hr /></Protected>} />
      <Route path="/marketing" element={<Protected path="/marketing"><Marketing /></Protected>} />
      <Route path="/alumni" element={<Protected path="/alumni"><Alumni /></Protected>} />
      <Route path="/risk-centre" element={<Protected path="/risk-centre"><RiskCentre /></Protected>} />
      <Route path="/actions" element={<Protected path="/actions"><CorrectiveActions /></Protected>} />
      <Route path="/reports" element={<Protected path="/reports"><Reports /></Protected>} />
      <Route path="/admin" element={<Protected path="/admin"><Administration /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
