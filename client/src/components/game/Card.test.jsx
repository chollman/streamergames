import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Card from "./Card";

describe("Card", () => {
  it("renders rank + accessible label from card", () => {
    render(<Card card={{ id: "pink-6", suit: "pink", rank: 6 }} />);
    expect(screen.getByRole("img", { name: /rosa 6/i })).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("back variant renders a hidden dorso", () => {
    const { container } = render(<Card variant="back" />);
    expect(container.querySelector(".game-card--back")).toBeTruthy();
  });

  it("clickable when onClick is provided", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Card card={{ id: "blue-3", suit: "blue", rank: 3 }} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: /azul 3/i }));
    expect(onClick).toHaveBeenCalledWith({ id: "blue-3", suit: "blue", rank: 3 });
  });

  it("disabled prevents onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Card card={{ id: "blue-3", suit: "blue", rank: 3 }} onClick={onClick} disabled />
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("selected sets aria-pressed=true on the button", () => {
    render(
      <Card card={{ id: "yellow-1", suit: "yellow", rank: 1 }} onClick={() => {}} selected />
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("rocket variant shows the emoji", () => {
    render(<Card card={{ id: "rocket-4", suit: "rocket", rank: 4 }} />);
    expect(screen.getByText("🚀")).toBeInTheDocument();
  });
});
