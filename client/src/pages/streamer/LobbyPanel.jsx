import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { startSession } from "../../queries/sessions";
import QueuePanel from "./QueuePanel";

// Session is in lobby: show seats, share URL for guests to join, allow
// start when we have enough players.
export default function LobbyPanel({ session }) {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const view = session.view || {};
  const players = view.players || [];

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/entrar/${session.sessionId}`
      : "";
  const canStart = players.length >= 3; // The Crew minPlayers

  // Auto-reset the "copied" state after 2s so the button label returns
  // to its default without another interaction.
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function onStart() {
    setError(null);
    setStarting(true);
    try {
      await startSession({ sessionId: session.sessionId });
      // The socket will push the updated session:state; no navigation needed.
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setStarting(false);
    }
  }

  async function copyJoinUrl() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure origin) — the input is
      // click-to-select as a fallback so the user can Ctrl+C themselves.
    }
  }

  return (
    <section className="lobby-panel">
      <h2>{t("game:lobby_title")}</h2>

      <p className="lobby-panel__blurb">{t("game:share_prompt")}</p>

      <div className="lobby-panel__share">
        <label>
          {t("game:share_join_url")}
          <input
            type="text"
            value={joinUrl}
            readOnly
            onFocus={(e) => e.target.select()}
          />
        </label>
        <button
          type="button"
          className={`share-copy-btn${copied ? " share-copy-btn--copied" : ""}`}
          onClick={copyJoinUrl}
          aria-live="polite"
        >
          {copied ? t("game:copied") : t("game:copy_url")}
        </button>
      </div>

      <div className="lobby-panel__seats">
        <h3>{t("game:seats_title", { count: players.length })}</h3>
        {players.length === 0 ? (
          <p className="muted">{t("game:seats_empty")}</p>
        ) : (
          <ul>
            {players.map((p) => (
              <li key={p.id}>
                <span className="seat-role">
                  {t("game:role_" + (p.role || p.playerType || "digital"))}
                </span>
                <span className="seat-nickname">{p.nickname}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <QueuePanel session={session} />

      <div className="lobby-panel__actions">
        <button
          type="button"
          className="primary-btn"
          onClick={onStart}
          disabled={!canStart || starting}
        >
          {starting ? t("game:starting") : t("game:start_session")}
        </button>
        {!canStart ? (
          <p className="muted">{t("game:need_more_players", { need: 3 - players.length })}</p>
        ) : null}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
