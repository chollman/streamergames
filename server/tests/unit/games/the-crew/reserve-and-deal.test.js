const game = require("../../../../services/games/the-crew");
const { CARDS } = require("../../../../services/games/the-crew/cards");

function players4() {
  return [
    { id: "s", nickname: "Streamer", playerType: "physical" },
    { id: "d1", nickname: "D1", playerType: "digital" },
    { id: "d2", nickname: "D2", playerType: "digital" },
    { id: "d3", nickname: "D3", playerType: "digital" },
  ];
}

describe("The Crew — reserve-hand + deal", () => {
  it("validates reserve size (10 for 4 players)", () => {
    const state = game.setup({}, players4());
    const tenCards = CARDS.slice(0, 10).map((c) => c.id);
    const nine = tenCards.slice(0, 9);
    const eleven = CARDS.slice(0, 11).map((c) => c.id);
    expect(
      game.validateAction(state, "s", { type: "reserve-hand", cardIds: tenCards }).ok
    ).toBe(true);
    expect(
      game.validateAction(state, "s", { type: "reserve-hand", cardIds: nine }).ok
    ).toBe(false);
    expect(
      game.validateAction(state, "s", { type: "reserve-hand", cardIds: eleven }).ok
    ).toBe(false);
  });

  it("rejects duplicate cards in reserve", () => {
    const state = game.setup({}, players4());
    const dup = ["pink-1", "pink-1", ...CARDS.slice(2, 10).map((c) => c.id)];
    const res = game.validateAction(state, "s", { type: "reserve-hand", cardIds: dup });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/duplicate/);
  });

  it("rejects unknown card in reserve", () => {
    const state = game.setup({}, players4());
    const bad = ["purple-1", ...CARDS.slice(1, 10).map((c) => c.id)];
    const res = game.validateAction(state, "s", { type: "reserve-hand", cardIds: bad });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown card/);
  });

  it("rejects reserve from a digital player", () => {
    const state = game.setup({}, players4());
    const cards = CARDS.slice(0, 10).map((c) => c.id);
    const res = game.validateAction(state, "d1", { type: "reserve-hand", cardIds: cards });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/only physical/);
  });

  it("applying reserve-hand puts the cards in the streamer's hand", () => {
    let state = game.setup({}, players4());
    const cards = CARDS.slice(0, 10).map((c) => c.id);
    state = game.applyAction(state, { type: "reserve-hand", playerId: "s", cardIds: cards });
    expect(state.reservedByStreamer).toEqual(cards);
    expect(state.players.find((p) => p.id === "s").hand).toEqual(cards);
  });

  it("deal requires reserve first when a physical player exists", () => {
    const state = game.setup({}, players4());
    const res = game.validateAction(state, "s", { type: "deal" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/reserve first/);
  });

  it("deal rejects a digital player as trigger when a physical player exists", () => {
    let state = game.setup({}, players4());
    const cards = CARDS.slice(0, 10).map((c) => c.id);
    state = game.applyAction(state, { type: "reserve-hand", playerId: "s", cardIds: cards });
    const res = game.validateAction(state, "d1", { type: "deal" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/only the physical/);
  });

  it("after deal: each player has the expected hand size, phase='trick', commander set", () => {
    let state = game.setup({}, players4());
    const cards = CARDS.slice(0, 10).map((c) => c.id);
    state = game.applyAction(state, { type: "reserve-hand", playerId: "s", cardIds: cards });
    state = game.applyAction(state, { type: "deal", playerId: "s" });

    expect(state.phase).toBe("trick");
    for (const p of state.players) {
      expect(p.hand).toHaveLength(10);
    }
    // No card duplicated across hands
    const all = state.players.flatMap((p) => p.hand);
    expect(new Set(all).size).toBe(40);

    // Commander is whoever holds rocket-4
    const rocket4Holder = state.players.find((p) => p.hand.includes("rocket-4"));
    expect(state.commanderId).toBe(rocket4Holder.id);
    expect(state.currentTurnId).toBe(rocket4Holder.id);
  });

  it("deal + reserve together produce disjoint hands", () => {
    let state = game.setup({}, players4());
    const reserved = ["pink-1", "pink-2", "pink-3", "yellow-1", "yellow-2", "green-1", "green-2", "blue-1", "blue-2", "rocket-1"];
    state = game.applyAction(state, { type: "reserve-hand", playerId: "s", cardIds: reserved });
    state = game.applyAction(state, { type: "deal", playerId: "s" });
    const digitalHands = state.players.filter((p) => p.id !== "s").flatMap((p) => p.hand);
    const overlap = digitalHands.filter((id) => reserved.includes(id));
    expect(overlap).toEqual([]);
    expect(digitalHands).toHaveLength(30);
  });
});
