// Visual card for The Crew. Renders `<suit>-<rank>` (e.g. "pink-6", "rocket-4")
// using the suit color tokens from index.css. Three variants:
//   - face  (default): shows suit color + rank, clickable if onClick given
//   - back:            face-down (dorso) — for other players' hidden hands
//   - communicated:    face + a communication token badge overlay
//
// The suit color comes from --card-<suit> CSS tokens so light/dark theme
// tokens can override centrally. Never hardcode colors here.

const SUIT_LABEL_ES = {
  pink: "Rosa",
  yellow: "Amarillo",
  green: "Verde",
  blue: "Azul",
  rocket: "Cohete",
};

export default function Card({
  card,
  variant = "face",
  selected = false,
  disabled = false,
  onClick,
  ariaLabel,
}) {
  if (variant === "back") {
    return <div className="game-card game-card--back" aria-hidden="true" />;
  }
  if (!card) return null;

  const classes = [
    "game-card",
    `game-card--${card.suit}`,
    selected && "game-card--selected",
    disabled && "game-card--disabled",
    variant === "communicated" && "game-card--communicated",
    onClick && !disabled && "game-card--clickable",
  ]
    .filter(Boolean)
    .join(" ");

  const label =
    ariaLabel ||
    `${SUIT_LABEL_ES[card.suit] || card.suit} ${card.rank}`;

  const Tag = onClick ? "button" : "div";
  const tagProps = onClick
    ? {
        type: "button",
        onClick: () => !disabled && onClick(card),
        disabled: !!disabled,
        "aria-pressed": selected ? "true" : undefined,
      }
    : { role: "img" };

  return (
    <Tag className={classes} aria-label={label} {...tagProps}>
      <span className="game-card__rank">{card.rank}</span>
      <span className="game-card__suit">
        {card.suit === "rocket" ? "🚀" : ""}
      </span>
    </Tag>
  );
}
