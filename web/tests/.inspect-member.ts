// Throwaway: opens a headed Chromium on the local app, signed in as a mocked
// project member with one branch to resume. Close the window to exit.
import { chromium } from "@playwright/test";

import { UPSTREAM_OWNER, UPSTREAM_REPO } from "../shared/github-contrib.ts";
import { installGithubStub } from "./stubs/install-stubs.ts";

const LOGIN = "octotester";
const REPO_PATH = `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;
const port = process.env.PORT ?? "8000";

const routes = [
  { method: "GET", path: "/user", body: { login: LOGIN } },
  {
    method: "GET",
    path: REPO_PATH,
    body: {
      name: UPSTREAM_REPO,
      owner: { login: UPSTREAM_OWNER },
      default_branch: "main",
      permissions: { push: process.env.MEMBER !== "0" },
    },
  },
  { method: "GET", path: `${REPO_PATH}/branches`, body: [{ name: `scenario-editor/${LOGIN}/half-written` }] },
  {
    method: "GET",
    path: /\/compare\//,
    body: { files: [{ filename: "draft-scenarios/clash/half_written.tex", sha: "s", status: "added" }] },
  },
  { method: "GET", path: `/repos/${LOGIN}/${UPSTREAM_REPO}`, status: 404, body: { message: "Not Found" } },
];

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await installGithubStub(page, routes);
await page.addInitScript(() => localStorage.setItem("github_token", "gh-inspect-token"));
await page.goto(`http://127.0.0.1:${port}/web/app/`);
console.log(
  `Signed in as mocked ${process.env.MEMBER === "0" ? "non-member" : "member"}. Close the browser window to exit.`,
);
await new Promise((resolve) => browser.on("disconnected", resolve));
