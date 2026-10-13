// Tier 2 helpers shared by the specs that drive the workspace. Not a test file:
// the name does not match `*.test.ts`, so Playwright does not run it.

import type { Page, Route } from "@playwright/test";
import { expect, openScenarioList, READY_STATUS } from "./fixtures.ts";

// Long enough to pass scenario-name.ts's MIN_SCENARIO_NAME_LENGTH, and not a real scenario
// name: commitEntry uses it as the file's own identity, never the entry's.
export const SCENARIO_NAME = "tier two probe";

// Chromium logs a console error for a request Playwright's interception
// blocked. Only the block below can produce this exact text — neither the app
// nor the static server can — so it is the one line dropped before a test
// asserts the page stayed clean.
const BLOCKED_BY_TEST = "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector";

/**
 * Blocks the published-PDF prefetch.
 *
 * picker.ts prefetches https://raw.githubusercontent.com/... for every real
 * entry, and that host is outside installGithubStub's api.github.com match.
 * Left alone, a test would reach the real network and depend on whether that
 * scenario's branch happens to carry a PDF — which is what decides whether
 * the PDF pane starts empty. A blocked fetch is the "no published PDF" case
 * the app already handles: prefetchScenario catches it and returns null,
 * commitEntry calls clearPdf(), and the pane keeps its empty state.
 *
 * @param page
 */
export async function blockPublishedPdf(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname === "raw.githubusercontent.com",
    (route: Route) => route.abort("blockedbyclient"),
  );
}

/**
 * The page errors the app itself is responsible for.
 *
 * @param errors every console error and page error seen so far
 */
export function appErrors(errors: string[]): string[] {
  return errors.filter((message) => message !== BLOCKED_BY_TEST);
}

/**
 * Walks the welcome screen into the workspace: pick the first offered
 * scenario, name it, press "Let's go!".
 *
 * Never asserts *which* scenario — it reads the row the app rendered and
 * carries that title forward, so writing a new scenario cannot break this.
 *
 * @param page
 */
export async function enterWorkspace(page: Page): Promise<string> {
  await blockPublishedPdf(page);

  const results = await openScenarioList(page);
  const first = results.first();
  const title = ((await first.textContent()) as string).trim();
  // click() dispatches a real mousedown, which is what SearchCombobox.tsx listens for.
  await first.click();
  await expect(page.locator("#search")).toHaveValue(title);

  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await expect(page.locator("#go")).toBeEnabled();
  await page.locator("#go").click();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#header-actions")).toBeVisible();
  // commitEntry writes this last, after the prefetch it awaits has settled,
  // so it is the one point at which the workspace is fully settled.
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
  return title;
}

/**
 * Makes every stub compile fail with a LuaLaTeX-style log whose one error
 * sits on `line` of whichever file `inside` names: "scenario" is the file the
 * build staged from the editor, read back from the generated structure.tex.
 *
 * @param page
 * @param error
 */
export async function failCompiles(page: Page, error: { line: number; inside: "scenario" | "macros" }): Promise<void> {
  await page.evaluate(({ line, inside }: { line: number; inside: string }) => {
    globalThis.__stubCompileResult = (options) => {
      const structure = options.additionalFiles.find((file) => file.path === "structure.tex");
      const text = typeof structure?.content === "string" ? structure.content : "";
      const scenario = /\\include\{([^}]+)\}/.exec(text)?.[1];
      // Fail here, by name, rather than later as "no jump button" with a log naming ./undefined.
      if (scenario === undefined) throw new Error("failCompiles: no \\include in the staged structure.tex");
      const opened = inside === "scenario" ? `(./${scenario}` : `(./${scenario} (./sections/macros.tex`;
      return {
        success: false,
        pdf: null,
        synctex: null,
        log: ["(./main_en.tex (./structure.tex", opened, "! Undefined control sequence.", `l.${line} \\foo`].join("\n"),
        exitCode: 1,
        logs: [],
      };
    };
  }, error);
}
