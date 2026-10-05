# web/oauth-relay/ — GitHub OAuth token exchange

A Cloudflare Pages Function, not part of the browser app. It runs on the
Workers runtime, so it sits outside `web/jsconfig.json` and has no JSDoc
contract. Biome still lints it.

- It exists only because GitHub's token endpoint sends no CORS headers. It
  trades a `code` for a token with the client secret; keep it that small.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` live in the Cloudflare Pages
  project settings. A deploy leaves them untouched.
- The client ID also appears in `web/shared/github-auth.ts` (`CLIENT_ID`),
  next to `RELAY_URL`. Change the OAuth App and you change both places.
- `ALLOWED_ORIGIN` is the production origin only. A browser on
  `web/serve.sh`'s localhost origin is refused by CORS, so real sign-in does
  not work locally; tier 2 stubs GitHub instead.
- `.github/workflows/deploy-oauth-relay.yaml` compiles the function on a pull
  request and deploys only from `main`. `index.html` is a placeholder page for
  the Pages project root.
