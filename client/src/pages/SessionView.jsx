import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSessionSubscription } from "../hooks/useSessionSubscription";
import { useSessionRole } from "../hooks/useSessionRole";
import StreamerOperator from "./streamer/StreamerOperator";
import DigitalPlayView from "./digital/DigitalPlayView";
import SpectatorView from "./SpectatorView";

// Dispatcher: fetches a session (via useSessionSubscription which opens
// the socket + primes the bootstrap query), infers the caller's role from
// what the server put in the view, and renders the matching sub-page.
export default function SessionView() {
  const { t } = useTranslation();
  const { id } = useParams();
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

  if (role === "streamer") return <StreamerOperator session={session} />;
  if (role === "digital") return <DigitalPlayView session={session} />;
  return <SpectatorView session={session} />;
}
