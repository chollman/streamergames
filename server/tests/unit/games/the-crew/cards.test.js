const { CARDS, CARD_BY_ID, cardOf } = require("../../../../services/games/the-crew/cards");

describe("The Crew — cards catalog", () => {
  it("has exactly 40 cards", () => {
    expect(CARDS).toHaveLength(40);
  });

  it("has 9 cards each in pink, yellow, green, blue", () => {
    for (const suit of ["pink", "yellow", "green", "blue"]) {
      expect(CARDS.filter((c) => c.suit === suit)).toHaveLength(9);
    }
  });

  it("has 4 rocket cards ranked 1..4", () => {
    const rockets = CARDS.filter((c) => c.suit === "rocket");
    expect(rockets).toHaveLength(4);
    expect(rockets.map((c) => c.rank).sort()).toEqual([1, 2, 3, 4]);
  });

  it("has unique ids across all cards", () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(40);
  });

  it("id format is <suit>-<rank>", () => {
    expect(CARDS.every((c) => c.id === `${c.suit}-${c.rank}`)).toBe(true);
  });

  it("CARD_BY_ID resolves every id", () => {
    for (const c of CARDS) {
      expect(CARD_BY_ID.get(c.id)).toBe(c);
    }
  });

  it("cardOf throws on unknown id", () => {
    expect(() => cardOf("purple-3")).toThrow(/Unknown card/);
  });
});
