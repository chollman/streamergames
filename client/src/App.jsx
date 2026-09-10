import { Routes, Route, Navigate } from "react-router-dom";
import PublicRoute from "./components/routing/PublicRoute";
import PrivateRoute from "./components/routing/PrivateRoute";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import VerifyEmail from "./pages/auth/VerifyEmail";
import Home from "./pages/Home";

// Route slugs stay Spanish per Constitution §2 (only display text is
// translated). English exceptions here would only be intentional
// integration paths — none in F1e.2.
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/registro"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/verificar-email"
        element={
          <PublicRoute>
            <VerifyEmail />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Home />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
