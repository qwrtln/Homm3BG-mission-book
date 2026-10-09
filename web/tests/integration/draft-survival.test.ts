// Tier 2. Risk #1 of context/foundation/test-plan.md: a contributor loses
// unsaved work after a browser crash, a tab restore or the sign-in redirect.
//
// Each test asserts what the user sees after the restore: editor text, upload
// cards, the "Local draft" badge. A storage write alone is never the pass
// condition.
//
// Oracle rule: every expected value comes from what the test typed or staged
// (literal strings, file names), never from app constants or from reading the
// record back. readLocalRecord is a sync gate before the crash, not an assertion.

import type { Page } from "@playwright/test";
import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../../shared/github-contrib.ts";
import { editorBox, editorText } from "../helpers/editor.ts";
import { breakIndexedDb, crashAndRelaunch } from "../helpers/fresh-context.ts";
import { seedLocalRecord } from "../helpers/local-store.ts";
import { expect, type GithubRoute, READY_STATUS, test } from "./fixtures.ts";

const LOGIN = "octotester";
const RELAY = "https://mission-book-oauth-relay.pages.dev/**";
const FORK_PATH = `/repos/${LOGIN}/${UPSTREAM_REPO}`;

/** See routes() in recovery.test.ts: Playwright needs the list wrapped as an option tuple. */
function routes(list: GithubRoute[]): [GithubRoute[], { scope: "test" }] {
  return [list, { option: true } as unknown as { scope: "test" }];
}

/** The calls the app makes after a sign-in, for a user with a fork and no branches. */
const MEMBER_ROUTES: GithubRoute[] = [
  { method: "GET", path: "/user", body: { login: LOGIN } },
  {
    method: "GET",
    path: `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`,
    body: {
      name: UPSTREAM_REPO,
      owner: { login: UPSTREAM_OWNER },
      default_branch: "main",
      permissions: { push: false },
    },
  },
  {
    method: "GET",
    path: FORK_PATH,
    body: { name: UPSTREAM_REPO, owner: { login: LOGIN }, default_branch: "main", permissions: { push: true } },
  },
  { method: "GET", path: `${FORK_PATH}/branches`, body: [] },
  { method: "POST", path: `${FORK_PATH}/git/refs`, status: 422, body: { message: "Object does not exist" } },
];

/**
 * Opens a blank Clash scenario from the welcome screen's "Start blank"
 * option, under the given name.
 *
 * @param page
 * @param name
 */
async function openBlankClash(page: Page, name: string): Promise<void> {
  await page.locator("#scratch-clash").click();
  await page.locator("#scenario-name").fill(name);
  await page.locator("#go").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#status-text")).toHaveText(READY_STATUS);
}

/**
 * @param page
 * @returns state.chosenPath, which must not be null here
 */
async function chosenPath(page: Page): Promise<string> {
  return page.evaluate(() => {
    const state = globalThis.__state!;
    if (state.chosenPath === null) throw new Error("no scenario is open");
    return state.chosenPath;
  });
}

/**
 * The local-store record for a path, read through the app's __localStore hook,
 * with each upload's bytes reduced to a length. A sync gate only.
 *
 * @param page
 * @param path
 */
async function readLocalRecord(
  page: Page,
  path: string,
): Promise<{ text: string | null; uploads: { path: string; length: number }[] | null }> {
  return page.evaluate(async (p) => {
    const { loadRecord } = globalThis.__localStore!;
    const record = await loadRecord(p);
    return {
      text: record.text,
      uploads: record.uploads ? record.uploads.map((u) => ({ path: u.path, length: u.bytes.byteLength })) : null,
    };
  }, path);
}

function fakeImage(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "image/png", buffer: Buffer.from("not really an image") };
}

/**
 * Types a line into the editor, stages a header image and waits until the
 * local backup holds both.
 *
 * @param page
 * @param path the scenario's chosen path, the record key
 * @param line the text to type
 * @returns the editor text after typing
 */
