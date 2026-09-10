import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Card from "./Card";

// Grid of all 40 The Crew cards with a text filter. Multi-select via
// `selected` (a Set of card ids) + `onToggle(id)`. The streamer uses this
// during the reserve-hand phase to pick their physical hand.
//
// `disabled` locks the whole grid (e.g. while submitting).

const ALL_CARD_IDS = [
  ...["pink", "yellow", "green", "blue"].flatMap((suit) =>
    Array.from({ length: 9 }, (_, i) => `${suit}-${i + 1}`)
  ),
  ...[1, 2, 3, 4].map((r) => `rocket-${r}`),
];

function toCard(id) {
  const [suit, rankStr] = id.split("-");
  return { id, suit, rank: parseInt(rankStr, 10) };
}

export default function CardPicker({
  selected,
  onToggle,
  disabled = false,
  expectedCount = null,
}) {
  const { t } = useTranslation("game");
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return ALL_CARD_IDS;
    return ALL_CARD_IDS.filter((id) => id.toLowerCase().includes(f));
  }, [filter]);

  return (
    <div className="card-picker">
      <div className="card-picker__toolbar">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("picker_filter_placeholder")}
          aria-label={t("picker_filter_label")}
          className="card-picker__filter"
        />
        {expectedCount != null ? (
          <div
            className="card-picker__counter"
            role="status"
            aria-live="polite"
          >
            {t("picker_counter", { current: selected.size, expected: expectedCount })}
          </div>
        ) : null}
      </div>
      <div className="card-picker__grid" role="grid">
        {filtered.map((id) => (
          <Card
            key={id}
            card={toCard(id)}
            selected={selected.has(id)}
            disabled={disabled}
            onClick={() => onToggle(id)}
          />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="card-picker__empty">{t("picker_no_matches")}</p>
      ) : null}
    </div>
  );
}

export { ALL_CARD_IDS };
