// Tier 2. The visual gate for the workspace: each state, in both themes, at a
// desktop and a phone width. The assertions are about layout and tokens, not
// pixel baselines. With CAPTURE_WORKSPACE set, each cell also writes a PNG for a
// human to review: CAPTURE_WORKSPACE=<dir> writes to that directory (relative to
// the working directory), CAPTURE_WORKSPACE=1 to web/test-results/workspace-states/,
// which Playwright empties at the start of the next run. Without it the spec
// writes nothing.
//
// The hover cell is not captured: a hover is not a stable screenshot.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { editorBox, focusEditor, markedLines } from "../helpers/editor.ts";
import { EMPTY_PDF_TEXT, expect, test } from "./fixtures.ts";
import { appErrors, enterWorkspace, failCompiles } from "./workspace.ts";

const THEME_KEY = "wasm-scenario-builder:theme";
const CAPTURE = process.env.CAPTURE_WORKSPACE;
const SCREENS =
  CAPTURE === "1" ? resolve(import.meta.dirname, "../../test-results/workspace-states") : resolve(CAPTURE ?? ".");

const THEMES = ["light", "dark"] as const;
const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 412, height: 915 },
] as const;

// The @theme scale in styles/app.css, in px at a 16px root.
const SCALE_PX = {
  code: 12,
  editor: 13,
  small: 0.85 * 16,
  ui: 0.88 * 16,
  body: 0.95 * 16,
  heading: 1.1 * 16,
  title: 1.3 * 16,
  icon: 16,
};

type State = (page: Page) => Promise<void>;

/** Presses Build and waits for the built pages. */
async function buildPdf(page: Page): Promise<void> {
  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText(/^Built /);
  await expect(page.locator("#pdf-body canvas.pdf-page")).toHaveCount(3);
}

/** Presses Build against a failing engine and waits for the error. */
async function buildFailing(page: Page, inside: "scenario" | "macros"): Promise<void> {
  await failCompiles(page, { line: 3, inside });
  await page.locator("#build").click();
  await expect(page.locator("#status-text")).toHaveText("Build failed.");
  await expect(page.locator("#first-error")).toBeVisible();
}

const STATES: Record<string, State> = {
  empty: async (page) => {
    await expect(page.locator("#pdf-empty")).toHaveText(EMPTY_PDF_TEXT);
  },
  loading: async (page) => {
    // A compile that never answers keeps the pane on its loading state.
    await page.evaluate(() => {
      globalThis.__stubCompileHold = new Promise(() => {});
    });
    await page.locator("#build").click();
    await expect(page.locator(".empty-pdf.loading")).toBeVisible();
  },
  default: buildPdf,
  "error-line": async (page) => {
    await buildFailing(page, "scenario");
    await expect(page.locator("#first-error button.error-jump")).toHaveText(/^Line 3! /);
    expect(await markedLines(page)).toEqual([3]);
    // The cue is not the colour alone: the marked line's gutter element carries the class.
    const gutter = page.locator(".cm-gutterElement.build-error-gutter");
    await expect(gutter).toHaveCount(1);
    await expect(gutter).toHaveText("3");
  },
  "error-no-line": async (page) => {
    await buildFailing(page, "macros");
    await expect(page.locator("#first-error button")).toHaveCount(0);
  },
  "editor-focused": async (page) => {
    const editor = page.locator(".cm-editor");
    // The ring is an overlay above the gutter, not an outline, which the gutter would cover.
    const outline = () => editor.evaluate((node) => getComputedStyle(node, "::after").borderLeftStyle);
    // The workspace opens with the editor focused; start from a blur.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // CodeMirror toggles cm-focused 10 ms after the focus event, so poll.
    await expect.poll(outline, "the editor keeps its ring after blur").toBe("none");
    await focusEditor(page);
    await expect(editorBox(page)).toBeFocused();
    await expect.poll(outline, "the focused editor shows no ring").toBe("solid");
  },
  disabled: async (page) => {
    await buildPdf(page);
    const zoomOut = page.locator("#pdf-zoom-out");
    for (let i = 0; i < 3; i += 1) await zoomOut.click();
    await expect(page.locator("#pdf-zoom-level")).toHaveText("50%");
    await expect(zoomOut).toBeDisabled();
  },
};

/**
 * The facts every cell holds.
 *
 * @param page
 * @param width the viewport width in px
 */
async function assertContract(page: Page, width: number): Promise<void> {
  if (width <= 412) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
  }

  const sizes = await page.evaluate(() => {
    const seen: { where: string; size: number }[] = [];
    for (const node of document.querySelectorAll("#workspace, #workspace *")) {
      // A container's size is only inherited by what it holds (the body's 15px base is no step on
      // the scale), so the check reads the elements that draw text themselves.
      const draws = [...node.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
      );
      if (!draws) continue;
      const size = Number.parseFloat(getComputedStyle(node).fontSize);
      const id = node.id ? `#${node.id}` : "";
      const classes = typeof node.className === "string" && node.className ? `.${node.className.split(" ")[0]}` : "";
      seen.push({ where: `${node.tagName.toLowerCase()}${id}${classes}`, size });
    }
    return seen;
  });
  const steps = Object.values(SCALE_PX);
  const strays = sizes.filter(({ size }) => !steps.some((step) => Math.abs(step - size) < 0.01));
  expect(strays, "font sizes off the type scale").toEqual([]);

  const { editorBackground, paneBackground, content, ink } = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--ink)";
    document.body.append(probe);
    const ink = getComputedStyle(probe).color;
    probe.remove();
    return {
      editorBackground: getComputedStyle(document.querySelector(".cm-editor") as Element).backgroundColor,
      paneBackground: getComputedStyle(document.querySelector("#editor-pane") as Element).backgroundColor,
      content: getComputedStyle(document.querySelector(".cm-content") as Element).color,
      ink,
    };
  });
  expect(editorBackground, "the editor background differs from its pane").toBe(paneBackground);
  expect(content, "the editor text is not --ink").toBe(ink);
}

for (const [name, reach] of Object.entries(STATES)) {
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      test(`workspace ${name}, ${theme}, ${size.width}px`, async ({ app }) => {
        const { page, errors } = app;
        await page.setViewportSize(size);
        await page.evaluate(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, theme]);
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        await enterWorkspace(page);
        await reach(page);
        await assertContract(page, size.width);

        if (CAPTURE) {
          mkdirSync(SCREENS, { recursive: true });
          await page.screenshot({ path: resolve(SCREENS, `${name}-${theme}-${size.width}.png`) });
        }
        // A held compile ends with the page; the blocked prefetch is the one expected error.
        expect(appErrors(errors), "the page reported errors").toEqual([]);
      });
    }
  }
}
