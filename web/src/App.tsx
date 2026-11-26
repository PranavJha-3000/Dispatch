import { Navigate, Route, Routes } from "react-router-dom";
import { homeFor, RequireRole, useAuth } from "./hooks/useAuth";
import { Login, Register } from "./pages/AuthPages";
import { PortalLayout } from "./layouts/PortalLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { NewTicket, TicketDetailPage, TicketList } from "./pages/portal/Portal";
import { AdminQueue, AdminTicketPane } from "./pages/admin/Queue";
import { Dashboard } from "./pages/admin/Dashboard";
import { Events } from "./pages/admin/Events";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/app" element={<RequireRole role="USER"><PortalLayout /></RequireRole>}>
        <Route index element={<TicketList />} />
        <Route path="new" element={<NewTicket />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
      </Route>
      <Route path="/admin" element={<RequireRole role="ADMIN"><AdminLayout /></RequireRole>}>
        <Route element={<AdminQueue />}>
          <Route index element={null} />
          <Route path="tickets/:id" element={<AdminTicketPane />} />
        </Route>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="events" element={<Events />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
