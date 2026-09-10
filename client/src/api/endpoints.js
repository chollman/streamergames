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
  },
  Sessions: {
    List: "/api/sessions",
    Detail: (id) => `/api/sessions/${id}`,
    Join: (id) => `/api/sessions/${id}/join`,
    Start: (id) => `/api/sessions/${id}/start`,
    Actions: (id) => `/api/sessions/${id}/actions`,
  },
};
