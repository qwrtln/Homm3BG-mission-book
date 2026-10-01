// Tier 2. The overflow menu's Send feedback item: it opens a dialog that
// links to a new GitHub issue, to the Discord server and to a BoardGameGeek
// thread, all in a new tab.

import { chooseFromMenu, expect, test } from "./fixtures.mjs";

/** Each feedback link, by id, with its expected text and href. */
const LINKS = {
  "feedback-github": {
    text: "Open an issue on GitHub",
    href: "https://github.com/qwrtln/Homm3BG-mission-book/issues/new?template=bug_report.md",
  },
  "feedback-discord": {
    text: "Chat on Discord",
    href: "https://discord.gg/nMbawQkj9R",
  },
  "feedback-bgg": {
    text: "Discuss on BoardGameGeek",
    href: "https://boardgamegeek.com/thread/3775763/the-fan-made-mission-book-20-and-the-scenario-buil",
  },
};

/**
 * Opens the Send feedback dialog from the overflow menu.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<import("@playwright/test").Locator>} the dialog
 */
async function openFeedback(page) {
  await chooseFromMenu(page, "feedback-open");
  const dialog = page.getByRole("dialog", { name: "Send feedback" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Send feedback opens a dialog naming it", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openFeedback(page);
  await expect(dialog.locator("#feedback-title")).toHaveText("Send feedback");
  expect(errors).toEqual([]);
});

test("each link opens in a new tab with the exact href", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openFeedback(page);

  for (const [id, { text, href }] of Object.entries(LINKS)) {
    const link = dialog.locator(`#${id}`);
    await expect(link).toHaveText(text);
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
  }
  expect(errors).toEqual([]);
});

test("Close hides the dialog and returns focus to the menu toggle", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openFeedback(page);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#header-menu-toggle")).toBeFocused();
  expect(errors).toEqual([]);
});

test("clicking a link closes the dialog", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openFeedback(page);

  // target="_blank" opens a new tab in this context. Abort its request, so
  // the test stays off the real network, then close the tab.
  await page.context().route("https://github.com/**", (route) => route.abort());
  const popup = page.waitForEvent("popup");
  await dialog.locator("#feedback-github").click();
  await (await popup).close();

  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("clicking the BoardGameGeek link closes the dialog", async ({ app }) => {
  const { page, errors } = app;
  const dialog = await openFeedback(page);

  // target="_blank" opens a new tab in this context. Abort its request, so
  // the test stays off the real network, then close the tab.
  await page.context().route("https://boardgamegeek.com/**", (route) => route.abort());
  const popup = page.waitForEvent("popup");
  await dialog.locator("#feedback-bgg").click();
  await (await popup).close();

  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("Send feedback comes before the separator, so it shows while signed out", async ({ app }) => {
  const { page, errors } = app;
  await page.locator("#header-menu-toggle").click();
  await expect(page.locator("#github-signout")).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Send feedback" })).toBeVisible();

  // Keyboard: Dark mode first, About next, Send feedback after that.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Send feedback" })).toBeFocused();
  expect(errors).toEqual([]);
});
