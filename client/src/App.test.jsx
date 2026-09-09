import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllProviders } from "./test/wrappers/AllProviders";
import App from "./App";

describe("App", () => {
  it("renders the app name from i18n", () => {
    render(<App />, { wrapper: AllProviders });
    expect(screen.getByRole("heading", { name: "StreamerGames" })).toBeInTheDocument();
  });

  it("renders the coming-soon copy from i18n", () => {
    render(<App />, { wrapper: AllProviders });
    expect(screen.getByText("Muy pronto.")).toBeInTheDocument();
  });
});
