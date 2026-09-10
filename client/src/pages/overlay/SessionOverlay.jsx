import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSessionSubscription } from "../../hooks/useSessionSubscription";
import Trick from "../../components/game/Trick";
import Card from "../../components/game/Card";
import { toCard } from "../../components/game/Hand";

// OBS browser-source overlay. Forced-dark, fixed 1920×1080, minimal chrome.
// `?transparent=1` makes the background transparent (useful for compositing
// over a physical-table camera feed in OBS).
export default function SessionOverlay() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params] = useSearchParams();
  const transparent = params.get("transparent") === "1";

  const { session } = useSessionSubscription(id, null);

  // Force the overlay to render in dark theme regardless of the viewer's
  // stored preference (Constitution §3 exception for forced-dark screens).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("data-theme");
    html.setAttribute("data-theme", "dark");
    return () => {
      if (previous) html.setAttribute("data-theme", previous);
      else html.removeAttribute("data-theme");
    };
  }, []);

  const view = session.view || {};
  const players = view.players || [];
  const trick = view.trick;
  const tricks = view.tricks || [];

  return (
    <main
      className={`overlay-root${transparent ? " overlay-root--transparent" : ""}`}
      data-testid="session-overlay"
    >
      <div className="overlay-canvas">
        <header className="overlay-header">
          <div className="overlay-brand">
            <strong>{t("common:app_name")}</strong>
            <span>{t("game:overlay_the_crew")}</span>
          </div>
          <div className="overlay-phase">{t("game:spectator_phase_" + (view.phase || "lobby"))}</div>
        </header>

        <section className="overlay-players">
          {players.map((p) => (
            <div
              key={p.id}
              className={`overlay-player${p.id === view.currentTurnId ? " is-turn" : ""}${
                p.id === view.commanderId ? " is-commander" : ""
              }`}
            >
              <div className="overlay-player__name">
                {p.nickname}
                {p.id === view.commanderId ? " · ⭐" : ""}
              </div>
              <div className="overlay-player__hand-size">
                {t("game:cards_left", { count: p.handSize || 0 })}
              </div>
              {p.commCard ? (
                <div className="overlay-player__comm">
                  <Card card={toCard(p.commCard.cardId)} variant="communicated" />
                  <small>{t("game:communicate_pos_" + p.commCard.position)}</small>
                </div>
              ) : null}
            </div>
          ))}
        </section>

        <section className="overlay-trick">
          <Trick trick={trick} players={players} />
        </section>

        <section className="overlay-tricks-count">
          {t("game:tricks_played", { count: tricks.length })}
        </section>
      </div>
    </main>
  );
}
