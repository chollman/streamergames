const i18next = require("i18next");
const middleware = require("i18next-http-middleware");

// Constitution §2: server strings go through i18n keys in both es and en.
// Resources are required (not fs-loaded) so tests don't need filesystem
// setup and hot-reload works cleanly in dev.
const resources = {
  es: {
    common: require("./resources/es/common.json"),
    errors: require("./resources/es/errors.json"),
  },
  en: {
    common: require("./resources/en/common.json"),
    errors: require("./resources/en/errors.json"),
  },
};

i18next.use(middleware.LanguageDetector).init({
  fallbackLng: "es",
  resources,
  ns: ["common", "errors"],
  defaultNS: "common",
  detection: {
    order: ["header"],
    caches: false,
  },
});

module.exports = { i18next, handler: middleware.handle(i18next) };
