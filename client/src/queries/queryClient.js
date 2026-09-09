import { QueryClient } from "@tanstack/react-query";

// Constitution §8: TanStack Query is the single data-fetching/caching library.
// Session live state is NOT here — it lives in the sessionSlice fed by Socket.IO.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
