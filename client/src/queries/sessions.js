import { useQuery } from "@tanstack/react-query";
import { api } from "../api/axios";
import { API } from "../api/endpoints";
import { getGuestToken } from "../api/sessionStorage";

export const sessionKeys = {
  detail: (id) => ["sessions", "detail", id],
  active: (channelSlug) => ["sessions", "active", channelSlug],
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

// Fetches the streamer's currently active session for the channel (lobby
// or in_progress). Returns null if there is none (server returns 204).
// The dashboard uses this to decide whether to show "Continue" or "Create".
export function useActiveSessionQuery(channelSlug) {
  return useQuery({
    queryKey: sessionKeys.active(channelSlug),
    queryFn: async () => {
      const res = await api.get(API.Channels.ActiveSession(channelSlug));
      // 204 = no active session; axios exposes empty body as "".
      if (res.status === 204 || !res.data) return null;
      return res.data.session;
    },
    enabled: !!channelSlug,
    // The dashboard needs a quick answer on mount; we re-query on
    // window focus in case the session ended in another tab.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
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

export async function abandonSession({ sessionId }) {
  const res = await api.post(API.Sessions.Abandon(sessionId), {});
  return res.data;
}

export async function submitAction({ sessionId, action }) {
  const res = await api.post(API.Sessions.Actions(sessionId), action, guestConfig(sessionId));
  return res.data;
}
