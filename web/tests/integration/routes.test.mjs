// Tier 2. URL awareness: "#/drafts/<name>" reopens a local autosave, an
// address that matches nothing is dropped, and opening a scenario writes its
// address. Signed out, so only local autosaves can match.

import { test, expect } from "./fixtures.mjs";

const DRAFT_PATH = "draft-scenarios/clash/route_probe.tex";
const DRAFT_TEXT = "% route probe draft\n";

test("a drafts address reopens the local autosave", async ({ app }) => {
  const { page } = app;
  await page.evaluate(([path, text]) => {
    localStorage.setItem(`wasm-scenario-builder:draft:${path}`, text);
  }, [DRAFT_PATH, DRAFT_TEXT]);
  await page.goto("/web/app/#/drafts/clash/route_probe");
  await page.reload();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#welcome")).toBeHidden();
  const value = await page.evaluate(() => /** @type {any} */ (document.querySelector(".CodeMirror")).CodeMirror.getValue());
  expect(value).toBe(DRAFT_TEXT);
  expect(new URL(page.url()).hash).toBe("#/drafts/clash/route_probe");
});

test("the same file name in another category is a different address", async ({ app }) => {
  const { page } = app;
  await page.evaluate(([path, text]) => {
    localStorage.setItem(`wasm-scenario-builder:draft:${path}`, text);
  }, [DRAFT_PATH, DRAFT_TEXT]);
  await page.goto("/web/app/#/drafts/coops/route_probe");
  await page.reload();

  await expect(page.locator("#welcome")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
});

test("an address that matches nothing is dropped", async ({ app }) => {
  const { page } = app;
  await page.goto("/web/app/#/drafts/clash/does_not_exist");
  await page.reload();

  await expect(page.locator("#welcome")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
});

test("an updates address is dropped when signed out", async ({ app }) => {
  const { page } = app;
  await page.goto("/web/app/#/updates/clash/gold_rush");
  await page.reload();

  await expect(page.locator("#welcome")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
});

test("starting a new scenario writes its address", async ({ app }) => {
  const { page } = app;
  await page.locator('[data-category="clash"]').click();
  await page.locator("#scenario-name").fill("Route Probe");
  await page.locator("#go").click();

  await expect(page.locator("#workspace")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("#/drafts/clash/route_probe");
});
