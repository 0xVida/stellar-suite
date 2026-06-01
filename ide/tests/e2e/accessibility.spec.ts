import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Automated WCAG accessibility compliance audits (issue #884).
 *
 * Runs the axe-core engine against the IDE's principal pages across both
 * colour themes and a representative set of viewports. The suite fails the
 * build if any *critical* accessibility violation is detected, keeping the
 * IDE usable for everyone and free of a11y regressions.
 *
 * Run with: `npm run test:a11y`
 */

type Theme = "light" | "dark";

/** Principal pages of the IDE that should always be accessible. */
const PRINCIPAL_PAGES = [
  { name: "ide-layout", path: "/qa/layout" },
  { name: "rpc-health", path: "/rpc-health" },
  { name: "fee-market", path: "/fee-test" },
] as const;

/** Comprehensive viewport coverage: mobile, tablet, laptop and wide desktop. */
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
] as const;

const THEMES: Theme[] = ["light", "dark"];

// WCAG 2.0 / 2.1 levels A and AA — the standard compliance baseline.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Prepare the browser so the page renders deterministically:
 *  - pin the colour theme (next-themes reads the `theme` localStorage key),
 *  - dismiss the mobile "desktop recommended" gatekeeper so the real layout
 *    is audited at small viewports instead of the warning overlay.
 */
async function applyTheme(page: Page, theme: Theme) {
  await page.addInitScript((selectedTheme) => {
    try {
      window.localStorage.setItem("theme", selectedTheme);
      window.localStorage.setItem("mobile-warning-dismissed", "true");
    } catch {
      /* localStorage may be unavailable — ignore */
    }
  }, theme);
}

/** Run an axe audit and return only the violations marked as `critical`. */
async function auditCriticalViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();

  const critical = results.violations.filter((v) => v.impact === "critical");

  if (results.violations.length > 0) {
    // Surface every violation (not just critical ones) for debugging.
    const summary = results.violations
      .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join("\n");
    console.log(`\naxe-core findings:\n${summary}\n`);
  }

  return critical;
}

test.describe("WCAG accessibility compliance", () => {
  for (const theme of THEMES) {
    for (const pageDef of PRINCIPAL_PAGES) {
      for (const viewport of VIEWPORTS) {
        test(`${pageDef.name} has zero critical violations [${theme}, ${viewport.name}]`, async ({
          page,
        }) => {
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await applyTheme(page, theme);

          // Some principal pages poll the network continuously, so wait for
          // the DOM/JS rather than `networkidle`, then for a rendered landmark.
          await page.goto(pageDef.path, { waitUntil: "domcontentloaded" });
          await page
            .locator("h1, h2, [data-testid='qa-layout-shell']")
            .first()
            .waitFor({ state: "visible" });

          // Confirm the documented theme actually took effect before auditing.
          const isDark = await page.evaluate(() =>
            document.documentElement.classList.contains("dark"),
          );
          expect(isDark).toBe(theme === "dark");

          const critical = await auditCriticalViolations(page);

          expect(
            critical,
            critical.length > 0
              ? `Critical a11y violations: ${critical
                  .map((v) => v.id)
                  .join(", ")}`
              : undefined,
          ).toEqual([]);
        });
      }
    }
  }
});
