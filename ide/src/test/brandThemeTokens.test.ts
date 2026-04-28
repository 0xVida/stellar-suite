import { describe, expect, it } from "vitest";

import {
  applyBrandThemeTokens,
  type BrandThemeTokens,
} from "@/store/useUserSettingsStore";

describe("brand theme token application", () => {
  it("applies core theme variables to :root", () => {
    const tokens: BrandThemeTokens = {
      primary: { h: 14, s: 80, l: 52 },
      secondary: { h: 188, s: 24, l: 40 },
      background: { h: 205, s: 30, l: 12 },
    };

    applyBrandThemeTokens(tokens);

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--primary")).toBe("14 80% 52%");
    expect(root.style.getPropertyValue("--secondary")).toBe("188 24% 40%");
    expect(root.style.getPropertyValue("--background")).toBe("205 30% 12%");
    expect(root.style.getPropertyValue("--ring")).toBe("14 80% 52%");
    expect(root.style.getPropertyValue("--card")).not.toBe("");
    expect(root.style.getPropertyValue("--foreground")).not.toBe("");
  });
});
