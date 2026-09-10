import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  enqueueSelf,
  leaveQueue,
  useMyQueueEntry,
  queueKeys,
} from "../../queries/queue";
import {
  getQueueToken,
  setQueueToken,
  clearQueueToken,
} from "../../api/sessionStorage";

// The digital player's entry point in F2 onwards: /canal/<slug>. Two states:
//   • no queueToken yet → nickname form → enqueue → save token → transition
//     into the waiting card without a reload.
//   • have queueToken → poll /queue/me, render the waiting card with
//     position + status. If the entry disappears (kicked / left) offer to
//     rejoin.
export default function ChannelJoin() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const hasToken = !!getQueueToken(slug);
  const meQuery = useMyQueueEntry(slug, { enabled: hasToken });

  async function onJoin(e) {
    e.preventDefault();
    if (!slug) return;
    setError(null);
    setBusy(true);
    try {
      const { entry, queueToken } = await enqueueSelf({
        channelSlug: slug,
        nickname,
      });
      setQueueToken(slug, queueToken);
      // Seed the /me cache with the freshly-created entry so the waiting
      // card renders instantly instead of waiting for the first poll.
      queryClient.setQueryData(queueKeys.me(slug), entry);
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      await leaveQueue({ channelSlug: slug });
    } catch {
      /* even if the request fails, the local state should reset */
    } finally {
      clearQueueToken(slug);
      queryClient.setQueryData(queueKeys.me(slug), null);
      setNickname("");
      setBusy(false);
    }
  }

  // Terminal states — the entry existed but is no longer waiting/offered.
  const entry = meQuery.data || null;
  const isWaiting = entry && entry.status === "waiting";
  const isOffered = entry && entry.status === "offered";
  const isSeated = entry && entry.status === "seated";
  const isTerminated =
    entry && (entry.status === "kicked" || entry.status === "left");

  // If the entry is gone (401/404) treat the token as stale so we can show
  // the join form again. Same for terminated states.
  const meError = meQuery.error && meQuery.error.response;
  const tokenIsStale =
    !!hasToken &&
    ((meError && (meError.status === 401 || meError.status === 404)) || isTerminated);

  // Silently drop a stale queueToken (kicked / left / server lost the entry)
  // in an effect so the render pass stays pure; the next render sees no
  // token and shows the join form again.
  useEffect(() => {
    if (tokenIsStale) clearQueueToken(slug);
  }, [tokenIsStale, slug]);

  const showJoinForm = !hasToken || tokenIsStale;

  return (
    <main className="channel-join-page">
      <header>
        <h1>{t("queue:channel_title", { slug })}</h1>
      </header>

      {showJoinForm ? (
        <form onSubmit={onJoin} className="channel-join-form">
          <label htmlFor="nickname">{t("queue:nickname_label")}</label>
          <input
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={50}
            required
            autoFocus
          />
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? t("queue:joining") : t("queue:join_queue")}
          </button>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <section className="channel-join-card" data-testid="queue-waiting-card">
          {meQuery.isLoading && !entry ? (
            <p className="muted">{t("queue:loading")}</p>
          ) : null}
          {entry ? (
            <>
              <p className="channel-join-card__nickname">
                {t("queue:you_are_name", { name: entry.nickname })}
              </p>
              {isWaiting ? (
                <>
                  <p className="channel-join-card__position">
                    {t("queue:position", { n: entry.position || "?" })}
                  </p>
                  <p className="muted">{t("queue:waiting_hint")}</p>
                </>
              ) : null}
              {isOffered ? (
                <p className="channel-join-card__offered">
                  {t("queue:offered")}
                </p>
              ) : null}
              {isSeated ? (
                <p className="channel-join-card__seated">
                  {t("queue:seated")}
                </p>
              ) : null}
              {(isWaiting || isOffered) ? (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={onLeave}
                  disabled={busy}
                >
                  {t("queue:leave")}
                </button>
              ) : null}
            </>
          ) : null}
        </section>
      )}
    </main>
  );
}
