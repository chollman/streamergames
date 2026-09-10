import { useEffect, useRef } from "react";
import { io as ioClient } from "socket.io-client";
import { useDispatch, useSelector } from "react-redux";
import {
  setConnected,
  applyEnvelope,
  setError,
} from "../store/slices/sessionSlice";
import { getGuestToken } from "../api/sessionStorage";

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

// Pick the right token for the session: guest token wins for a joined digital;
// otherwise the user's Bearer JWT (streamer); otherwise no token (spectator).
function tokenFor(sessionId, userToken) {
  const guest = sessionId ? getGuestToken(sessionId) : null;
  return guest || userToken || null;
}

// Opens a Socket.IO connection scoped to `sessionId` and dispatches
// envelopes into sessionSlice. Reconnects when sessionId or user token
// changes. Emits `session:join` on connect and `session:leave` on cleanup.
// Returns a ref to the socket in case a caller needs to emit directly.
export function useSocket(sessionId) {
  const dispatch = useDispatch();
  const userToken = useSelector((s) => s.auth.token);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return undefined;

    const token = tokenFor(sessionId, userToken);
    const opts = {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      auth: token ? { token } : undefined,
    };
    const socket = SOCKET_URL ? ioClient(SOCKET_URL, opts) : ioClient(opts);
    socketRef.current = socket;

    socket.on("connect", () => {
      dispatch(setConnected(true));
      socket.emit("session:join", { sessionId });
    });
    socket.on("disconnect", () => {
      dispatch(setConnected(false));
    });
    socket.on("connect_error", (err) => {
      dispatch(setError(err && err.message ? err.message : "connect_error"));
    });

    const forward = (eventName) => (envelope) => {
      dispatch(applyEnvelope({ eventName, envelope }));
    };
    socket.on("session:state", forward("session:state"));
    socket.on("session:action-accepted", forward("session:action-accepted"));
    socket.on("session:you-are", forward("session:you-are"));

    return () => {
      try {
        socket.emit("session:leave", { sessionId });
      } catch { /* socket may already be closing */ }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, userToken, dispatch]);

  return socketRef;
}
