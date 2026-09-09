const { CARDS, CARD_BY_ID, cardOf } = require("./cards");

// Fisher-Yates. Injected `rng` (Math.random by default) lets tests seed for
// determinism if we ever want reproducible shuffles.
function shuffle(array, rng = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deterministic hand-size per player: floor(40/N) plus one extra for the
// first (40 mod N) seats. Every 40-mod-N players get a bigger hand; the
// remaining N minus that get the base size.
function expectedHandSize(playerCount, order) {
  const base = Math.floor(CARDS.length / playerCount);
  const extra = order < CARDS.length % playerCount ? 1 : 0;
  return base + extra;
}

// Which player id has the trump-4 (rocket-4) card? That's the commander.
function findCommander(players) {
  for (const p of players) if (p.hand.includes("rocket-4")) return p.id;
  return null;
}

// Given a completed trick's plays and its led suit, return the winner playerId.
// Rocket beats any non-rocket; highest rocket wins; else highest of led suit.
function trickWinner(plays, ledSuit) {
  if (!plays.length) throw new Error("trickWinner: empty plays");
  const rocketPlays = plays.filter((p) => cardOf(p.cardId).suit === "rocket");
  if (rocketPlays.length > 0) {
    return rocketPlays.reduce((best, p) =>
      cardOf(p.cardId).rank > cardOf(best.cardId).rank ? p : best
    ).playerId;
  }
  const ledPlays = plays.filter((p) => cardOf(p.cardId).suit === ledSuit);
  // Leader always plays first and establishes ledSuit, so ledPlays is never
  // empty in a legal game — but defend anyway.
  const pool = ledPlays.length > 0 ? ledPlays : plays;
  return pool.reduce((best, p) =>
    cardOf(p.cardId).rank > cardOf(best.cardId).rank ? p : best
  ).playerId;
}

// ---------------- Module interface (Constitution §9) ----------------

const GAME = {
  id: "the-crew",
  minPlayers: 3,
  maxPlayers: 5,

  // `players`: [{ id, nickname, playerType: 'physical'|'digital' }]
  // Order in the array is the seating order (0..N-1).
  setup(config, players) {
    if (players.length < GAME.minPlayers || players.length > GAME.maxPlayers) {
      throw new Error(
        `The Crew supports ${GAME.minPlayers}-${GAME.maxPlayers} players, got ${players.length}`
      );
    }

    return {
      phase: "reserving",
      players: players.map((p, i) => ({
        id: p.id,
        nickname: p.nickname,
        playerType: p.playerType,
        order: i,
        hand: [],
        commTokenUsed: false,
        commCard: null,
      })),
      commanderId: null,
      reservedByStreamer: [],
      trick: { leaderId: null, ledSuit: null, plays: [] },
      tricks: [],
      currentTurnId: null,
      seed: (config && config.seed) || Date.now(),
    };
  },

  validateAction(state, playerId, action) {
    if (!action || !action.type) return { ok: false, error: "action.type required" };
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: "player not in session" };

    switch (action.type) {
      case "reserve-hand": {
        if (state.phase !== "reserving") return { ok: false, error: "phase not reserving" };
        if (player.playerType !== "physical") {
          return { ok: false, error: "only physical players reserve" };
        }
        if (!Array.isArray(action.cardIds)) {
          return { ok: false, error: "cardIds must be an array" };
        }
        for (const id of action.cardIds) {
          if (!CARD_BY_ID.has(id)) return { ok: false, error: `unknown card: ${id}` };
        }
        if (new Set(action.cardIds).size !== action.cardIds.length) {
          return { ok: false, error: "duplicate cards" };
        }
        const expected = expectedHandSize(state.players.length, player.order);
        if (action.cardIds.length !== expected) {
          return { ok: false, error: `must reserve exactly ${expected} cards` };
        }
        return { ok: true };
      }

      case "deal": {
        if (state.phase !== "reserving") return { ok: false, error: "phase not reserving" };
        const physical = state.players.find((p) => p.playerType === "physical");
        if (physical && state.reservedByStreamer.length === 0) {
          return { ok: false, error: "physical player must reserve first" };
        }
        if (physical && playerId !== physical.id) {
          return { ok: false, error: "only the physical player triggers deal" };
        }
        return { ok: true };
      }

      case "play-card": {
        if (state.phase !== "trick") return { ok: false, error: "phase not trick" };
        if (state.currentTurnId !== playerId) return { ok: false, error: "not your turn" };
        if (!player.hand.includes(action.cardId)) {
          return { ok: false, error: "card not in hand" };
        }
        const card = cardOf(action.cardId);
        const led = state.trick.ledSuit;

        if (!led) {
          // Leader constraint: cannot lead with rocket unless the entire hand
          // is rockets (standard The Crew rule).
          if (card.suit === "rocket") {
            const nonRockets = player.hand.filter((id) => cardOf(id).suit !== "rocket");
            if (nonRockets.length > 0) {
              return { ok: false, error: "cannot lead with rocket unless hand is all rockets" };
            }
          }
          return { ok: true };
        }

        // Follower: must follow suit if possible.
        const hasLed = player.hand.some((id) => cardOf(id).suit === led);
        if (hasLed && card.suit !== led) {
          return { ok: false, error: "must follow suit" };
        }
        return { ok: true };
      }

      case "communicate": {
        if (state.phase !== "trick") return { ok: false, error: "phase not trick" };
        if (player.commTokenUsed) return { ok: false, error: "token already used" };
        if (!player.hand.includes(action.cardId)) {
          return { ok: false, error: "card not in hand" };
        }
        const card = cardOf(action.cardId);
        if (card.suit === "rocket") return { ok: false, error: "cannot communicate rocket" };

        const sameSuit = player.hand.filter((id) => cardOf(id).suit === card.suit);
        const ranks = sameSuit.map((id) => cardOf(id).rank);
        switch (action.position) {
          case "highest":
            if (Math.max(...ranks) !== card.rank) return { ok: false, error: "not the highest" };
            return { ok: true };
          case "lowest":
            if (Math.min(...ranks) !== card.rank) return { ok: false, error: "not the lowest" };
            return { ok: true };
          case "only":
            if (sameSuit.length !== 1) return { ok: false, error: "not the only" };
            return { ok: true };
          default:
            return { ok: false, error: `unknown position: ${action.position}` };
        }
      }

      case "confirm-trick": {
        if (state.phase !== "trick") return { ok: false, error: "phase not trick" };
        if (state.trick.plays.length !== state.players.length) {
          return { ok: false, error: "trick not complete" };
        }
        return { ok: true };
      }

      case "declare-end": {
        if (state.phase !== "trick" && state.phase !== "reserving") {
          return { ok: false, error: "game already finished" };
        }
        if (player.playerType !== "physical") {
          return { ok: false, error: "only streamer can end" };
        }
        return { ok: true };
      }

      default:
        return { ok: false, error: `unknown action: ${action.type}` };
    }
  },

  applyAction(state, action) {
    const { playerId } = action;
    switch (action.type) {
      case "reserve-hand":
        return {
          ...state,
          reservedByStreamer: [...action.cardIds],
          players: state.players.map((p) =>
            p.id === playerId ? { ...p, hand: [...action.cardIds] } : p
          ),
        };

      case "deal": {
        const reserved = new Set(state.reservedByStreamer);
        const remaining = CARDS.map((c) => c.id).filter((id) => !reserved.has(id));
        const shuffled = shuffle(remaining);
        const digitals = state.players.filter((p) => p.playerType === "digital");
        // Sort digitals by seating order so hand sizes are stable and
        // reproducible with the same seed.
        digitals.sort((a, b) => a.order - b.order);

        const handByPid = new Map();
        let idx = 0;
        for (const dp of digitals) {
          const size = expectedHandSize(state.players.length, dp.order);
          handByPid.set(dp.id, shuffled.slice(idx, idx + size));
          idx += size;
        }

        const players = state.players.map((p) =>
          p.playerType === "digital"
            ? { ...p, hand: handByPid.get(p.id) || [] }
            : p
        );

        const commanderId = findCommander(players);
        return {
          ...state,
          phase: "trick",
          players,
          commanderId,
          currentTurnId: commanderId,
          trick: { leaderId: commanderId, ledSuit: null, plays: [] },
        };
      }

      case "play-card": {
        const card = cardOf(action.cardId);
        const isLeader = state.trick.plays.length === 0;
        const newTrick = {
          leaderId: isLeader ? playerId : state.trick.leaderId,
          ledSuit: isLeader ? card.suit : state.trick.ledSuit,
          plays: [...state.trick.plays, { playerId, cardId: action.cardId }],
        };
        const players = state.players.map((p) =>
          p.id === playerId
            ? { ...p, hand: p.hand.filter((id) => id !== action.cardId) }
            : p
        );
        const trickComplete = newTrick.plays.length === state.players.length;
        const currentPlayer = state.players.find((p) => p.id === playerId);
        const nextOrder = (currentPlayer.order + 1) % state.players.length;
        const nextPlayer = state.players.find((p) => p.order === nextOrder);
        return {
          ...state,
          players,
          trick: newTrick,
          currentTurnId: trickComplete ? null : nextPlayer.id,
        };
      }

      case "communicate":
        return {
          ...state,
          players: state.players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  commTokenUsed: true,
                  commCard: { cardId: action.cardId, position: action.position },
                }
              : p
          ),
        };

      case "confirm-trick": {
        const winnerId = trickWinner(state.trick.plays, state.trick.ledSuit);
        return {
          ...state,
          tricks: [...state.tricks, { ...state.trick, winnerId }],
          trick: { leaderId: winnerId, ledSuit: null, plays: [] },
          currentTurnId: winnerId,
        };
      }

      case "declare-end":
        return { ...state, phase: "finished", result: action.result || null };

      default:
        return state;
    }
  },

  viewFor(state, viewerId, role) {
    const publicPlayers = state.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      playerType: p.playerType,
      order: p.order,
      handSize: p.hand.length,
      commTokenUsed: p.commTokenUsed,
      commCard: p.commCard, // communications are public in The Crew
    }));

    const publicView = {
      phase: state.phase,
      players: publicPlayers,
      commanderId: state.commanderId,
      trick: state.trick,
      tricks: state.tricks,
      currentTurnId: state.currentTurnId,
    };

    if (role === "streamer") {
      return {
        ...publicView,
        players: state.players, // full hands
        reservedByStreamer: state.reservedByStreamer,
      };
    }

    if (role === "digital") {
      const me = state.players.find((p) => p.id === viewerId);
      return {
        ...publicView,
        myHand: me ? [...me.hand] : [],
        myPlayerId: viewerId,
      };
    }

    return publicView; // spectator
  },

  nextActor(state) {
    return state.currentTurnId;
  },

  isFinished(state) {
    return state.phase === "finished";
  },
};

// Expose internals for tests only. Not part of the public interface.
GAME._internals = { shuffle, expectedHandSize, findCommander, trickWinner };

module.exports = GAME;
