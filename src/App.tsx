import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { DataStoreProvider } from "./data/DataStoreContext";
import { ToastProvider } from "./components/common/ToastContext";
import { canAccess, getHomePath } from "./auth/permissions";
import { AppShell } from "./components/layout/AppShell";

const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const ExecutiveOverview = lazy(() =>
  import("./pages/ExecutiveOverview").then((m) => ({ default: m.ExecutiveOverview })),
);
const Finance = lazy(() => import("./pages/Finance").then((m) => ({ default: m.Finance })));
const Operations = lazy(() => import("./pages/Operations").then((m) => ({ default: m.Operations })));
const Farming = lazy(() => import("./pages/Farming").then((m) => ({ default: m.Farming })));
const Hr = lazy(() => import("./pages/Hr").then((m) => ({ default: m.Hr })));
const Marketing = lazy(() => import("./pages/Marketing").then((m) => ({ default: m.Marketing })));
const Alumni = lazy(() => import("./pages/Alumni").then((m) => ({ default: m.Alumni })));
const BusinessDevelopment = lazy(() =>
  import("./pages/BusinessDevelopment").then((m) => ({ default: m.BusinessDevelopment })),
);
const RiskCentre = lazy(() => import("./pages/RiskCentre").then((m) => ({ default: m.RiskCentre })));
const CorrectiveActions = lazy(() =>
  import("./pages/CorrectiveActions").then((m) => ({ default: m.CorrectiveActions })),
);
const Reports = lazy(() => import("./pages/Reports").then((m) => ({ default: m.Reports })));
const DataSubmissions = lazy(() =>
  import("./pages/DataSubmissions").then((m) => ({ default: m.DataSubmissions })),
);
const Administration = lazy(() =>
  import("./pages/Administration").then((m) => ({ default: m.Administration })),
);

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
      <span className="text-sm text-slate-400">Loading…</span>
    </div>
  );
}

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
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </AppShell>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={getHomePath(user.role)} replace />
          ) : (
            <Suspense fallback={<PageFallback />}>
              <Login />
            </Suspense>
          )
        }
      />
      <Route path="/" element={<Protected path="/"><ExecutiveOverview /></Protected>} />
      <Route path="/finance" element={<Protected path="/finance"><Finance /></Protected>} />
      <Route path="/operations" element={<Protected path="/operations"><Operations /></Protected>} />
      <Route path="/farming" element={<Protected path="/farming"><Farming /></Protected>} />
      <Route path="/hr" element={<Protected path="/hr"><Hr /></Protected>} />
      <Route path="/marketing" element={<Protected path="/marketing"><Marketing /></Protected>} />
      <Route path="/alumni" element={<Protected path="/alumni"><Alumni /></Protected>} />
      <Route path="/business-development" element={<Protected path="/business-development"><BusinessDevelopment /></Protected>} />
      <Route path="/risk-centre" element={<Protected path="/risk-centre"><RiskCentre /></Protected>} />
      <Route path="/actions" element={<Protected path="/actions"><CorrectiveActions /></Protected>} />
      <Route path="/reports" element={<Protected path="/reports"><Reports /></Protected>} />
      <Route path="/data" element={<Protected path="/data"><DataSubmissions /></Protected>} />
      <Route path="/admin" element={<Protected path="/admin"><Administration /></Protected>} />
      <Route path="*" element={<Navigate to={user ? getHomePath(user.role) : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <DataStoreProvider>
          <AppRoutes />
        </DataStoreProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
