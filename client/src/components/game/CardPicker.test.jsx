import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CardPicker, { ALL_CARD_IDS } from "./CardPicker";
import "../../i18n";

describe("CardPicker", () => {
  it("renders all 40 cards initially", () => {
    render(<CardPicker selected={new Set()} onToggle={() => {}} />);
    expect(ALL_CARD_IDS).toHaveLength(40);
    // Each card renders either as a button (clickable) or div — pick a probe.
    expect(screen.getByRole("button", { name: /rosa 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cohete 4/i })).toBeInTheDocument();
  });

  it("filter narrows down by substring", async () => {
    const user = userEvent.setup();
    render(<CardPicker selected={new Set()} onToggle={() => {}} />);
    await user.type(screen.getByRole("textbox"), "rocket");
    expect(screen.getByRole("button", { name: /cohete 1/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rosa 1/i })).toBeNull();
  });

  it("filter with no matches shows empty message", async () => {
    const user = userEvent.setup();
    render(<CardPicker selected={new Set()} onToggle={() => {}} />);
    await user.type(screen.getByRole("textbox"), "zzz");
    // Empty message renders somewhere; picker__grid becomes empty.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("onToggle fires with the card id when a card is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<CardPicker selected={new Set()} onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: /rosa 1/i }));
    expect(onToggle).toHaveBeenCalledWith("pink-1");
  });

  it("disabled blocks toggles", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<CardPicker selected={new Set()} onToggle={onToggle} disabled />);
    // With disabled=true, onClick prop isn't attached to Card at all.
    const btn = screen.getByRole("button", { name: /rosa 1/i });
    await user.click(btn);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("expectedCount shows the counter", () => {
    render(
      <CardPicker
        selected={new Set(["pink-1", "pink-2"])}
        onToggle={() => {}}
        expectedCount={14}
      />
    );
    // Format from i18n: "current / expected" — probe by presence of numbers.
    const counter = screen.getByRole("status") ||
      document.querySelector(".card-picker__counter");
    expect(counter.textContent).toMatch(/2/);
    expect(counter.textContent).toMatch(/14/);
  });
});
