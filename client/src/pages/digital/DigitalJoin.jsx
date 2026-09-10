import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { joinAsGuest } from "../../queries/sessions";
import { setGuestToken, getGuestToken } from "../../api/sessionStorage";

// The join landing for a digital player. Guest picks a nickname → server
// creates a seat + issues a guestToken → we save it locally and jump into
// the session.
export default function DigitalJoin() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // If we already have a guest token for this session, jump straight in.
  useEffect(() => {
    if (id && getGuestToken(id)) {
      navigate(`/sesion/${id}`, { replace: true });
    }
  }, [id, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!nickname.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const { guestToken } = await joinAsGuest({ sessionId: id, nickname: nickname.trim() });
      setGuestToken(id, guestToken);
      navigate(`/sesion/${id}`, { replace: true });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("game:join_generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t("common:app_name")}</h1>
        <h2 className="auth-subtitle">{t("game:join_title")}</h2>
        <div className="auth-body">
          <p className="auth-blurb">{t("game:join_blurb")}</p>
          <form onSubmit={onSubmit} noValidate>
            <label>
              {t("game:nickname_label")}
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                minLength={1}
                maxLength={20}
                autoComplete="nickname"
                autoFocus
              />
            </label>
            {error ? (
              <p role="alert" className="form-error">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={submitting || !nickname.trim()}>
              {submitting ? t("game:joining") : t("game:join_button")}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
