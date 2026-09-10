import { Routes, Route, Navigate } from "react-router-dom";
import PublicRoute from "./components/routing/PublicRoute";
import PrivateRoute from "./components/routing/PrivateRoute";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import VerifyEmail from "./pages/auth/VerifyEmail";
import StreamerDashboard from "./pages/streamer/StreamerDashboard";
import SessionView from "./pages/SessionView";
import DigitalJoin from "./pages/digital/DigitalJoin";
import SessionOverlay from "./pages/overlay/SessionOverlay";

// Route slugs stay Spanish per Constitution §2 (only display text is
// translated). English exceptions here would only be intentional
// integration paths — none in F1 yet.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/registro" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/verificar-email" element={<PublicRoute><VerifyEmail /></PublicRoute>} />

      {/* Streamer authed home — creates and lists sessions. */}
      <Route path="/" element={<PrivateRoute><StreamerDashboard /></PrivateRoute>} />

      {/* Session detail: role dispatched inside SessionView based on
          the view shape (streamer / digital / spectator). Public — no
          guard, the server filters content by caller. */}
      <Route path="/sesion/:id" element={<SessionView />} />

      {/* Guest join: nickname form for a digital player entering a
          specific session. Public. */}
      <Route path="/entrar/:id" element={<DigitalJoin />} />

      {/* OBS browser-source overlay for a session. Forced-dark inside. */}
      <Route path="/sesion/:id/overlay" element={<SessionOverlay />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
