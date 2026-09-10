import { useTranslation } from "react-i18next";

// A compact list of completed tricks — just who won each, with count. The
// full-visual replay is out of scope for MVP; this is enough for context.
export default function TricksHistory({ tricks = [], players = [] }) {
  const { t } = useTranslation("game");
  if (tricks.length === 0) {
    return <p className="tricks-history__empty">{t("tricks_history_empty")}</p>;
  }
  return (
    <ol className="tricks-history">
      {tricks.map((tk, idx) => {
        const winner = players.find((p) => p.id === tk.winnerId);
        return (
          <li key={idx}>
            <strong>{t("trick_n", { n: idx + 1 })}:</strong>{" "}
            {winner ? winner.nickname : tk.winnerId}
          </li>
        );
      })}
    </ol>
  );
}
