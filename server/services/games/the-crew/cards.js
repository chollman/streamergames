// The Crew — 40 cards.
//
// Non-trump suits (36 cards):
//   pink, yellow, green, blue    x    ranks 1..9
//
// Trump (4 cards):
//   rocket-1, rocket-2, rocket-3, rocket-4
//
// Card id format is stable: `<suit>-<rank>`. Never identify a card by index
// in a hand — always by id (Constitution §9).

const SUITS = ["pink", "yellow", "green", "blue"];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TRUMP_RANKS = [1, 2, 3, 4];

const CARDS = [
  ...SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${suit}-${rank}`, suit, rank }))
  ),
  ...TRUMP_RANKS.map((rank) => ({
    id: `rocket-${rank}`,
    suit: "rocket",
    rank,
  })),
];

const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

function cardOf(id) {
  const c = CARD_BY_ID.get(id);
  if (!c) throw new Error(`Unknown card id: ${id}`);
  return c;
}

module.exports = { CARDS, CARD_BY_ID, cardOf, SUITS, RANKS, TRUMP_RANKS };
