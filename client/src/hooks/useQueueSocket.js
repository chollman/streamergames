import { useEffect } from "react";
import { io as ioClient } from "socket.io-client";
import { useSelector } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { queueKeys } from "../queries/queue";
import { getQueueToken } from "../api/sessionStorage";

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

// Pick the right token for the queue socket:
//   - digital sitting in the queue → queueToken (channel-scoped),
//   - streamer viewing the panel   → user JWT (Bearer),
//   - anonymous viewer             → no token.
function pickToken(channelSlug, userToken) {
  const q = channelSlug ? getQueueToken(channelSlug) : null;
  return q || userToken || null;
}

// Opens a Socket.IO connection scoped to the channel's queue. Listens for
//   seat-queue:updated  → invalidate the queue list + the entrant's /me,
//   seat:offered        → invalidate /me so the offered state shows up
//                         immediately in the digital's tab.
// Polling in useMyQueueEntry / useQueueList stays as a fallback in case
// the socket drops between events.
//
// The hook manages its own socket lifecycle — separate from useSocket
// (session-scoped). That keeps the two concerns cleanly split and means a
// digital sitting in the queue doesn't need to open a session socket
// until they accept a seat.
export function useQueueSocket(channelSlug) {
  const queryClient = useQueryClient();
  const userToken = useSelector((s) => s.auth.token);

  useEffect(() => {
    if (!channelSlug) return undefined;

    const token = pickToken(channelSlug, userToken);
    const opts = {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      auth: token ? { token } : undefined,
    };
    const socket = SOCKET_URL ? ioClient(SOCKET_URL, opts) : ioClient(opts);

    socket.on("connect", () => {
      socket.emit("queue:join", { channelSlug });
    });

    // "Queue changed" — could be an enqueue, kick, leave, offer, accept.
    // We invalidate both the streamer's list and the entrant's /me so
    // whichever the page reads becomes fresh on next render.
    socket.on("seat-queue:updated", () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.list(channelSlug) });
      queryClient.invalidateQueries({ queryKey: queueKeys.me(channelSlug) });
    });

    // Per-entry offer notification. Only the entrant's own tab is in the
    // room. Invalidate /me so the ChannelJoin's waiting card flips to
    // "offered" without a poll wait.
    socket.on("seat:offered", () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.me(channelSlug) });
    });

    return () => {
      try { socket.emit("queue:leave", { channelSlug }); } catch { /* closing */ }
      socket.disconnect();
    };
  }, [channelSlug, userToken, queryClient]);
}
