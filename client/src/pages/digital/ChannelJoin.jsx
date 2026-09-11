import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  enqueueSelf,
  leaveQueue,
  acceptSeat,
  useMyQueueEntry,
  queueKeys,
} from "../../queries/queue";
import { useQueueSocket } from "../../hooks/useQueueSocket";
import {
  getQueueToken,
  setQueueToken,
  clearQueueToken,
  setGuestToken,
} from "../../api/sessionStorage";

// The digital player's entry point in F2 onwards: /canal/<slug>. Two states:
//   • no queueToken yet → nickname form → enqueue → save token → transition
//     into the waiting card without a reload.
//   • have queueToken → subscribe to the channel's queue socket + poll
//     /queue/me every few seconds as a fallback, render the waiting card
//     with position + status. seat:offered wakes the tab up immediately
//     when the streamer clicks Invite. If the entry disappears
//     (kicked / left) offer to rejoin.
export default function ChannelJoin() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe to the channel queue socket. The hook picks the right token
  // (queueToken while sitting in the queue, none otherwise), joins the
  // queue rooms, and invalidates queueKeys.me on seat:offered.
  useQueueSocket(slug);

  async function onAccept() {
    if (!slug) return;
    setError(null);
    setBusy(true);
    try {
      const data = await acceptSeat({ channelSlug: slug });
      const sessionId = data && data.session && data.session._id;
      const gToken = data && data.guestToken;
      if (sessionId && gToken) {
        setGuestToken(sessionId, gToken);
        navigate(`/sesion/${sessionId}`);
      }
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      // Offer expired between the streamer's invite and this click. The
      // server already reset the entry to 'waiting' and the socket update
      // will refresh /me, so we just show a clear message. Server default
      // TTL is 5 minutes; this shouldn't happen during a demo.
      if (data.code === "offer_expired") {
        setError(t("queue:offer_expired_msg"));
      } else {
        setError(data.message || t("common:generic_error"));
      }
    } finally {
      setBusy(false);
    }
  }

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
                <>
                  <p className="channel-join-card__offered">
                    {t("queue:offered")}
                  </p>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={onAccept}
                    disabled={busy}
                  >
                    {busy ? t("queue:accepting") : t("queue:accept_seat")}
                  </button>
                </>
              ) : null}
              {isSeated ? (
                <>
                  <p className="channel-join-card__seated">
                    {t("queue:seated")}
                  </p>
                  {/* Offer a shortcut back into the seat. The digital's
                      guestToken for the session is still in localStorage
                      from when they accepted, so /sesion/:id boots them
                      straight into DigitalPlayView. If the session has
                      since ended, SessionView renders the "session ended"
                      screen instead — either way this is the right button. */}
                  {(entry.seatedSessionId || entry.offeredSessionId) ? (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() =>
                        navigate(`/sesion/${entry.seatedSessionId || entry.offeredSessionId}`)
                      }
                    >
                      {t("queue:return_to_session")}
                    </button>
                  ) : null}
                </>
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
