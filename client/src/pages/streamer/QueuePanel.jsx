import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import {
  useQueueList,
  offerSeatToEntry,
  kickFromQueue,
  queueKeys,
} from "../../queries/queue";
import { useQueueSocket } from "../../hooks/useQueueSocket";

// Slot in the streamer's lobby panel that lists waiting/offered queue
// entries and lets the streamer invite them into the session. Real-time
// updates arrive over the socket (seat-queue:updated invalidates the
// cache); useQueueList's 3-second polling stays as a fallback in case
// the socket drops between events.
export default function QueuePanel({ session }) {
  const { t } = useTranslation();
  const channel = useSelector((s) => s.auth.channel);
  const queryClient = useQueryClient();
  const slug = channel && channel.slug;
  const sessionId = session.sessionId;

  // Subscribe to the channel's queue events. The hook joins
  // channel:<slug>:queue and invalidates queueKeys.list on updates.
  useQueueSocket(slug);

  const list = useQueueList(slug, { enabled: !!slug });
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function onInvite(entryId) {
    if (!slug || !sessionId) return;
    setError(null);
    setBusyId(entryId);
    try {
      await offerSeatToEntry({ channelSlug: slug, sessionId, entryId });
      // Best-effort local nudge — the socket will also push
      // seat-queue:updated so this invalidate is belt-and-braces.
      await queryClient.invalidateQueries({ queryKey: queueKeys.list(slug) });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setBusyId(null);
    }
  }

  async function onKick(entryId) {
    if (!slug) return;
    setError(null);
    setBusyId(entryId);
    try {
      await kickFromQueue({ channelSlug: slug, entryId });
      await queryClient.invalidateQueries({ queryKey: queueKeys.list(slug) });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setBusyId(null);
    }
  }

  const rows = list.data || [];

  return (
    <section className="queue-panel" data-testid="queue-panel">
      <h3>{t("queue:panel_title")}</h3>
      {list.isLoading && rows.length === 0 ? (
        <p className="muted">{t("queue:loading")}</p>
      ) : null}
      {!list.isLoading && rows.length === 0 ? (
        <p className="muted">{t("queue:empty")}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="queue-panel__list">
          {rows.map((e) => (
            <li key={e._id} className={`queue-panel__row queue-panel__row--${e.status}`}>
              <div className="queue-panel__meta">
                <span className="queue-panel__nickname">{e.nickname}</span>
                <span className="queue-panel__karma muted">
                  {t("queue:karma", { karma: Number(e.karma).toFixed(1) })}
                </span>
                <span className="queue-panel__status muted">
                  {t("queue:status_" + e.status)}
                </span>
              </div>
              <div className="queue-panel__actions">
                {e.status === "waiting" ? (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => onInvite(e._id)}
                    disabled={busyId === e._id}
                  >
                    {busyId === e._id ? t("queue:inviting") : t("queue:invite")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onKick(e._id)}
                  disabled={busyId === e._id}
                >
                  {t("queue:kick")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
