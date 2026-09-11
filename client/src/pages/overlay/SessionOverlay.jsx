import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSessionSubscription } from "../../hooks/useSessionSubscription";
import Trick from "../../components/game/Trick";
import Card from "../../components/game/Card";
import { toCard } from "../../components/game/Hand";

// How long the "Ana gana la baza" banner stays on screen after a trick
// closes. Long enough to read on stream, short enough not to bury the
// next trick's lead card.
const WINNER_FLASH_MS = 2500;

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
  const phase = view.phase || "lobby";
  const currentTurnPlayer = players.find((p) => p.id === view.currentTurnId);

  // Bazas ganadas por jugador — la sumamos del historial de bazas.
  // Se recalcula solo cuando cambia la lista; barato para The Crew (13
  // bazas máx.).
  const trickWinsById = useMemo(() => {
    const m = {};
    for (const tr of tricks) {
      if (tr.winnerId) m[tr.winnerId] = (m[tr.winnerId] || 0) + 1;
    }
    return m;
  }, [tricks]);

  // Flash de "X gana la baza" cuando entra una baza nueva al historial.
  // Se cierra solo después de WINNER_FLASH_MS. El ref evita disparar el
  // efecto en el render inicial (no querés un flash en la baza fantasma
  // que ya estaba antes de montar).
  const [flash, setFlash] = useState(null);
  const prevTricksLen = useRef(tricks.length);
  useEffect(() => {
    const grew = tricks.length > prevTricksLen.current;
    prevTricksLen.current = tricks.length;
    if (!grew) return undefined;
    const last = tricks[tricks.length - 1];
    if (!last || !last.winnerId) return undefined;
    const winner = players.find((p) => p.id === last.winnerId);
    setFlash({ winnerId: last.winnerId, nickname: winner ? winner.nickname : "—" });
    const timer = setTimeout(() => setFlash(null), WINNER_FLASH_MS);
    return () => clearTimeout(timer);
    // Intencional: solo miramos la longitud + la lista para captar la nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tricks.length]);

  const showTurnBanner = phase === "trick" && currentTurnPlayer && !flash;
  const finished = phase === "finished";

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
          <div className="overlay-header__meta">
            <div className="overlay-phase">{t("game:spectator_phase_" + phase)}</div>
            <div className="overlay-tricks-count">
              {t("game:tricks_played", { count: tricks.length })}
            </div>
          </div>
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
              <div className="overlay-player__meta">
                <span>{t("game:cards_left", { count: p.handSize || 0 })}</span>
                {trickWinsById[p.id] ? (
                  <span className="overlay-player__wins">
                    · {t("game:tricks_won_short", { count: trickWinsById[p.id] })}
                  </span>
                ) : null}
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
          {flash ? (
            <div className="overlay-trick-flash" role="status" aria-live="polite">
              <div className="overlay-trick-flash__icon">🏆</div>
              <div className="overlay-trick-flash__text">
                {t("game:overlay_trick_won_by", { name: flash.nickname })}
              </div>
            </div>
          ) : (
            <Trick trick={trick} players={players} />
          )}
        </section>

        <section className="overlay-footer">
          {showTurnBanner ? (
            <div className="overlay-turn-banner">
              {t("game:overlay_turn_of")}{" "}
              <strong>{currentTurnPlayer.nickname}</strong>
            </div>
          ) : finished ? (
            <div className="overlay-turn-banner overlay-turn-banner--finished">
              {t("game:finished_title")}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
