import assert from "node:assert/strict";
import { test } from "node:test";
import { TOKEN_DESCRIPTION_MAX, TOKEN_NAME_MAX, TOKEN_TEMPLATE_URL } from "../../shared/token-template.ts";

const url = new URL(TOKEN_TEMPLATE_URL);

test("the token template opens GitHub's new fine-grained token form", () => {
  assert.equal(url.origin + url.pathname, "https://github.com/settings/personal-access-tokens/new");
});

test("the token template asks for Contents write and a 7-day expiry", () => {
  assert.equal(url.searchParams.get("contents"), "write");
  assert.equal(url.searchParams.get("expires_in"), "7");
});

test("the token template's name and description fit GitHub's limits", () => {
  const name = url.searchParams.get("name") ?? "";
  const description = url.searchParams.get("description") ?? "";
  assert.ok(name.length > 0 && name.length <= TOKEN_NAME_MAX);
  assert.ok(description.length > 0 && description.length <= TOKEN_DESCRIPTION_MAX);
});
