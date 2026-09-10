import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Card from "./Card";
import { toCard } from "./Hand";

// Modal that walks the player through The Crew's communication rule:
// pick a non-rocket card from your hand, then say whether it's the
// highest, only, or lowest of its suit. The server re-validates the
// claim on submit.
//
// Simple in-tree modal (no portal for MVP — will migrate to <Modal /> in
// F1e.6 when we add the shared component library).

export default function CommunicateModal({ hand = [], onSubmit, onClose, submitting }) {
  const { t } = useTranslation("game");
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);

  // Reset when the modal reopens (i.e. `hand` reference changes and there's
  // no selection).
  useEffect(() => {
    setSelectedCardId(null);
    setPosition(null);
    setError(null);
  }, [hand]);

  const nonRockets = useMemo(
    () => hand.filter((id) => toCard(id).suit !== "rocket"),
    [hand]
  );

  // For each candidate card, compute which positions are valid (client-side
  // hint; server is authoritative).
  const validPositions = useMemo(() => {
    if (!selectedCardId) return new Set();
    const c = toCard(selectedCardId);
    const sameSuit = nonRockets
      .map(toCard)
      .filter((x) => x.suit === c.suit);
    const ranks = sameSuit.map((x) => x.rank);
    const positions = new Set();
    if (ranks.length === 1) positions.add("only");
    if (Math.max(...ranks) === c.rank) positions.add("highest");
    if (Math.min(...ranks) === c.rank) positions.add("lowest");
    return positions;
  }, [selectedCardId, nonRockets]);

  async function handleSubmit() {
    setError(null);
    try {
      await onSubmit({ cardId: selectedCardId, position });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("communicate_generic_error"));
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="communicate-title">
      <div className="modal-card">
        <header className="modal-card__header">
          <h2 id="communicate-title">{t("communicate_title")}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </header>

        <div className="modal-card__body">
          <p className="muted">{t("communicate_blurb")}</p>

          {nonRockets.length === 0 ? (
            <p role="alert">{t("communicate_no_valid_cards")}</p>
          ) : (
            <div className="communicate__cards" role="list">
              {nonRockets.map((id) => (
                <div role="listitem" key={id}>
                  <Card
                    card={toCard(id)}
                    onClick={() => {
                      setSelectedCardId(id);
                      setPosition(null);
                    }}
                    selected={selectedCardId === id}
                  />
                </div>
              ))}
            </div>
          )}

          {selectedCardId ? (
            <div className="communicate__positions">
              <p>{t("communicate_choose_position")}</p>
              {["highest", "only", "lowest"].map((pos) => (
                <button
                  key={pos}
                  type="button"
                  disabled={!validPositions.has(pos) || submitting}
                  onClick={() => setPosition(pos)}
                  className={position === pos ? "primary-btn" : "ghost-btn"}
                >
                  {t("communicate_pos_" + pos)}
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="modal-card__footer">
          <button type="button" className="ghost-btn" onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSubmit}
            disabled={!selectedCardId || !position || submitting}
          >
            {submitting ? t("submitting") : t("communicate_submit")}
          </button>
        </footer>
      </div>
    </div>
  );
}
