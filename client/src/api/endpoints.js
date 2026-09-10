// Single source of truth for HTTP paths. Constitution §5.
// Never inline path strings in components — always reference API.x.Y here.
export const API = {
  Health: {
    Get: "/api/health",
  },
  Auth: {
    Register: "/api/auth/register",
    VerifyEmail: "/api/auth/verify-email",
    Login: "/api/auth/login",
    Logout: "/api/auth/logout",
    Me: "/api/auth/me",
  },
  Channels: {
    List: "/api/channels",
    Detail: (slug) => `/api/channels/${slug}`,
    CreateSession: (slug) => `/api/channels/${slug}/sessions`,
    ActiveSession: (slug) => `/api/channels/${slug}/sessions/active`,
    AbandonActiveSessions: (slug) => `/api/channels/${slug}/sessions/abandon-active`,
    EnqueueSelf: (slug) => `/api/channels/${slug}/queue`,
    QueueList: (slug) => `/api/channels/${slug}/queue`,
    QueueMe: (slug) => `/api/channels/${slug}/queue/me`,
    QueueLeave: (slug) => `/api/channels/${slug}/queue/leave`,
    QueueKick: (slug, entryId) => `/api/channels/${slug}/queue/${entryId}`,
    QueueOffer: (slug, sessionId, entryId) =>
      `/api/channels/${slug}/sessions/${sessionId}/offer/${entryId}`,
    QueueAccept: (slug) => `/api/channels/${slug}/queue/accept`,
  },
  Sessions: {
    List: "/api/sessions",
    Detail: (id) => `/api/sessions/${id}`,
    Join: (id) => `/api/sessions/${id}/join`,
    Start: (id) => `/api/sessions/${id}/start`,
    Abandon: (id) => `/api/sessions/${id}/abandon`,
    Actions: (id) => `/api/sessions/${id}/actions`,
  },
};
