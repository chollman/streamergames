import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Hand from "../../components/game/Hand";
import Trick from "../../components/game/Trick";
import TricksHistory from "../../components/game/TricksHistory";
import CommunicateModal from "../../components/game/CommunicateModal";
import { submitAction } from "../../queries/sessions";
import { toCard } from "../../components/game/Hand";

// The digital player's view during a session. Renders three phases:
//   lobby     → "waiting for streamer to start"
//   reserving → "waiting for streamer to reserve + deal"
//   trick     → your hand + trick + play/communicate buttons
//   finished  → summary
export default function DigitalPlayView({ session }) {
  const { t } = useTranslation();
  const view = session.view || {};
  const phase = view.phase || "lobby";
  const players = view.players || [];
  const currentTurnId = view.currentTurnId;
  const myPlayerId = view.myPlayerId;
  const myHand = view.myHand || [];
  const me = players.find((p) => p.id === myPlayerId);
  const isMyTurn = currentTurnId === myPlayerId;
  const trick = view.trick;
  const ledSuit = trick && trick.ledSuit;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [communicating, setCommunicating] = useState(false);

  const legalIds = useMemo(() => {
    if (phase !== "trick" || !isMyTurn) return new Set();
    if (!ledSuit) {
      const nonRockets = myHand.filter((id) => toCard(id).suit !== "rocket");
      if (nonRockets.length === 0) return new Set(myHand);
      return new Set(nonRockets);
    }
    const followSuit = myHand.filter((id) => toCard(id).suit === ledSuit);
    if (followSuit.length > 0) return new Set(followSuit);
    return new Set(myHand);
  }, [phase, isMyTurn, ledSuit, myHand]);

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

  async function onCommunicate({ cardId, position }) {
    setError(null);
    setSubmitting(true);
    try {
      await submitAction({
        sessionId: session.sessionId,
        action: { type: "communicate", cardId, position },
      });
      setCommunicating(false);
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
      throw err; // let the modal surface it too
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "lobby") {
    return (
      <main className="digital-page">
        <h1>{t("game:digital_lobby_title")}</h1>
        <p className="muted">{t("game:digital_lobby_blurb", { count: players.length })}</p>
        <SeatsList players={players} me={me} />
      </main>
    );
  }
  if (phase === "reserving") {
    return (
      <main className="digital-page">
        <h1>{t("game:digital_reserving_title")}</h1>
        <p className="muted">{t("game:digital_reserving_blurb")}</p>
      </main>
    );
  }
  if (phase === "finished") {
    return (
      <main className="digital-page">
        <h1>{t("game:finished_title")}</h1>
        {view.result ? (
          <p className="finished-result">{t("game:finished_result_" + view.result)}</p>
        ) : null}
        <TricksHistory tricks={view.tricks || []} players={players} />
      </main>
    );
  }

  // Trick phase.
  return (
    <main className="digital-page">
      <header className="digital-page__meta">
        <h1>{t("game:digital_playing_title", { nickname: me ? me.nickname : "" })}</h1>
        <p className="muted" aria-live="polite">
          {isMyTurn
            ? t("game:your_turn")
            : t("game:waiting_for", {
                name:
                  (players.find((p) => p.id === currentTurnId) || {}).nickname || "—",
              })}
        </p>
      </header>

      <Trick trick={trick} players={players} />

      <section className="digital-hand">
        <h2>{t("game:your_hand")}</h2>
        <Hand
          cardIds={myHand}
          onCardClick={isMyTurn && !submitting ? onPlay : undefined}
          legalIds={isMyTurn ? legalIds : null}
        />
      </section>

      <section className="digital-actions">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setCommunicating(true)}
          disabled={submitting || (me && me.commTokenUsed)}
        >
          {me && me.commTokenUsed
            ? t("game:comm_token_used")
            : t("game:communicate")}
        </button>
      </section>

      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}

      {communicating ? (
        <CommunicateModal
          hand={myHand}
          submitting={submitting}
          onSubmit={onCommunicate}
          onClose={() => setCommunicating(false)}
        />
      ) : null}
    </main>
  );
}

function SeatsList({ players, me }) {
  return (
    <ul className="seats-list">
      {players.map((p) => (
        <li key={p.id} className={me && p.id === me.id ? "is-me" : ""}>
          {p.nickname}
          {p.role === "streamer" ? " · 🎥" : ""}
        </li>
      ))}
    </ul>
  );
}
