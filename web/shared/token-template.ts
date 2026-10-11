import { UPSTREAM_REPO } from "./github-contrib.ts";

/** GitHub's own limits for a fine-grained token's name and description. */
export const TOKEN_NAME_MAX = 40;
export const TOKEN_DESCRIPTION_MAX = 1024;

const TOKEN_NAME = "Homm3BG scenario builder";
const TOKEN_DESCRIPTION = `Lets the Homm3BG scenario builder save a scenario to your fork of ${UPSTREAM_REPO}. It needs Contents: Read and write on that fork only.`;

/**
 * GitHub's new-token form, filled in: the name, a description, a 7-day expiry
 * and Contents: Read and write. The repository access is not pre-fillable, so
 * the user still picks the fork by hand.
 */
export const TOKEN_TEMPLATE_URL = `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams({
  name: TOKEN_NAME,
  description: TOKEN_DESCRIPTION,
  expires_in: "7",
  contents: "write",
}).toString()}`;
