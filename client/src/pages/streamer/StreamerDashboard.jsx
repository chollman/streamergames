import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { createSession } from "../../queries/sessions";
import { logout } from "../../queries/auth";

// The authed home for a streamer: create a new session and jump into it.
// F2 will add a listing of past sessions and the seat queue.
export default function StreamerDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const channel = useSelector((s) => s.auth.channel);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function onCreateSession() {
    if (!channel) return;
    setError(null);
    setCreating(true);
    try {
      const { session } = await createSession({ channelSlug: channel.slug });
      navigate(`/sesion/${session._id}`);
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("common:generic_error"));
    } finally {
      setCreating(false);
    }
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
        <button
          type="button"
          className="primary-btn"
          onClick={onCreateSession}
          disabled={creating || !channel}
        >
          {creating ? t("common:creating_session") : t("common:create_session")}
        </button>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
