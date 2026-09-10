import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSessionQuery } from "../queries/sessions";
import { useSocket } from "./useSocket";
import { setSession, reset, applyEnvelope } from "../store/slices/sessionSlice";

// One-stop hook a page uses: sets the sessionSlice scope, opens a socket,
// fires the bootstrap query, and seeds the slice from the query response
// so the UI can render before (or without) any socket events arriving.
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

  // Bootstrap: when the initial query returns, treat it like a synthetic
  // session:state envelope. The socket will still push newer versions
  // afterward; applyEnvelope's version guard means the seed is overwritten
  // by any newer envelope but not clobbered by an older one.
  useEffect(() => {
    if (!initialQuery.data) return;
    const { session: sess, view } = initialQuery.data;
    dispatch(
      applyEnvelope({
        eventName: "session:bootstrap",
        envelope: {
          sessionId: sess && sess._id,
          version: (sess && sess.version) || 0,
          timestamp: new Date().toISOString(),
          view,
        },
      })
    );
  }, [initialQuery.data, dispatch]);

  const session = useSelector((s) => s.session);
  return { session, initialQuery };
}