async function typeAndStageHeader(page: Page, path: string, line: string): Promise<string> {
  await editorBox(page).click();
  await page.keyboard.type(line);
  const typed = await editorText(page);
  await page.locator("#upload-open").click();
  await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
  await expect(page.locator("#upload-header-card")).toBeVisible();

  // Sync gate: the backup has had its chance. Not an assertion.
  await expect
    .poll(async () => {
      const record = await readLocalRecord(page, path);
      return record.text === typed && (record.uploads?.length ?? 0) === 1;
    })
    .toBe(true);
  return typed;
}

test("a crash after typing and staging a header comes back through the welcome list", async ({
  browser,
  app,
  githubRoutes,
}, testInfo) => {
  const { page } = app;
  await openBlankClash(page, "Crash Welcome Probe");
  const path = await chosenPath(page);

  const typed = await typeAndStageHeader(page, path, "% crash marker 7f3a\n");

  const next = await crashAndRelaunch(browser, page, githubRoutes, testInfo);
  try {
    const b = next.page;
    await b.goto("/web/app/");

    const row = b.locator("#resume-list .combobox-item");
    await expect(row).toBeVisible();
    await expect(row).toContainText("Local draft");
    await row.click();

    await expect(b.locator("#workspace")).toBeVisible();
    await expect.poll(() => editorText(b)).toBe(typed);
    await expect(b.locator("#draft-note")).toBeVisible();
    await expect(b).toHaveURL(/#\/drafts\/clash\/crash_welcome_probe$/);

    await b.locator("#upload-open").click();
    await expect(b.locator("#upload-header-card")).toBeVisible();
    // The restore keeps the staged bytes under the target name; the picked
    // file name ("header.png") is not stored, so the card names the target.
    await expect(b.locator("#upload-header-card")).toContainText("crash_welcome_probe.png");

    expect(next.errors).toEqual([]);
  } finally {
    await next.context.close();
  }
});

test("a crash then a tab restore of the draft address reopens the draft", async ({
  browser,
  app,
  githubRoutes,
}, testInfo) => {
  const { page } = app;
  await openBlankClash(page, "Crash Tab Probe");
  const path = await chosenPath(page);
  const typed = await typeAndStageHeader(page, path, "% tab restore marker 41c9\n");

  const next = await crashAndRelaunch(browser, page, githubRoutes, testInfo);
  try {
    const b = next.page;
    // The tab restore: B loads the exact address A had open.
    await b.goto("/web/app/#/drafts/clash/crash_tab_probe");

    await expect(b.locator("#workspace")).toBeVisible();
    await expect.poll(() => editorText(b)).toBe(typed);
    await expect(b.locator("#draft-note")).toBeVisible();
    await expect(b.locator("#welcome")).toBeHidden();
    await expect(b).toHaveURL(/#\/drafts\/clash\/crash_tab_probe$/);

    await b.locator("#upload-open").click();
    await expect(b.locator("#upload-header-card")).toBeVisible();
    // As in the welcome-list test: the card names the target, not "header.png".
    await expect(b.locator("#upload-header-card")).toContainText("crash_tab_probe.png");

    expect(next.errors).toEqual([]);
  } finally {
    await next.context.close();
  }
});

test("a crash then a restore of an updates address reopens the edit with the local text", async ({
  browser,
  app,
  githubRoutes,
}, testInfo) => {
  const { page } = app;
  const seeded = "% local edit of a Mission Book scenario, crash probe\n";
  await seedLocalRecord(page, "clash/arcane_artillery.tex", { text: seeded });
  // Sync gate: the seed is committed before the crash.
  await expect.poll(async () => (await readLocalRecord(page, "clash/arcane_artillery.tex")).text).toBe(seeded);

  const next = await crashAndRelaunch(browser, page, githubRoutes, testInfo);
  try {
    const b = next.page;
    await b.goto("/web/app/#/updates/clash/arcane_artillery");

    await expect(b.locator("#workspace")).toBeVisible();
    await expect.poll(() => editorText(b)).toBe(seeded);
    expect(await b.evaluate(() => window.__state!.edit)).toEqual({ startOver: false });
    expect(new URL(b.url()).hash).toBe("#/updates/clash/arcane_artillery");

    expect(next.errors).toEqual([]);
  } finally {
    await next.context.close();
  }
});

test("a crash with an older localStorage draft restores the IndexedDB text", async ({
  browser,
  app,
  githubRoutes,
}, testInfo) => {
  const { page } = app;
  await openBlankClash(page, "Crash Precedence Probe");
  const path = await chosenPath(page);

  await editorBox(page).click();
  await page.keyboard.type("% newer text in IndexedDB 9d2e\n");
  const typed = await editorText(page);
  // Sync gate: the record holds the typed text before localStorage is overwritten.
  await expect.poll(async () => (await readLocalRecord(page, path)).text).toBe(typed);

  // The storage contract: the localStorage draft key is this prefix plus the path.
  const stale = "% older text in localStorage 0b8c\n";
  await page.evaluate(([key, text]) => localStorage.setItem(key, text), [`wasm-scenario-builder:draft:${path}`, stale]);

  const next = await crashAndRelaunch(browser, page, githubRoutes, testInfo);
  try {
    const b = next.page;
    await b.goto("/web/app/");

    const row = b.locator("#resume-list .combobox-item");
    await expect(row).toBeVisible();
    await row.click();

    await expect(b.locator("#workspace")).toBeVisible();
    await expect.poll(() => editorText(b)).toBe(typed);
    expect(await editorText(b)).not.toBe(stale);

    expect(next.errors).toEqual([]);
  } finally {
    await next.context.close();
  }
});

test("with IndexedDB broken from page start, a crash keeps the text in localStorage", async ({
  browser,
  app,
  githubRoutes,
}, testInfo) => {
  const { page } = app;
  // The app's first load already ran; the script applies from the next load on.
  await page.addInitScript(breakIndexedDb);
  await page.reload();
  await openBlankClash(page, "Crash No Idb Probe");
  const path = await chosenPath(page);

  await editorBox(page).click();
  await page.keyboard.type("% no indexeddb marker 5a17\n");
  const typed = await editorText(page);
  await editorBox(page).blur();
  // Sync gate: reads localStorage, because the record cannot exist here.
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), `wasm-scenario-builder:draft:${path}`))
    .toBe(typed);

  // Uploads are not asserted: without IndexedDB their bytes are lost. A known limit.
  const next = await crashAndRelaunch(browser, page, githubRoutes, testInfo, [breakIndexedDb]);
  try {
    const b = next.page;
    await b.goto("/web/app/");

    const row = b.locator("#resume-list .combobox-item");
    await expect(row).toBeVisible();
    await expect(row).toContainText("Local draft");
    await row.click();

    await expect(b.locator("#workspace")).toBeVisible();
    await expect.poll(() => editorText(b)).toBe(typed);
    await expect(b.locator("#draft-note")).toBeVisible();

    expect(next.errors).toEqual([]);

    // A second crash, then a tab restore of the draft address.
    const third = await crashAndRelaunch(browser, b, githubRoutes, testInfo, [breakIndexedDb]);
    try {
      const c = third.page;
      await c.goto("/web/app/#/drafts/clash/crash_no_idb_probe");
      await expect(c.locator("#workspace")).toBeVisible();
      await expect.poll(() => editorText(c)).toBe(typed);
      await expect(c.locator("#draft-note")).toBeVisible();
      expect(third.errors).toEqual([]);
    } finally {
      await third.context.close();
    }
  } finally {
    await next.context.close();
  }
});

