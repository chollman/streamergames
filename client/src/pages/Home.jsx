import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { logout } from "../queries/auth";

// Placeholder authed landing for F1e.2. F1e.3 replaces this with the real
// streamer dashboard (create session, cola de asientos, gestión de canal).
export default function Home() {
  const { t } = useTranslation();
  const user = useSelector((s) => s.auth.user);
  const channel = useSelector((s) => s.auth.channel);

  return (
    <main className="home-page">
      <h1>
        {t("common:hello_name", { name: (user && user.displayName) || "" })}
      </h1>
      {channel ? (
        <p>{t("common:your_channel", { slug: channel.slug })}</p>
      ) : null}
      <p className="muted">{t("common:home_coming_soon")}</p>
      <button type="button" onClick={logout}>
        {t("common:logout")}
      </button>
    </main>
  );
}
