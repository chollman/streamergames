import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { verifyEmail } from "../../queries/auth";
import AuthPageLayout from "../../components/shared/AuthPageLayout";

export default function VerifyEmail() {
  const { t } = useTranslation(["auth", "errors"]);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const emailFromQuery = params.get("email") || "";
  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // verifyEmail dispatches setAuth on success (see queries/auth.js).
      await verifyEmail({ email, code });
      navigate("/", { replace: true });
    } catch (err) {
      const data = (err && err.response && err.response.data) || {};
      setError(data.message || t("auth:generic_error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageLayout
      title={t("auth:verify_title")}
      footer={
        <p>
          <Link to="/login">{t("auth:back_to_login")}</Link>
        </p>
      }
    >
      <p className="auth-blurb">{t("auth:verify_blurb")}</p>
      <form onSubmit={onSubmit} noValidate>
        <label>
          {t("auth:email_label")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            readOnly={!!emailFromQuery}
          />
        </label>
        <label>
          {t("auth:code_label")}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            autoComplete="one-time-code"
            autoFocus
          />
        </label>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting || code.length !== 6}>
          {submitting ? t("auth:submitting") : t("auth:verify_button")}
        </button>
      </form>
    </AuthPageLayout>
  );
}
