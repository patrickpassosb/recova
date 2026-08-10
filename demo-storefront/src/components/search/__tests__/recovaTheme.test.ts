import { describe, it, expect } from "bun:test";
import {
  recovaDefaultTheme,
  amazonWhiteLabelTheme,
  resolveTheme,
  themeToCssVars,
} from "../recovaTheme.ts";

describe("recovaTheme resolveTheme", () => {
  it("returns the default theme when no config given", () => {
    expect(resolveTheme()).toEqual(recovaDefaultTheme);
  });

  it("deep-merges colors over the default", () => {
    const theme = resolveTheme({ colors: { ...recovaDefaultTheme.colors, primary: "#000000" } });
    expect(theme.colors.primary).toBe("#000000");
    // untouched colors stay default
    expect(theme.colors.success).toBe(recovaDefaultTheme.colors.success);
  });

  it("deep-merges fonts over the default", () => {
    const theme = resolveTheme({
      fonts: { ...recovaDefaultTheme.fonts, display: "Comic Sans MS" },
    });
    expect(theme.fonts.display).toBe("Comic Sans MS");
    expect(theme.fonts.body).toBe(recovaDefaultTheme.fonts.body);
  });

  it("deep-merges copy over the default", () => {
    const theme = resolveTheme({ copy: { ...recovaDefaultTheme.copy, send: "OK" } });
    expect(theme.copy.send).toBe("OK");
    expect(theme.copy.buy).toBe(recovaDefaultTheme.copy.buy);
  });

  it("top-level overrides win", () => {
    const theme = resolveTheme({ brandName: "Amazon" });
    expect(theme.brandName).toBe("Amazon");
  });

  it("empty config returns the default", () => {
    expect(resolveTheme({})).toEqual(recovaDefaultTheme);
  });
});

describe("recovaTheme themeToCssVars", () => {
  it("produces a variable for every color and font", () => {
    const vars = themeToCssVars(recovaDefaultTheme);
    expect(vars["--recova-primary"]).toBe(recovaDefaultTheme.colors.primary);
    expect(vars["--recova-font-display"]).toBe(recovaDefaultTheme.fonts.display);
    expect(vars["--recova-font-body"]).toBe(recovaDefaultTheme.fonts.body);
    expect(vars["--recova-success"]).toBe(recovaDefaultTheme.colors.success);
  });

  it("reflects resolved overrides", () => {
    const vars = themeToCssVars(
      resolveTheme({ colors: { ...recovaDefaultTheme.colors, primary: "#FF9900" } }),
    );
    expect(vars["--recova-primary"]).toBe("#FF9900");
  });
});

describe("recovaTheme white-label", () => {
  it("amazon theme strips Recova branding", () => {
    expect(amazonWhiteLabelTheme.showRecovaBranding).toBe(false);
    expect(amazonWhiteLabelTheme.brandName).toBe("Amazon");
  });
});
