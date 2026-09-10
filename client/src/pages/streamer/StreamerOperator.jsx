import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import LobbyPanel from "./LobbyPanel";
import ReservePanel from "./ReservePanel";
import PlayPanel from "./PlayPanel";
import FinishedPanel from "./FinishedPanel";

// The streamer's in-session panel. Picks the sub-panel by game phase:
//   lobby      → LobbyPanel (invite guests, start)
//   reserving  → ReservePanel (card picker + deal)
//   trick      → PlayPanel (streamer's hand + current trick)
//   finished   → FinishedPanel (declare + new session)
//
// The socket keeps `session.view` fresh; each panel is a pure render.
export default function StreamerOperator({ session }) {
  const { t } = useTranslation();
  const channel = useSelector((s) => s.auth.channel);
  const view = session.view || {};
  const phase = view.phase || "lobby";

  return (
    <main className="operator-page">
      <header className="operator-header">
        <h1>
          {t("common:session_operator")}
          {channel ? <small>&nbsp;· {channel.slug}</small> : null}
        </h1>
        <ConnectionBadge connected={session.connected} />
      </header>

      {phase === "lobby" ? <LobbyPanel session={session} /> : null}
      {phase === "reserving" ? <ReservePanel session={session} /> : null}
      {phase === "trick" ? <PlayPanel session={session} /> : null}
      {phase === "finished" ? <FinishedPanel session={session} /> : null}
    </main>
  );
}

function ConnectionBadge({ connected }) {
  const { t } = useTranslation();
  return (
    <span
      className={`conn-badge ${connected ? "conn-badge--on" : "conn-badge--off"}`}
      aria-live="polite"
    >
      {connected ? t("common:connected") : t("common:disconnected")}
    </span>
  );
}
