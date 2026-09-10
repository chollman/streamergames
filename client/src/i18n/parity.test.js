import { describe, it, expect } from "vitest";
import esCommon from "./resources/es/common.json";
import enCommon from "./resources/en/common.json";
import esErrors from "./resources/es/errors.json";
import enErrors from "./resources/en/errors.json";
import esAuth from "./resources/es/auth.json";
import enAuth from "./resources/en/auth.json";

function flatKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return flatKeys(v, path);
    }
    return [path];
  });
}

describe("i18n resource parity", () => {
  it.each([
    ["common", esCommon, enCommon],
    ["errors", esErrors, enErrors],
    ["auth", esAuth, enAuth],
  ])("es and en have the same keys for %s", (_ns, es, en) => {
    const esKeys = new Set(flatKeys(es));
    const enKeys = new Set(flatKeys(en));
    const missingInEn = [...esKeys].filter((k) => !enKeys.has(k));
    const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
    expect(missingInEn).toEqual([]);
    expect(missingInEs).toEqual([]);
  });
});
