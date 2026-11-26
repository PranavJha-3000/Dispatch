import { Navigate, Route, Routes } from "react-router-dom";
import { homeFor, RequireRole, useAuth } from "./hooks/useAuth";
import { Login, Register } from "./pages/AuthPages";
import { PortalLayout } from "./layouts/PortalLayout";
import { NewTicket, TicketDetailPage, TicketList } from "./pages/portal/Portal";

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
      <Route path="/admin/*" element={<RequireRole role="ADMIN"><div className="p-8">admin</div></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
