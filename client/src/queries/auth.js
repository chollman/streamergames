import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { store } from "../store/store";
import { setAuth, clearAuth } from "../store/slices/authSlice";
import { api } from "../api/axios";
import { API } from "../api/endpoints";

export const authKeys = {
  me: ["auth", "me"],
};

export async function register({ email, password, displayName }) {
  const res = await api.post(API.Auth.Register, { email, password, displayName });
  return res.data;
}

export async function verifyEmail({ email, code }) {
  const res = await api.post(API.Auth.VerifyEmail, { email, code });
  const { user, token, channel } = res.data;
  store.dispatch(setAuth({ user, token, channel }));
  return res.data;
}

export async function login({ email, password }) {
  const res = await api.post(API.Auth.Login, { email, password });
  const { user, token, channel } = res.data;
  store.dispatch(setAuth({ user, token, channel }));
  return res.data;
}

export function logout() {
  store.dispatch(clearAuth());
}

// Reactive: enabled only while a token exists in Redux. Reruns on token change.
export function useMe() {
  const token = useSelector((s) => s.auth.token);
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async () => {
      const res = await api.get(API.Auth.Me);
      return res.data;
    },
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });
}
