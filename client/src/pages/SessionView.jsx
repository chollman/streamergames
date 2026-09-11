import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSessionSubscription } from "../hooks/useSessionSubscription";
import { useSessionRole } from "../hooks/useSessionRole";
import StreamerOperator from "./streamer/StreamerOperator";
import DigitalPlayView from "./digital/DigitalPlayView";
import SpectatorView from "./SpectatorView";

// Dispatcher: fetches a session (via useSessionSubscription which opens
// the socket + primes the bootstrap query), infers the caller's role from
// what the server put in the view, and renders the matching sub-page.
// An ended (abandoned / finished) session short-circuits to a terminal
// screen instead of one of the live sub-pages — the streamer's "Cancel
// and start new" fires session:ended over the socket, and reopening the
// URL after that returns session.status !== "lobby"|"in_progress".
export default function SessionView() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, initialQuery } = useSessionSubscription(id, null);
  const role = useSessionRole(session.view);

  if (initialQuery.isLoading && !session.view) {
    return (
      <main className="loading-page">
        <p>{t("common:loading_session")}</p>
      </main>
    );
  }
  if (initialQuery.isError) {
    return (
      <main className="loading-page">
        <p role="alert">{t("common:session_load_error")}</p>
      </main>
    );
  }

  // Session ended: either via a live socket event (session.ended is set)
  // or the bootstrap payload already carries a terminal status (the user
  // reopened the URL after the streamer closed it).
  const bootstrapSession = initialQuery.data && initialQuery.data.session;
  const bootstrapEnded =
    bootstrapSession &&
    (bootstrapSession.status === "abandoned" || bootstrapSession.status === "finished");
  const socketEnded = session.ended;
  if (bootstrapEnded || socketEnded) {
    const reason =
      (socketEnded && socketEnded.reason) ||
      (bootstrapSession && bootstrapSession.status) ||
      "abandoned";
    const channelSlug =
      (socketEnded && socketEnded.channelSlug) ||
      (initialQuery.data && initialQuery.data.channelSlug) ||
      null;
    return (
      <main className="loading-page" data-testid="session-ended">
        <h1>{t("game:session_ended_title")}</h1>
        <p>{t("game:session_ended_" + reason)}</p>
        {channelSlug ? (
          <button
            type="button"
            className="primary-btn"
            onClick={() => navigate(`/canal/${channelSlug}`)}
          >
            {t("game:back_to_channel")}
          </button>
        ) : (
          <button
            type="button"
            className="primary-btn"
            onClick={() => navigate("/")}
          >
            {t("game:back_home")}
          </button>
        )}
      </main>
    );
  }

  if (role === "streamer") return <StreamerOperator session={session} />;
  if (role === "digital") return <DigitalPlayView session={session} />;
  return <SpectatorView session={session} />;
}
