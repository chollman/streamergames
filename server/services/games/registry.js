// Registry of game modules. Add a new game by:
//   1. Creating server/services/games/<game-id>/{cards,rules,index}.js
//   2. Requiring it here and mapping by its id.
// Constitution §9.
const theCrew = require("./the-crew");

const games = {
  [theCrew.id]: theCrew,
};

function getGame(id) {
  const game = games[id];
  if (!game) throw new Error(`Unknown game id: ${id}`);
  return game;
}

module.exports = { games, getGame };
