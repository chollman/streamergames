import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createSession,
  abandonSession,
  useActiveSessionQuery,
  sessionKeys,
} from "../../queries/sessions";
import { logout } from "../../queries/auth";

// The authed home for a streamer. Reads the channel's active session
// (lobby or in_progress) and offers either "Continuar sesión activa" or
// "Crear nueva sesión". Enforces one active session per channel (matches
// the server's 409 guard).
export default function StreamerDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useSelector((s) => s.auth.user);
  const channel = useSelector((s) => s.auth.channel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const active = useActiveSessionQuery(channel && channel.slug);

  async function onCreate() {
    if (!channel) return;
    setError(null);
    setBusy(true);
    try {
      const { session } = await createSession({ channelSlug: channel.slug });
      queryClient.setQueryData(sessionKeys.active(channel.slug), session);
      navigate(`/sesion/${session._id}`);
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      if (data.code === "active_session_exists" && data.sessionId) {
        // Race: another tab created one. Refresh + navigate to it.
        queryClient.invalidateQueries({ queryKey: sessionKeys.active(channel.slug) });
        navigate(`/sesion/${data.sessionId}`);
        return;
      }
      setError(data.message || t("common:generic_error"));
    } finally {
      setBusy(false);
    }
  }

  async function onAbandonAndCreate() {
    if (!channel || !active.data) return;
    setError(null);
    setBusy(true);
    try {
      await abandonSession({ sessionId: active.data._id });
      const { session } = await createSession({ channelSlug: channel.slug });
      queryClient.setQueryData(sessionKeys.active(channel.slug), session);
      navigate(`/sesion/${session._id}`);
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setBusy(false);
    }
  }

  function onContinue() {
    if (active.data) navigate(`/sesion/${active.data._id}`);
  }

  return (
    <main className="home-page">
      <header className="home-page__header">
        <div>
          <h1>{t("common:hello_name", { name: (user && user.displayName) || "" })}</h1>
          {channel ? (
            <p className="muted">{t("common:your_channel", { slug: channel.slug })}</p>
          ) : null}
        </div>
        <button type="button" className="ghost-btn" onClick={logout}>
          {t("common:logout")}
        </button>
      </header>

      <section className="dashboard-actions">
        {active.isLoading ? (
          <p className="muted">{t("common:checking_active_session")}</p>
        ) : active.data ? (
          <>
            <div className="active-session-card">
              <div>
                <p className="active-session-card__label">
                  {t("common:active_session_title")}
                </p>
                <p className="muted">
                  {t("common:active_session_status_" + (active.data.status || "lobby"))}
                </p>
              </div>
              <div className="active-session-card__actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={onContinue}
                  disabled={busy}
                >
                  {t("common:continue_session")}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={onAbandonAndCreate}
                  disabled={busy}
                >
                  {busy
                    ? t("common:working")
                    : t("common:abandon_and_create")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="primary-btn"
            onClick={onCreate}
            disabled={busy || !channel}
          >
            {busy ? t("common:creating_session") : t("common:create_session")}
          </button>
        )}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