test.describe("the sign-in round trip", () => {
  test.use({ githubRoutes: routes(MEMBER_ROUTES) });

  const returns = [
    { name: "a good code", query: "?code=ok", relay: { access_token: "gho_survival" }, failed: false },
    { name: "a bad code", query: "?code=bad", relay: { error: "bad_verification_code" }, failed: true },
    { name: "a denied authorization", query: "?error=access_denied", relay: null, failed: false },
  ];

  for (const { name, query, relay, failed } of returns) {
    test(`text typed just before the click and a staged header survive ${name}`, async ({ app }) => {
      const { page, errors } = app;
      await page.route(RELAY, (route) => route.fulfill({ status: 200, json: relay ?? {} }));
      // GitHub itself is never reached: its authorize page answers blank.
      await page.route("https://github.com/**", (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>GitHub</title>" }),
      );
      await openBlankClash(page, "Sign In Probe");

      // Stage the header first; it is the "just before" upload. No wait on the record.
      await page.locator("#upload-open").click();
      await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
      await expect(page.locator("#upload-header-card")).toBeVisible();
      await page.keyboard.press("Escape");

      // An earlier autosave puts older text in IndexedDB, which the restore
      // prefers over localStorage: a lost later write would show it.
      await editorBox(page).click();
      await page.keyboard.type("% before sign-in 2b6f\n");
      const earlier = await editorText(page);
      const path = await chosenPath(page);
      await expect.poll(async () => (await readLocalRecord(page, path)).text).toBe(earlier);

      // Typed inside the autosave debounce, but the menu click below blurs the
      // editor, and its blur write saves the text before the redirect. So this
      // test does not protect the await on flushDraft (test-plan §7).
      await page.keyboard.type("% sign-in marker c4d1\n");
      const typed = await editorText(page);
      await page.locator("#github-signin").click();
      await page.locator("#signin-oauth").click();
      await page.waitForURL(/github\.com/);

      await page.goto(`/web/app/${query}`);

      await expect(page.locator("#workspace")).toBeVisible();
      await expect.poll(() => editorText(page)).toBe(typed);
      await page.locator("#upload-open").click();
      await expect(page.locator("#upload-header-card")).toBeVisible();
      // The restore keeps the bytes under the target name, not "header.png".
      await expect(page.locator("#upload-header-card")).toContainText("sign_in_probe.png");
      await expect.poll(() => new URL(page.url()).hash).toBe("#/drafts/clash/sign_in_probe");
      if (failed) {
        expect(await page.evaluate(() => localStorage.getItem("github_token"))).toBeNull();
      } else {
        expect(errors).toEqual([]);
      }
      // Last, so the draft assertions above still run before the case stops.
      // Defect: the draft reopen sets "Ready." after the sign-in failure and hides the message.
      test.fixme(failed, "the reopen's Ready status overwrites 'GitHub sign-in failed'");
      if (failed) await expect(page.locator("#status-text")).toContainText("GitHub sign-in failed");
    });
  }

  test("signing in with a token keeps the text and the staged header", async ({ app }) => {
    const { page, errors } = app;
    await openBlankClash(page, "Token Survival Probe");
    await editorBox(page).click();
    await page.keyboard.type("% token marker 8e20\n");
    const typed = await editorText(page);
    await page.locator("#upload-open").click();
    await page.locator("#upload-header").setInputFiles(fakeImage("header.png"));
    await expect(page.locator("#upload-header-card")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator("#github-signin").click();
    await page.locator("#signin-token").click();
    await expect(page.locator("#token-dialog")).toBeVisible();
    await page.locator("#token-input").fill("github_pat_survival");
    await page.locator("#token-submit").click();
    await expect(page.locator("#token-dialog")).toBeHidden();
    await expect(page.locator("#github-save")).toBeVisible();

    await expect(page.locator("#workspace")).toBeVisible();
    expect(await editorText(page)).toBe(typed);
    await page.locator("#upload-open").click();
    await expect(page.locator("#upload-header-card")).toBeVisible();
    // The app's write probe is answered 422 by design; the browser logs that as a console error.
    expect(errors.filter((e) => !e.includes("status of 422"))).toEqual([]);
  });
});
