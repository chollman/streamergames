import { useTranslation } from "react-i18next";
import Trick from "../components/game/Trick";
import TricksHistory from "../components/game/TricksHistory";

// Read-only public view of a session. Anonymous / non-seated viewers land
// here. No private state, no controls. Enough to follow along if they can't
// or don't want to join.
export default function SpectatorView({ session }) {
  const { t } = useTranslation();
  const view = session.view || {};
  const phase = view.phase || "lobby";
  const players = view.players || [];

  return (
    <main className="spectator-page">
      <header>
        <h1>{t("game:spectator_title")}</h1>
        <p className="muted">{t("game:spectator_phase_" + phase)}</p>
      </header>

      <section className="spectator-seats">
        <h2>{t("game:seats_title", { count: players.length })}</h2>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              {p.nickname} · {t("game:role_" + (p.role || p.playerType || "digital"))}
              {p.commTokenUsed ? " · 🎯" : ""}
            </li>
          ))}
        </ul>
      </section>

      {phase === "trick" || phase === "finished" ? (
        <>
          <section className="spectator-trick">
            <Trick trick={view.trick} players={players} />
          </section>
          <section>
            <h3>{t("game:tricks_history")}</h3>
            <TricksHistory tricks={view.tricks || []} players={players} />
          </section>
        </>
      ) : null}
    </main>
  );
}
