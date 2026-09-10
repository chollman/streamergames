import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import esCommon from "./resources/es/common.json";
import enCommon from "./resources/en/common.json";
import esErrors from "./resources/es/errors.json";
import enErrors from "./resources/en/errors.json";
import esAuth from "./resources/es/auth.json";
import enAuth from "./resources/en/auth.json";
import esGame from "./resources/es/game.json";
import enGame from "./resources/en/game.json";

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
    es: { common: esCommon, errors: esErrors, auth: esAuth, game: esGame },
    en: { common: enCommon, errors: enErrors, auth: enAuth, game: enGame },
  },
  lng: stored === "en" ? "en" : "es",
  fallbackLng: "es",
  ns: ["common", "errors", "auth", "game"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
