import { useQuery } from "@tanstack/react-query";
import { api } from "../api/axios";
import { API } from "../api/endpoints";
import { getQueueToken } from "../api/sessionStorage";

export const queueKeys = {
  me: (channelSlug) => ["queue", "me", channelSlug],
  list: (channelSlug) => ["queue", "list", channelSlug],
};

// The queueToken overrides the default Authorization for calls scoped to
// a specific queue entry (my position, my leave). Same pattern as the
// guest session token.
function queueConfig(channelSlug) {
  const token = channelSlug ? getQueueToken(channelSlug) : null;
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
}

// Called by anyone (guest or user) with { nickname }.
export async function enqueueSelf({ channelSlug, nickname }) {
  const res = await api.post(API.Channels.EnqueueSelf(channelSlug), { nickname });
  return res.data;
}

// The entrant's own view — position + status. Uses the queueToken. Polled
// while the digital is waiting; F2c will switch to a socket subscription.
export function useMyQueueEntry(channelSlug, { enabled = true, refetchIntervalMs = 3000 } = {}) {
  return useQuery({
    queryKey: queueKeys.me(channelSlug),
    queryFn: async () => {
      const res = await api.get(API.Channels.QueueMe(channelSlug), queueConfig(channelSlug));
      return res.data && res.data.entry;
    },
    enabled: !!channelSlug && !!getQueueToken(channelSlug) && enabled,
    staleTime: 0,
    refetchInterval: refetchIntervalMs,
    // A revoked queueToken (kicked or a fresh install) surfaces as 401/404;
    // stop hammering the endpoint in either case.
    retry: (failureCount, error) => {
      const status = error && error.response && error.response.status;
      if (status === 401 || status === 404) return false;
      return failureCount < 2;
    },
  });
}

// Streamer-only listing of the active queue on this channel.
export function useQueueList(channelSlug, { enabled = true, refetchIntervalMs = 3000 } = {}) {
  return useQuery({
    queryKey: queueKeys.list(channelSlug),
    queryFn: async () => {
      const res = await api.get(API.Channels.QueueList(channelSlug));
      return (res.data && res.data.queue) || [];
    },
    enabled: !!channelSlug && enabled,
    staleTime: 0,
    refetchInterval: refetchIntervalMs,
    retry: false,
  });
}

export async function leaveQueue({ channelSlug }) {
  const res = await api.post(
    API.Channels.QueueLeave(channelSlug),
    {},
    queueConfig(channelSlug)
  );
  return res.data;
}

export async function kickFromQueue({ channelSlug, entryId }) {
  const res = await api.delete(API.Channels.QueueKick(channelSlug, entryId));
  return res.data;
}
