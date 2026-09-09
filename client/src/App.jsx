import { useTranslation } from "react-i18next";

export default function App() {
  const { t } = useTranslation();
  return (
    <main style={{ padding: "2rem" }}>
      <h1>{t("common:app_name")}</h1>
      <p>{t("common:coming_soon")}</p>
    </main>
  );
}
