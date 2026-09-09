import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import esCommon from "./resources/es/common.json";
import enCommon from "./resources/en/common.json";
import esErrors from "./resources/es/errors.json";
import enErrors from "./resources/en/errors.json";

// Language: pre-hydration script in index.html already set <html lang>, but
// i18n needs an explicit init.lng because it doesn't read the attribute itself.
const stored = (() => {
  try {
    return localStorage.getItem("streamergames_language");
  } catch {
    return null;
  }
})();

i18n.use(initReactI18next).init({
  resources: {
    es: { common: esCommon, errors: esErrors },
    en: { common: enCommon, errors: enErrors },
  },
  lng: stored === "en" ? "en" : "es",
  fallbackLng: "es",
  ns: ["common", "errors"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
