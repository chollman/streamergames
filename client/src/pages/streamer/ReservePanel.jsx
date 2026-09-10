import { useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import CardPicker from "../../components/game/CardPicker";
import { submitAction } from "../../queries/sessions";

// Phase: reserving. The streamer picks the 14 cards they'll play physically
// (or whichever hand-size their seat is entitled to), then triggers the
// deal which distributes remaining cards to digitals.
export default function ReservePanel({ session }) {
  const { t } = useTranslation();
  const view = session.view || {};
  const players = view.players || [];
  const totalPlayers = players.length;
  const streamerSeat = players.find((p) => p.playerType === "physical");
  const expected = streamerSeat
    ? expectedHandSize(totalPlayers, streamerSeat.order)
    : 0;

  // Streamer's currently-selected reserve. Rehydrated from server state if
  // the streamer already reserved (e.g. after reload).
  const initial = useMemo(
    () => new Set(view.reservedByStreamer || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [selected, setSelected] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function onToggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function onSubmitReserve() {
    setError(null);
    setSubmitting(true);
    try {
      await submitAction({
        sessionId: session.sessionId,
        action: { type: "reserve-hand", cardIds: [...selected] },
      });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeal() {
    setError(null);
    setSubmitting(true);
    try {
      await submitAction({
        sessionId: session.sessionId,
        action: { type: "deal" },
      });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  const alreadyReserved = (view.reservedByStreamer || []).length === expected && expected > 0;

  return (
    <section className="reserve-panel">
      <h2>{t("game:reserve_title")}</h2>
      <p className="muted">{t("game:reserve_blurb", { expected })}</p>

      <CardPicker
        selected={selected}
        onToggle={onToggle}
        disabled={submitting || alreadyReserved}
        expectedCount={expected}
      />

      <div className="reserve-panel__actions">
        {!alreadyReserved ? (
          <button
            type="button"
            className="primary-btn"
            onClick={onSubmitReserve}
            disabled={submitting || selected.size !== expected}
          >
            {submitting ? t("game:submitting") : t("game:confirm_reserve")}
          </button>
        ) : (
          <button
            type="button"
            className="primary-btn"
            onClick={onDeal}
            disabled={submitting}
          >
            {submitting ? t("game:submitting") : t("game:deal_to_digitals")}
          </button>
        )}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function expectedHandSize(playerCount, order) {
  const base = Math.floor(40 / playerCount);
  const extra = order < 40 % playerCount ? 1 : 0;
  return base + extra;
}
