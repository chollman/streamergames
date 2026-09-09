import { describe, it, expect, beforeEach, afterEach } from "vitest";
import i18n from "../i18n";
import { getLocale, formatNumber, formatDate } from "./locale";

describe("locale", () => {
  beforeEach(() => {
    i18n.changeLanguage("es");
  });

  afterEach(() => {
    i18n.changeLanguage("es");
  });

  it("getLocale returns es-AR when the language is es", () => {
    expect(getLocale()).toBe("es-AR");
  });

  it("getLocale returns en-US when the language is en", () => {
    i18n.changeLanguage("en");
    expect(getLocale()).toBe("en-US");
  });

  it("formatNumber uses the active locale", () => {
    // es-AR uses "." as thousands separator; en-US uses ","
    expect(formatNumber(1234)).toBe("1.234");
    i18n.changeLanguage("en");
    expect(formatNumber(1234)).toBe("1,234");
  });

  it("formatDate returns a non-empty string for a valid date", () => {
    const out = formatDate("2026-09-09");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
