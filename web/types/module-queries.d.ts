// app/modules/github.js imports shared/github-contrib.js with a "?v=2"
// cache-busting query. The browser treats that as a distinct URL, which is
// the point; TypeScript treats it as a module specifier it cannot resolve.
//
// This maps the queried specifier back onto the real module, so the import
// keeps its types instead of falling back to `any`. Without it, GithubApiError
// resolves to nothing and `error instanceof GithubApiError` stops narrowing,
// which silently turns three error paths back into untyped code.
//
// Members are listed one by one because a relative `export *` does not
// resolve inside an ambient module declaration. Adding an import to
// app/modules/github.js means adding its name here too.
//
// If the cache-buster is ever dropped, delete this file with it.

type GithubContribModule = typeof import("../shared/github-contrib.js");

declare module "*/github-contrib.js?v=2" {
  export const UPSTREAM_OWNER: GithubContribModule["UPSTREAM_OWNER"];
  export const UPSTREAM_REPO: GithubContribModule["UPSTREAM_REPO"];
  export const GithubApiError: GithubContribModule["GithubApiError"];
  export const currentUser: GithubContribModule["currentUser"];
  export const discoverGithubContext: GithubContribModule["discoverGithubContext"];
  export const getBlobBytes: GithubContribModule["getBlobBytes"];
  export const getRepoFile: GithubContribModule["getRepoFile"];
  export const ensureFork: GithubContribModule["ensureFork"];
  export const slugify: GithubContribModule["slugify"];
  export const editBranchName: GithubContribModule["editBranchName"];
  export const findEditBranch: GithubContribModule["findEditBranch"];
  export const commitFiles: GithubContribModule["commitFiles"];
  export const saveScenarioToRepo: GithubContribModule["saveScenarioToRepo"];
  export const ensurePullRequest: GithubContribModule["ensurePullRequest"];
  export const findPullRequest: GithubContribModule["findPullRequest"];
  export const deleteWorkBranch: GithubContribModule["deleteWorkBranch"];
  export const setHttpClient: GithubContribModule["setHttpClient"];
}
