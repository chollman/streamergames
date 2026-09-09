import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { store } from "../../store/store";
import "../../i18n";

// Test wrapper mirroring the provider tree in main.jsx, minus BrowserRouter
// (uses MemoryRouter instead so tests don't touch window.location).
export function AllProviders({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}
