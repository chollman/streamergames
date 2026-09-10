import Card from "./Card";

// Renders an array of card ids as a row of Cards, sorted by suit then rank.
// Optional per-card interactivity via onCardClick (called with the full
// card object). `legalIds` if provided highlights which cards are playable
// right now — non-legal cards render disabled.

const SUIT_ORDER = ["pink", "yellow", "green", "blue", "rocket"];

function toCard(id) {
  const [suit, rankStr] = id.split("-");
  return { id, suit, rank: parseInt(rankStr, 10) };
}

function sortCards(ids) {
  return [...ids]
    .map(toCard)
    .sort((a, b) => {
      const s = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
      if (s !== 0) return s;
      return a.rank - b.rank;
    });
}

export default function Hand({
  cardIds = [],
  onCardClick,
  legalIds = null,
  selectedIds = new Set(),
  emptyLabel,
}) {
  if (cardIds.length === 0) {
    return <p className="hand-empty">{emptyLabel || ""}</p>;
  }
  const sorted = sortCards(cardIds);
  return (
    <div className="hand" role="list">
      {sorted.map((card) => {
        const legal = !legalIds || legalIds.has(card.id);
        return (
          <div role="listitem" key={card.id}>
            <Card
              card={card}
              onClick={onCardClick}
              disabled={!legal}
              selected={selectedIds.has(card.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

export { toCard, sortCards };
