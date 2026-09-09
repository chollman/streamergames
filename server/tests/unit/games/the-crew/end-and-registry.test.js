const game = require("../../../../services/games/the-crew");
const registry = require("../../../../services/games/registry");

function baseState(overrides = {}) {
  return {
    phase: "trick",
    players: [
      { id: "s", nickname: "S", playerType: "physical", order: 0, hand: [], commTokenUsed: false, commCard: null },
      { id: "d", nickname: "D", playerType: "digital", order: 1, hand: [], commTokenUsed: false, commCard: null },
    ],
    commanderId: "s",
    reservedByStreamer: [],
    trick: { leaderId: null, ledSuit: null, plays: [] },
    tricks: [],
    currentTurnId: null,
    seed: 1,
    ...overrides,
  };
}

describe("The Crew — declare-end", () => {
  it("streamer can declare end at any active phase", () => {
    const t = baseState();
    expect(game.validateAction(t, "s", { type: "declare-end" }).ok).toBe(true);
    const r = baseState({ phase: "reserving" });
    expect(game.validateAction(r, "s", { type: "declare-end" }).ok).toBe(true);
  });

  it("digital player cannot declare end", () => {
    const t = baseState();
    const res = game.validateAction(t, "d", { type: "declare-end" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/only streamer/);
  });

  it("rejects declare-end when already finished", () => {
    const done = baseState({ phase: "finished" });
    const res = game.validateAction(done, "s", { type: "declare-end" });
    expect(res.ok).toBe(false);
  });

  it("apply declare-end sets phase to 'finished' and stores result", () => {
    let state = baseState();
    state = game.applyAction(state, { type: "declare-end", playerId: "s", result: "won" });
    expect(state.phase).toBe("finished");
    expect(state.result).toBe("won");
    expect(game.isFinished(state)).toBe(true);
  });
});

describe("The Crew — unknown / malformed actions", () => {
  it("rejects missing action.type", () => {
    const state = baseState();
    expect(game.validateAction(state, "s", null).ok).toBe(false);
    expect(game.validateAction(state, "s", {}).ok).toBe(false);
  });

  it("rejects unknown action type", () => {
    const state = baseState();
    const res = game.validateAction(state, "s", { type: "teleport" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown action/);
  });

  it("rejects action from a player id that doesn't exist", () => {
    const state = baseState();
    const res = game.validateAction(state, "nope", { type: "play-card", cardId: "pink-1" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not in session/);
  });
});

describe("The Crew — game module contract", () => {
  it("exposes the required interface", () => {
    for (const key of ["id", "minPlayers", "maxPlayers", "setup", "validateAction", "applyAction", "viewFor", "nextActor", "isFinished"]) {
      expect(game).toHaveProperty(key);
    }
  });

  it("nextActor returns state.currentTurnId", () => {
    const state = baseState({ currentTurnId: "d" });
    expect(game.nextActor(state)).toBe("d");
  });
});

describe("Games registry", () => {
  it("registers the-crew", () => {
    expect(registry.games["the-crew"]).toBe(game);
    expect(registry.getGame("the-crew")).toBe(game);
  });

  it("throws for unknown game id", () => {
    expect(() => registry.getGame("nope")).toThrow(/Unknown game/);
  });
});
