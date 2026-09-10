import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { store } from "../../store/store";
import "../../i18n";

// Test wrapper mirroring the provider tree in main.jsx, minus BrowserRouter
// (uses MemoryRouter instead so tests don't touch window.location). Accepts
// initialEntries so a test can jump straight to a specific route.
export function makeWrapper({ initialEntries = ["/"] } = {}) {
  return function Wrapper({ children }) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    return (
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        </QueryClientProvider>
      </Provider>
    );
  };
}

// Default wrapper: starts at "/". Preserved as a plain component export so
// existing tests keep working without changes.
export const AllProviders = makeWrapper();
