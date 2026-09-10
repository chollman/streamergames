import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

// A route that requires an authenticated user. Redirects to /login and
// preserves the intended location in state.from so the login page can
// bounce the user back after signing in (F1e.3 will wire that up).
export default function PrivateRoute({ children }) {
  const authed = useSelector((s) => !!s.auth.token);
  const location = useLocation();
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
