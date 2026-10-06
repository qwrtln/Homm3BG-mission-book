// Tier 2. The build shortcut (Ctrl/Cmd+Enter, Ctrl/Cmd+S): it works from
// anywhere in the workspace, never fires over a modal dialog or the welcome
// screen, never starts a second compile while one runs, and the four hint
// sites (the Build button's title, the empty and stale PDF texts, the Ready
// status) name it.

import type { Page } from "@playwright/test";
import { editorBox } from "../helpers/editor.ts";
import { chooseFromMenu, EMPTY_PDF_TEXT, engineCalls, expect, READY_STATUS, test } from "./fixtures.ts";

const SCENARIO_NAME = "shortcut probe";

/**
 * Starts a blank Clash scenario, landing in the workspace.
 */
async function openWorkspace(page: Page): Promise<void> {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(SCENARIO_NAME);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
}

/**
 * Leaves the workspace for the welcome screen, parking the open scenario
 * behind "Back to editing".
 */
async function parkScenario(page: Page): Promise<void> {
  await page.locator("#back-to-welcome").click();
  await expect(page.locator("#workspace")).toBeHidden();
  await expect(page.locator("#back-to-editing")).toBeVisible();
}

/**
 * Installs a keydown listener after the app's own, and reports whether the
 * next keydown it sees was already defaultPrevented when it ran.
 */
async function watchDefaultPrevented(page: Page): Promise<void> {
  await page.evaluate(() => {
    globalThis.__lastDefaultPrevented = null;
    document.addEventListener("keydown", (event: KeyboardEvent) => {
      globalThis.__lastDefaultPrevented = event.defaultPrevented;
    });
  });
}

/**
 */
async function lastDefaultPrevented(page: Page): Promise<boolean | null | undefined> {
  return page.evaluate(() => globalThis.__lastDefaultPrevented);
}

/**
 * The recorded compile calls so far.
 */
async function compileCalls(page: Page): Promise<unknown[]> {
  return (await engineCalls(page)).filter((call) => call.method === "LuaLatex.compile");
}

/**
 * Makes every stub compile hang until released. See texlyre-busytex-stub.js.
 */
async function holdCompiles(page: Page): Promise<void> {
  await page.evaluate(() => {
    globalThis.__stubCompileHold = new Promise(() => {});
  });
}

test.describe("Ctrl/Cmd+Enter and Ctrl/Cmd+S build from the workspace", () => {
  test("Ctrl+Enter with focus in the editor starts exactly one compile", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await editorBox(page).click();

    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#status-text")).toHaveText(/^Built /);
    expect(await compileCalls(page)).toHaveLength(1);
  });

  test("Ctrl+Enter with focus on the PDF pane starts exactly one compile", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await page.locator("#pdf-body").click();

    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#status-text")).toHaveText(/^Built /);
    expect(await compileCalls(page)).toHaveLength(1);
  });

  test("Ctrl+Enter with focus on the page body starts exactly one compile", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await page.evaluate(() => document.body.focus());

    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#status-text")).toHaveText(/^Built /);
    expect(await compileCalls(page)).toHaveLength(1);
  });

  test("Ctrl+S starts one compile and is default-prevented", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await watchDefaultPrevented(page);

    await page.keyboard.press("Control+S");
    await expect(page.locator("#status-text")).toHaveText(/^Built /);
    expect(await compileCalls(page)).toHaveLength(1);
    expect(await lastDefaultPrevented(page)).toBe(true);
  });

  test("a build key during a held build starts no second compile and does not stop it", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await holdCompiles(page);

    await page.keyboard.press("Control+Enter");
    await expect.poll(async () => (await compileCalls(page)).length).toBe(1);
    await expect(page.locator("#build")).toHaveText("Stop");

    await page.keyboard.press("Control+Enter");
    await page.keyboard.press("Control+S");
    expect(await compileCalls(page)).toHaveLength(1);
    await expect(page.locator("#build")).toHaveText("Stop");
  });

  test("with About open over the workspace, Ctrl+Enter starts no compile and Ctrl+S is still default-prevented", async ({
    app,
  }) => {
    const { page } = app;
    await openWorkspace(page);
    await chooseFromMenu(page, "about-open");
    await expect(page.locator("#about-dialog")).toBeVisible();
    await watchDefaultPrevented(page);

    await page.keyboard.press("Control+Enter");
    expect(await compileCalls(page)).toHaveLength(0);
    expect(await lastDefaultPrevented(page)).toBe(true);

    await page.keyboard.press("Control+S");
    expect(await compileCalls(page)).toHaveLength(0);
    expect(await lastDefaultPrevented(page)).toBe(true);
  });

  test("on the welcome screen, Ctrl+Enter starts no compile and Ctrl+S is not default-prevented", async ({ app }) => {
    const { page } = app;
    await watchDefaultPrevented(page);

    await page.keyboard.press("Control+Enter");
    expect(await compileCalls(page)).toHaveLength(0);

    await page.keyboard.press("Control+S");
    expect(await compileCalls(page)).toHaveLength(0);
    expect(await lastDefaultPrevented(page)).toBe(false);
  });

  test("on the welcome screen with a parked scenario, Ctrl+Enter starts no compile and Ctrl+S is not default-prevented", async ({
    app,
  }) => {
    const { page } = app;
    await openWorkspace(page);
    await parkScenario(page);
    await watchDefaultPrevented(page);

    await page.keyboard.press("Control+Enter");
    expect(await compileCalls(page)).toHaveLength(0);

    await page.keyboard.press("Control+S");
    expect(await compileCalls(page)).toHaveLength(0);
    expect(await lastDefaultPrevented(page)).toBe(false);
  });
});

test.describe("the build key is named where a contributor looks for it", () => {
  test("the Build button's idle title names the key", async ({ app }) => {
    const { page } = app;
    await expect(page.locator("#build")).toHaveAttribute("title", "Build PDF (Ctrl+Enter)");

    await openWorkspace(page);
    await expect(page.locator("#build")).toHaveAttribute("title", "Build PDF (Ctrl+Enter)");
  });

  test("the Stop title replaces the build key while a build runs", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await holdCompiles(page);

    await page.locator("#build").click();
    await expect.poll(async () => (await compileCalls(page)).length).toBe(1);
    await expect(page.locator("#build")).toHaveAttribute("title", "Stop the build");
  });

  test("the empty PDF text names the build key", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await expect(page.locator("#pdf-empty")).toHaveText(EMPTY_PDF_TEXT);
  });

  test("the Ready status names the build key", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
  });

  test("on macOS the Ready status names the Cmd key", async ({ app }) => {
    const { page } = app;
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
    });
    await page.reload();
    await page.locator("#scratch-clash").click();
    await page.locator("#scenario-name").fill(SCENARIO_NAME);
    await page.locator("#go").click();
    await expect(page.locator("#status-text")).toHaveText("Ready. Press Build PDF or ⌘↩ to start.");
  });

  test("the stale PDF status names the build key", async ({ app }) => {
    const { page } = app;
    await openWorkspace(page);
    await page.locator("#build").click();
    await expect(page.locator("#status-text")).toHaveText(/^Built /);

    await editorBox(page).click();
    await page.keyboard.type("x");
    await expect(page.locator("#status-text")).toHaveText(
      "Source changed since last build. Press Ctrl+Enter to rebuild.",
    );
  });
});
