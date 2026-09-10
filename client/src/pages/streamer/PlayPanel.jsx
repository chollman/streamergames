import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Hand from "../../components/game/Hand";
import Trick from "../../components/game/Trick";
import TricksHistory from "../../components/game/TricksHistory";
import { submitAction } from "../../queries/sessions";
import { toCard } from "../../components/game/Hand";

// Phase: trick. Streamer sees full state (their hand + everyone else's
// hand-sizes + current trick + history) and plays when it's their turn.
export default function PlayPanel({ session }) {
  const { t } = useTranslation();
  const view = session.view || {};
  const players = view.players || [];
  const currentTurnId = view.currentTurnId;
  const streamerSeat = players.find((p) => p.playerType === "physical");
  const streamerHand = streamerSeat ? streamerSeat.hand || [] : [];

  const isMyTurn = streamerSeat && currentTurnId === streamerSeat.id;
  const trick = view.trick;
  const ledSuit = trick && trick.ledSuit;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Compute which of the streamer's cards are legal to play right now.
  const legalIds = useMemo(() => {
    if (!isMyTurn) return new Set();
    if (!ledSuit) {
      // Leader: everything except leading-with-rocket-when-you-have-others.
      const nonRockets = streamerHand.filter((id) => toCard(id).suit !== "rocket");
      if (nonRockets.length === 0) return new Set(streamerHand);
      return new Set(nonRockets);
    }
    const followSuit = streamerHand.filter((id) => toCard(id).suit === ledSuit);
    if (followSuit.length > 0) return new Set(followSuit);
    return new Set(streamerHand);
  }, [isMyTurn, ledSuit, streamerHand]);

  async function onPlay(card) {
    setError(null);
    setSubmitting(true);
    try {
      await submitAction({
        sessionId: session.sessionId,
        action: { type: "play-card", cardId: card.id },
      });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmTrick() {
    setSubmitting(true);
    setError(null);
    try {
      await submitAction({
        sessionId: session.sessionId,
        action: { type: "confirm-trick" },
      });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeclareEnd(result) {
    setSubmitting(true);
    setError(null);
    try {
      await submitAction({
        sessionId: session.sessionId,
        action: { type: "declare-end", result },
      });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  const trickComplete = trick && trick.plays && trick.plays.length === players.length;

  return (
    <section className="play-panel">
      <header className="play-panel__meta">
        <h2>{t("game:play_title")}</h2>
        <p className="muted">
          {isMyTurn
            ? t("game:your_turn")
            : t("game:waiting_for", {
                name:
                  (players.find((p) => p.id === currentTurnId) || {}).nickname ||
                  "—",
              })}
        </p>
      </header>

      <div className="play-panel__trick">
        <Trick trick={trick} players={players} />
        {trickComplete ? (
          <button
            type="button"
            className="primary-btn"
            onClick={onConfirmTrick}
            disabled={submitting}
          >
            {t("game:confirm_trick")}
          </button>
        ) : null}
      </div>

      <div className="play-panel__hand">
        <h3>{t("game:your_hand")}</h3>
        <Hand
          cardIds={streamerHand}
          onCardClick={isMyTurn && !submitting ? onPlay : undefined}
          legalIds={isMyTurn ? legalIds : null}
        />
      </div>

      <details className="play-panel__history">
        <summary>{t("game:tricks_history")}</summary>
        <TricksHistory tricks={view.tricks || []} players={players} />
      </details>

      <div className="play-panel__end">
        <details>
          <summary>{t("game:declare_end_summary")}</summary>
          <div className="play-panel__end-actions">
            <button type="button" onClick={() => onDeclareEnd("won")} disabled={submitting}>
              {t("game:declare_won")}
            </button>
            <button type="button" onClick={() => onDeclareEnd("lost")} disabled={submitting}>
              {t("game:declare_lost")}
            </button>
          </div>
        </details>
      </div>

      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
