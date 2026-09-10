import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

// A route only visible to unauthenticated users. Once a token exists in
// Redux, redirect to `to` (default: home). Used for /login, /registro,
// /verificar-email.
export default function PublicRoute({ children, to = "/" }) {
  const authed = useSelector((s) => !!s.auth.token);
  if (authed) return <Navigate to={to} replace />;
  return children;
}
