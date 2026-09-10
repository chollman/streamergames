import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { register } from "../../queries/auth";
import AuthPageLayout from "../../components/shared/AuthPageLayout";

export default function Register() {
  const { t } = useTranslation(["auth", "errors"]);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ email, password, displayName });
      navigate(`/verificar-email?email=${encodeURIComponent(email)}`, {
        replace: true,
      });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("auth:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageLayout
      title={t("auth:register_title")}
      footer={
        <p>
          {t("auth:has_account")} <Link to="/login">{t("auth:login_link")}</Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <label>
          {t("auth:display_name_label")}
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            autoFocus
          />
        </label>
        <label>
          {t("auth:email_label")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          {t("auth:password_label")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <small>{t("auth:password_hint")}</small>
        </label>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting}>
          {submitting ? t("auth:submitting") : t("auth:register_button")}
        </button>
      </form>
    </AuthPageLayout>
  );
}
