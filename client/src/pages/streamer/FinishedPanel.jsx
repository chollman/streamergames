import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import TricksHistory from "../../components/game/TricksHistory";
import { createSession } from "../../queries/sessions";
import { useState } from "react";

export default function FinishedPanel({ session }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const channel = useSelector((s) => s.auth.channel);
  const view = session.view || {};
  const players = view.players || [];
  const result = view.result;
  const [creating, setCreating] = useState(false);

  async function onNewSession() {
    if (!channel) return;
    setCreating(true);
    try {
      const { session: created } = await createSession({ channelSlug: channel.slug });
      navigate(`/sesion/${created._id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="finished-panel">
      <h2>{t("game:finished_title")}</h2>
      {result ? (
        <p className="finished-result">
          {t("game:finished_result_" + result)}
        </p>
      ) : null}

      <div className="finished-panel__history">
        <h3>{t("game:tricks_history")}</h3>
        <TricksHistory tricks={view.tricks || []} players={players} />
      </div>

      <div className="finished-panel__actions">
        <button
          type="button"
          className="primary-btn"
          onClick={onNewSession}
          disabled={creating}
        >
          {creating ? t("common:creating_session") : t("common:create_session")}
        </button>
      </div>
    </section>
  );
}
