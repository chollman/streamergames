import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSessionQuery } from "../queries/sessions";
import { useSocket } from "./useSocket";
import { setSession, reset } from "../store/slices/sessionSlice";

// One-stop hook for a page that observes a session: sets the sessionSlice
// scope, opens a socket, and returns { session, initialQuery } for rendering.
// The socket keeps sessionSlice.view fresh via applyEnvelope; the query is
// the bootstrap in case the page mounted before the socket connected.
export function useSessionSubscription(sessionId, role) {
  const dispatch = useDispatch();
  useSocket(sessionId);
  const initialQuery = useSessionQuery(sessionId);

  useEffect(() => {
    if (sessionId) dispatch(setSession({ sessionId, role }));
    return () => {
      dispatch(reset());
    };
  }, [sessionId, role, dispatch]);

  const session = useSelector((s) => s.session);
  return { session, initialQuery };
}
