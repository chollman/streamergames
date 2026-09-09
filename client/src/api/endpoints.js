// Single source of truth for HTTP paths. Constitution §5.
// Never inline path strings in components — always reference API.x.Y here.
export const API = {
  Health: {
    Get: "/api/health",
  },
  Auth: {
    Register: "/api/auth/register",
    Login: "/api/auth/login",
    Logout: "/api/auth/logout",
    Me: "/api/auth/me",
  },
  Channels: {
    List: "/api/channels",
    Detail: (slug) => `/api/channels/${slug}`,
  },
  Sessions: {
    List: "/api/sessions",
    Detail: (id) => `/api/sessions/${id}`,
    Action: (id) => `/api/sessions/${id}/actions`,
  },
  SeatQueue: {
    List: (channelSlug) => `/api/channels/${channelSlug}/seat-queue`,
    Join: (channelSlug) => `/api/channels/${channelSlug}/seat-queue`,
  },
};
