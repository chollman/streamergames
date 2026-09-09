const game = require("../../../../services/games/the-crew");

function s(hand) {
  return {
    phase: "trick",
    players: [
      {
        id: "p",
        nickname: "P",
        playerType: "digital",
        order: 0,
        hand,
        commTokenUsed: false,
        commCard: null,
      },
    ],
    commanderId: "p",
    reservedByStreamer: [],
    trick: { leaderId: "p", ledSuit: null, plays: [] },
    tricks: [],
    currentTurnId: "p",
    seed: 1,
  };
}

describe("The Crew — communicate", () => {
  it("accepts a valid 'highest' communication", () => {
    const state = s(["pink-3", "pink-7", "yellow-1"]);
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "pink-7",
      position: "highest",
    });
    expect(res.ok).toBe(true);
  });

  it("rejects 'highest' when the card isn't the highest of its suit", () => {
    const state = s(["pink-3", "pink-7", "yellow-1"]);
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "pink-3",
      position: "highest",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not the highest/);
  });

  it("accepts a valid 'lowest' communication", () => {
    const state = s(["pink-3", "pink-7", "yellow-1"]);
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "pink-3",
      position: "lowest",
    });
    expect(res.ok).toBe(true);
  });

  it("accepts 'only' when the card is singleton in its suit", () => {
    const state = s(["pink-3", "yellow-1", "blue-9"]);
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "yellow-1",
      position: "only",
    });
    expect(res.ok).toBe(true);
  });

  it("rejects 'only' when the player has more than one of that suit", () => {
    const state = s(["pink-3", "pink-7"]);
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "pink-3",
      position: "only",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not the only/);
  });

  it("rejects communicating a rocket at any position", () => {
    const state = s(["rocket-1"]);
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "rocket-1",
      position: "only",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/cannot communicate rocket/);
  });

  it("rejects unknown position", () => {
    const state = s(["pink-1"]);
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "pink-1",
      position: "middle",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown position/);
  });

  it("applying communicate sets commTokenUsed and commCard on the player", () => {
    let state = s(["pink-3", "yellow-1"]);
    state = game.applyAction(state, {
      type: "communicate",
      playerId: "p",
      cardId: "pink-3",
      position: "only",
    });
    const player = state.players[0];
    expect(player.commTokenUsed).toBe(true);
    expect(player.commCard).toEqual({ cardId: "pink-3", position: "only" });
  });

  it("rejects second communicate after token used", () => {
    let state = s(["pink-3", "yellow-1"]);
    state = game.applyAction(state, {
      type: "communicate",
      playerId: "p",
      cardId: "pink-3",
      position: "only",
    });
    const res = game.validateAction(state, "p", {
      type: "communicate",
      cardId: "yellow-1",
      position: "only",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/token already used/);
  });
});
