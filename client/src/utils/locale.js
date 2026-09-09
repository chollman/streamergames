import i18n from "../i18n";

// Constitution §2: never hardcode "es-AR" or a raw Intl call — go through here.
export function getLocale() {
  return i18n.language === "en" ? "en-US" : "es-AR";
}

export function formatNumber(n, options = {}) {
  return new Intl.NumberFormat(getLocale(), options).format(n);
}

export function formatDate(date, options = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(getLocale(), options).format(new Date(date));
}

export function formatTime(date, options = { timeStyle: "short" }) {
  return new Intl.DateTimeFormat(getLocale(), options).format(new Date(date));
}
