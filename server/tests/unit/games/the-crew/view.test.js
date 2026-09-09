const game = require("../../../../services/games/the-crew");

// This is the single most critical test class in the whole codebase: viewFor
// must never leak a player's private hand to another player or to a spectator.
// If it did, the game breaks the moment someone sees another's hand.

function baseState() {
  return {
    phase: "trick",
    players: [
      { id: "s", nickname: "Streamer", playerType: "physical", order: 0, hand: ["pink-1", "pink-2"], commTokenUsed: false, commCard: null },
      { id: "d1", nickname: "D1", playerType: "digital", order: 1, hand: ["yellow-1", "yellow-2", "rocket-4"], commTokenUsed: true, commCard: { cardId: "yellow-2", position: "highest" } },
      { id: "d2", nickname: "D2", playerType: "digital", order: 2, hand: ["blue-1", "green-9"], commTokenUsed: false, commCard: null },
    ],
    commanderId: "d1",
    reservedByStreamer: ["pink-1", "pink-2"],
    trick: { leaderId: "d1", ledSuit: null, plays: [] },
    tricks: [],
    currentTurnId: "d1",
    seed: 1,
  };
}

describe("The Crew — viewFor privacy", () => {
  it("streamer sees full hands of everyone", () => {
    const view = game.viewFor(baseState(), "s", "streamer");
    expect(view.players.find((p) => p.id === "s").hand).toEqual(["pink-1", "pink-2"]);
    expect(view.players.find((p) => p.id === "d1").hand).toEqual(["yellow-1", "yellow-2", "rocket-4"]);
    expect(view.reservedByStreamer).toEqual(["pink-1", "pink-2"]);
  });

  it("digital player sees only their own hand; other players have handSize only", () => {
    const view = game.viewFor(baseState(), "d1", "digital");
    expect(view.myHand).toEqual(["yellow-1", "yellow-2", "rocket-4"]);
    for (const p of view.players) {
      expect(p).not.toHaveProperty("hand");
      expect(p).toHaveProperty("handSize");
    }
    expect(view.players.find((p) => p.id === "d2").handSize).toBe(2);
  });

  it("spectator sees NO hands and no myHand", () => {
    const view = game.viewFor(baseState(), null, "spectator");
    expect(view).not.toHaveProperty("myHand");
    expect(view).not.toHaveProperty("reservedByStreamer");
    for (const p of view.players) {
      expect(p).not.toHaveProperty("hand");
      expect(p).toHaveProperty("handSize");
    }
  });

  it("communications are public in every view", () => {
    for (const role of ["streamer", "digital", "spectator"]) {
      const view = game.viewFor(baseState(), "d1", role);
      const d1 = view.players.find((p) => p.id === "d1");
      expect(d1.commTokenUsed).toBe(true);
      expect(d1.commCard).toEqual({ cardId: "yellow-2", position: "highest" });
    }
  });

  it("digital view does NOT contain reservedByStreamer", () => {
    const view = game.viewFor(baseState(), "d1", "digital");
    expect(view).not.toHaveProperty("reservedByStreamer");
  });

  it("digital view for a non-existent player returns empty myHand", () => {
    const view = game.viewFor(baseState(), "nope", "digital");
    expect(view.myHand).toEqual([]);
  });
});
