import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { login } from "../../queries/auth";
import AuthPageLayout from "../../components/shared/AuthPageLayout";

export default function Login() {
  const { t } = useTranslation(["auth", "errors"]);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      // If we landed on /login because a PrivateRoute redirected us, bounce
      // back to the intended destination. Otherwise go home.
      const dest =
        (location.state && location.state.from && location.state.from.pathname) || "/";
      navigate(dest, { replace: true });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      if (data.code === "email_not_verified") {
        navigate(
          `/verificar-email?email=${encodeURIComponent(data.email || email)}`,
          { replace: true }
        );
        return;
      }
      setError(data.message || t("auth:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageLayout
      title={t("auth:login_title")}
      footer={
        <p>
          {t("auth:no_account")} <Link to="/registro">{t("auth:register_link")}</Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <label>
          {t("auth:email_label")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
        </label>
        <label>
          {t("auth:password_label")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting}>
          {submitting ? t("auth:submitting") : t("auth:login_button")}
        </button>
      </form>
    </AuthPageLayout>
  );
}
