const game = require("../../../../services/games/the-crew");

function makePlayers(n, physicalIndex = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `Player${i}`,
    playerType: i === physicalIndex ? "physical" : "digital",
  }));
}

describe("The Crew — setup", () => {
  it("throws for fewer than minPlayers", () => {
    expect(() => game.setup({}, makePlayers(2))).toThrow(/3-5 players/);
  });

  it("throws for more than maxPlayers", () => {
    expect(() => game.setup({}, makePlayers(6))).toThrow(/3-5 players/);
  });

  it.each([3, 4, 5])("accepts %i players", (n) => {
    const state = game.setup({}, makePlayers(n));
    expect(state.players).toHaveLength(n);
    expect(state.phase).toBe("reserving");
  });

  it("assigns seating order matching array index", () => {
    const state = game.setup({}, makePlayers(4));
    expect(state.players.map((p) => p.order)).toEqual([0, 1, 2, 3]);
  });

  it("starts with no hands, no commander, no trick", () => {
    const state = game.setup({}, makePlayers(4));
    expect(state.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(state.commanderId).toBeNull();
    expect(state.trick).toEqual({ leaderId: null, ledSuit: null, plays: [] });
    expect(state.tricks).toEqual([]);
    expect(state.reservedByStreamer).toEqual([]);
  });

  it("carries seed from config when provided", () => {
    const state = game.setup({ seed: 42 }, makePlayers(3));
    expect(state.seed).toBe(42);
  });
});

describe("The Crew — expectedHandSize", () => {
  const { expectedHandSize } = game._internals;

  it.each([
    [3, 0, 14],
    [3, 1, 13],
    [3, 2, 13],
    [4, 0, 10],
    [4, 3, 10],
    [5, 0, 8],
    [5, 4, 8],
  ])("expectedHandSize(%i,%i) = %i", (n, order, expected) => {
    expect(expectedHandSize(n, order)).toBe(expected);
  });

  it("sum equals 40 across all seats", () => {
    for (const n of [3, 4, 5]) {
      const total = Array.from({ length: n }, (_, i) => expectedHandSize(n, i)).reduce(
        (a, b) => a + b,
        0
      );
      expect(total).toBe(40);
    }
  });
});
