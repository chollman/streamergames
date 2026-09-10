import { useTranslation } from "react-i18next";

// Shared shell for the three auth pages: centered card with a title and
// slot for the form. Keeps visual consistency without pulling in the
// full app layout (which requires auth).
export default function AuthPageLayout({ title, children, footer }) {
  const { t } = useTranslation();
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t("common:app_name")}</h1>
        <h2 className="auth-subtitle">{title}</h2>
        <div className="auth-body">{children}</div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </div>
    </main>
  );
}
