const game = require("../../../../services/games/the-crew");
const { trickWinner } = game._internals;

// Helper: skip the deal machinery and construct a mid-game state directly.
// This lets tests target play-card logic in isolation.
function midGameState(playerHands, opts = {}) {
  const playerIds = Object.keys(playerHands);
  return {
    phase: "trick",
    players: playerIds.map((id, i) => ({
      id,
      nickname: id,
      playerType: i === 0 ? "physical" : "digital",
      order: i,
      hand: [...playerHands[id]],
      commTokenUsed: false,
      commCard: null,
    })),
    commanderId: opts.commanderId || playerIds[0],
    reservedByStreamer: [],
    trick: opts.trick || { leaderId: playerIds[0], ledSuit: null, plays: [] },
    tricks: [],
    currentTurnId: opts.currentTurnId || playerIds[0],
    seed: 1,
  };
}

describe("The Crew — trickWinner", () => {
  it("highest rocket beats any non-rocket", () => {
    const plays = [
      { playerId: "a", cardId: "blue-9" },
      { playerId: "b", cardId: "rocket-1" },
      { playerId: "c", cardId: "blue-8" },
    ];
    expect(trickWinner(plays, "blue")).toBe("b");
  });

  it("highest rocket among several rockets wins", () => {
    const plays = [
      { playerId: "a", cardId: "rocket-2" },
      { playerId: "b", cardId: "rocket-4" },
      { playerId: "c", cardId: "rocket-1" },
    ];
    expect(trickWinner(plays, "rocket")).toBe("b");
  });

  it("highest led-suit wins when no rocket played", () => {
    const plays = [
      { playerId: "a", cardId: "pink-3" },
      { playerId: "b", cardId: "pink-7" },
      { playerId: "c", cardId: "yellow-9" },
    ];
    expect(trickWinner(plays, "pink")).toBe("b");
  });

  it("off-suit non-rocket cannot win", () => {
    const plays = [
      { playerId: "a", cardId: "pink-1" },
      { playerId: "b", cardId: "yellow-9" }, // discard, higher rank but wrong suit
    ];
    expect(trickWinner(plays, "pink")).toBe("a");
  });
});

describe("The Crew — play-card validation", () => {
  it("must follow suit if possible", () => {
    const state = midGameState({
      a: ["pink-1", "yellow-5"],
      b: ["pink-9", "yellow-8"],
    }, {
      trick: { leaderId: "a", ledSuit: "pink", plays: [{ playerId: "a", cardId: "pink-1" }] },
      currentTurnId: "b",
    });
    const bad = game.validateAction(state, "b", { type: "play-card", cardId: "yellow-8" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/follow suit/);
    const good = game.validateAction(state, "b", { type: "play-card", cardId: "pink-9" });
    expect(good.ok).toBe(true);
  });

  it("can play any card when void in led suit", () => {
    const state = midGameState({
      a: ["pink-1"],
      b: ["yellow-8", "rocket-2"],
    }, {
      trick: { leaderId: "a", ledSuit: "pink", plays: [{ playerId: "a", cardId: "pink-1" }] },
      currentTurnId: "b",
    });
    expect(game.validateAction(state, "b", { type: "play-card", cardId: "yellow-8" }).ok).toBe(true);
    expect(game.validateAction(state, "b", { type: "play-card", cardId: "rocket-2" }).ok).toBe(true);
  });

  it("leader cannot lead with rocket unless hand is all rockets", () => {
    const stateMixed = midGameState({ a: ["rocket-2", "pink-3"], b: ["blue-4"], c: ["yellow-5"] });
    expect(
      game.validateAction(stateMixed, "a", { type: "play-card", cardId: "rocket-2" }).ok
    ).toBe(false);

    const stateAllRockets = midGameState({
      a: ["rocket-2", "rocket-3"],
      b: ["blue-4"],
      c: ["yellow-5"],
    });
    expect(
      game.validateAction(stateAllRockets, "a", { type: "play-card", cardId: "rocket-2" }).ok
    ).toBe(true);
  });

  it("rejects play when it isn't your turn", () => {
    const state = midGameState({ a: ["pink-1"], b: ["blue-4"], c: ["yellow-5"] });
    const res = game.validateAction(state, "b", { type: "play-card", cardId: "blue-4" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not your turn/);
  });

  it("rejects a card not in hand", () => {
    const state = midGameState({ a: ["pink-1"], b: ["blue-4"], c: ["yellow-5"] });
    const res = game.validateAction(state, "a", { type: "play-card", cardId: "pink-2" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not in hand/);
  });
});

describe("The Crew — play-card apply", () => {
  it("removes card from hand and advances turn", () => {
    let state = midGameState({ a: ["pink-1", "pink-2"], b: ["blue-4"], c: ["yellow-5"] });
    state = game.applyAction(state, { type: "play-card", playerId: "a", cardId: "pink-1" });
    expect(state.players.find((p) => p.id === "a").hand).toEqual(["pink-2"]);
    expect(state.trick.ledSuit).toBe("pink");
    expect(state.trick.plays).toHaveLength(1);
    expect(state.currentTurnId).toBe("b");
  });

  it("closes the trick (currentTurnId=null) when everyone has played", () => {
    let state = midGameState({ a: ["pink-1"], b: ["pink-4"], c: ["pink-9"] });
    state = game.applyAction(state, { type: "play-card", playerId: "a", cardId: "pink-1" });
    state = game.applyAction(state, { type: "play-card", playerId: "b", cardId: "pink-4" });
    state = game.applyAction(state, { type: "play-card", playerId: "c", cardId: "pink-9" });
    expect(state.trick.plays).toHaveLength(3);
    expect(state.currentTurnId).toBeNull();
  });
});

describe("The Crew — confirm-trick", () => {
  it("archives the trick, sets winner as new leader and current turn", () => {
    let state = midGameState({ a: [], b: [], c: [] }, {
      trick: {
        leaderId: "a",
        ledSuit: "pink",
        plays: [
          { playerId: "a", cardId: "pink-1" },
          { playerId: "b", cardId: "pink-9" },
          { playerId: "c", cardId: "yellow-5" },
        ],
      },
    });
    const valid = game.validateAction(state, "a", { type: "confirm-trick" });
    expect(valid.ok).toBe(true);
    state = game.applyAction(state, { type: "confirm-trick", playerId: "a" });
    expect(state.tricks).toHaveLength(1);
    expect(state.tricks[0].winnerId).toBe("b");
    expect(state.trick).toEqual({ leaderId: "b", ledSuit: null, plays: [] });
    expect(state.currentTurnId).toBe("b");
  });

  it("rejects confirm-trick if the trick isn't complete", () => {
    const state = midGameState({ a: [], b: [] }, {
      trick: { leaderId: "a", ledSuit: "pink", plays: [{ playerId: "a", cardId: "pink-1" }] },
    });
    const res = game.validateAction(state, "a", { type: "confirm-trick" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not complete/);
  });
});
