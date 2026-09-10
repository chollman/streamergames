import { useQuery } from "@tanstack/react-query";
import { api } from "../api/axios";
import { API } from "../api/endpoints";
import { getGuestToken } from "../api/sessionStorage";

export const sessionKeys = {
  detail: (id) => ["sessions", "detail", id],
};

// Guest tokens override the default Authorization header for calls scoped
// to their session (submit action, get session as guest).
function guestConfig(sessionId) {
  const token = getGuestToken(sessionId);
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
}

export function useSessionQuery(sessionId) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId),
    queryFn: async () => {
      const res = await api.get(API.Sessions.Detail(sessionId), guestConfig(sessionId));
      return res.data;
    },
    enabled: !!sessionId,
    // Sockets keep state fresh; the initial fetch is just to bootstrap
    // before session:state arrives.
    staleTime: 5_000,
  });
}

export async function createSession({ channelSlug, gameId = "the-crew" }) {
  const res = await api.post(API.Channels.CreateSession(channelSlug), { gameId });
  return res.data;
}

export async function joinAsGuest({ sessionId, nickname }) {
  const res = await api.post(API.Sessions.Join(sessionId), { nickname });
  return res.data;
}

export async function startSession({ sessionId }) {
  const res = await api.post(API.Sessions.Start(sessionId), {});
  return res.data;
}

export async function submitAction({ sessionId, action }) {
  const res = await api.post(API.Sessions.Actions(sessionId), action, guestConfig(sessionId));
  return res.data;
}
