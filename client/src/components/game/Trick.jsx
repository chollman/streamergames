import { useTranslation } from "react-i18next";
import Card from "./Card";
import { toCard } from "./Hand";

// Renders the current trick: an ordered list of who played what, with the
// led suit highlighted. `players` is the array from the view (each has id +
// nickname). `plays` is [{ playerId, cardId }, ...]. `leaderId` and
// `ledSuit` come straight from view.trick.
export default function Trick({ trick, players }) {
  const { t } = useTranslation("game");
  if (!trick) return null;
  const { plays = [], ledSuit, leaderId } = trick;
  if (plays.length === 0) {
    return (
      <div className="trick trick--empty">
        <p>{t("trick_waiting_for_lead")}</p>
      </div>
    );
  }
  return (
    <div className={`trick${ledSuit ? " trick--" + ledSuit : ""}`}>
      <header className="trick__header">
        <span>{t("trick_led_suit_label")}</span>
        <span className="trick__suit-badge">
          {ledSuit === "rocket" ? "🚀 " : ""}
          {t("suit_" + ledSuit)}
        </span>
      </header>
      <ol className="trick__plays">
        {plays.map((p) => {
          const player = players.find((x) => x.id === p.playerId);
          const card = toCard(p.cardId);
          return (
            <li key={p.playerId} className={p.playerId === leaderId ? "is-leader" : ""}>
              <div className="trick__nickname">
                {player ? player.nickname : p.playerId}
                {p.playerId === leaderId ? <small>&nbsp;· {t("trick_leader")}</small> : null}
              </div>
              <Card card={card} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
