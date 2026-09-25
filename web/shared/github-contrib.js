import { DRAFT_GROUP_FILES } from "./build-plan.js";

export const UPSTREAM_OWNER = "qwrtln";
export const UPSTREAM_REPO = "Homm3BG-mission-book";

const API = "https://api.github.com";

/**
 * The one way out of this module to the network. Every GitHub call in this
 * file goes through `http.fetch`, so a caller — a test, in practice — can
 * hand the module a recorded fake instead of reaching api.github.com.
 *
 * @typedef {object} HttpClient
 * @property {(url: string, options?: RequestInit) => Promise<Response>} fetch
 *   called with an absolute URL and the same options `fetch` takes
 */

/** @type {HttpClient} */
const defaultHttpClient = { fetch: (url, options) => fetch(url, options) };

/** @type {HttpClient} */
let http = defaultHttpClient;

/**
 * Replaces the HTTP dependency this module calls GitHub through. A seam for
 * tests: the application never calls this, so no call site in app/modules/
 * has to carry a client it does not care about.
 *
 * @param {HttpClient | null} client null restores the global fetch
 * @returns {void}
 */
export function setHttpClient(client) {
  http = client || defaultHttpClient;
}

class GithubApiError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number, rateLimited?: boolean}} [detail]
   */
  constructor(message, { status, rateLimited = false } = {}) {
    super(message);
    /** @type {number | undefined} */
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

/**
 * One raw call against the API. Returns the Response untouched, so callers
 * can read a 404 or a 422 as a value rather than as a thrown error.
 *
 * @param {string} path API path, beginning with "/"
 * @param {string} token
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function api(path, token, options = {}) {
  const response = await http.fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  return response;
}

// --- Point-of-entry validation -------------------------------------------
//
// Every payload GitHub sends is checked here, field by field, before anything
// else in the app can see it. Each parser builds a fresh object carrying only
// the fields this app reads, so an unchecked shape never travels into
// app/modules/; the shapes themselves are declared in types/github.d.ts. A
// payload that has drifted fails as a GithubApiError at the call that fetched
// it, rather than as an undefined field somewhere far away.

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} payload
 * @param {string} what names the shape, for the error message
 * @returns {Record<string, unknown>}
 */
function object(payload, what) {
  if (!isObject(payload)) throw new GithubApiError(`GitHub returned an unexpected ${what}.`);
  return payload;
}

/**
 * @param {unknown} payload
 * @param {string} what
 * @returns {unknown[]}
 */
function array(payload, what) {
  if (!Array.isArray(payload)) throw new GithubApiError(`GitHub returned an unexpected ${what}.`);
  return payload;
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @param {string} what
 * @returns {string}
 */
function stringField(source, key, what) {
  const value = source[key];
  if (typeof value !== "string") throw new GithubApiError(`GitHub's ${what} is missing "${key}".`);
  return value;
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @param {string} what
 * @returns {number}
 */
function numberField(source, key, what) {
  const value = source[key];
  if (typeof value !== "number") throw new GithubApiError(`GitHub's ${what} is missing "${key}".`);
  return value;
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @param {string} what
 * @returns {Record<string, unknown>}
 */
function objectField(source, key, what) {
  const value = source[key];
  if (!isObject(value)) throw new GithubApiError(`GitHub's ${what} is missing "${key}".`);
  return value;
}

/**
 * @param {unknown} payload
 * @returns {GithubUser}
 */
function parseUser(payload) {
  return { login: stringField(object(payload, "user"), "login", "user") };
}

/**
 * @param {unknown} payload
 * @returns {GithubRepo}
 */
function parseRepo(payload) {
  const repo = object(payload, "repository");
  const permissions = repo.permissions;
  return {
    name: stringField(repo, "name", "repository"),
    owner: { login: stringField(objectField(repo, "owner", "repository"), "login", "repository owner") },
    default_branch: stringField(repo, "default_branch", "repository"),
    // Absent under a token that cannot see it, which is not an error.
    ...(isObject(permissions) ? { permissions: { push: permissions.push === true } } : {}),
  };
}

/**
 * @param {unknown} payload
 * @returns {GithubBranch[]}
 */
function parseBranches(payload) {
  return array(payload, "branch list").map((entry) => ({
    name: stringField(object(entry, "branch"), "name", "branch"),
  }));
}

/**
 * Compare lists commits oldest first, so the newest is the last entry.
 *
 * @param {unknown} commits
 * @returns {string | undefined}
 */
function lastCommitDate(commits) {
  if (!Array.isArray(commits) || commits.length === 0) return undefined;
  const commit = object(commits[commits.length - 1], "compared commit").commit;
  const committer =
    commit && typeof commit === "object" ? /** @type {Record<string, unknown>} */ (commit).committer : null;
  const date =
    committer && typeof committer === "object" ? /** @type {Record<string, unknown>} */ (committer).date : null;
  return typeof date === "string" ? date : undefined;
}

/**
 * @param {unknown} payload
 * @returns {GithubCompare}
 */
function parseCompare(payload) {
  const compare = object(payload, "comparison");
  if (!Array.isArray(compare.files)) return {};
  return {
    lastCommitDate: lastCommitDate(compare.commits),
    files: compare.files.map((entry) => {
      const file = object(entry, "compared file");
      return {
        filename: stringField(file, "filename", "compared file"),
        sha: stringField(file, "sha", "compared file"),
        status: stringField(file, "status", "compared file"),
      };
    }),
  };
}

/**
 * @param {unknown} payload
 * @returns {GithubBlob}
 */
function parseBlob(payload) {
  return { content: stringField(object(payload, "blob"), "content", "blob") };
}

/**
 * @param {unknown} payload
 * @returns {GithubContents}
 */
function parseContents(payload) {
  return { content: stringField(object(payload, "file"), "content", "file") };
}

/**
 * @param {unknown} payload
 * @returns {GithubBlobRef}
 */
function parseBlobRef(payload) {
  return { sha: stringField(object(payload, "file"), "sha", "file") };
}

/**
 * @param {unknown} payload
 * @returns {GithubRef}
 */
function parseRef(payload) {
  const ref = object(payload, "ref");
  return { object: { sha: stringField(objectField(ref, "object", "ref"), "sha", "ref") } };
}

/**
 * @param {unknown} payload
 * @returns {GithubCommit}
 */
function parseCommit(payload) {
  const commit = object(payload, "commit");
  return {
    sha: stringField(commit, "sha", "commit"),
    tree: { sha: stringField(objectField(commit, "tree", "commit"), "sha", "commit tree") },
  };
}

/**
 * The create-blob and create-tree responses, which this app reads only the
 * sha from.
 *
 * @param {string} what
 * @returns {(payload: unknown) => GithubShaOnly}
 */
function shaOnlyParser(what) {
  return (payload) => ({ sha: stringField(object(payload, what), "sha", what) });
}

/**
 * @param {unknown} payload
 * @returns {GithubPullRequest}
 */
function parsePullRequest(payload) {
  const pull = object(payload, "pull request");
  return {
    html_url: stringField(pull, "html_url", "pull request"),
    number: numberField(pull, "number", "pull request"),
  };
}

/**
 * @param {unknown} payload
 * @returns {GithubPullRequest[]}
 */
function parsePullRequests(payload) {
  return array(payload, "pull request list").map(parsePullRequest);
}

// --- Calls ----------------------------------------------------------------

/**
 * A call that must succeed. Throws GithubApiError on a rate limit or any
 * non-ok status; hands the Response back otherwise.
 *
 * @param {string} path API path, beginning with "/"
 * @param {string} token
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function apiOk(path, token, options = {}) {
  const response = await api(path, token, options);
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    const resetAt = new Date(Number(response.headers.get("x-ratelimit-reset")) * 1000);
    throw new GithubApiError(`GitHub API rate limit reached. It resets at ${resetAt.toLocaleTimeString()}.`, {
      status: 403,
      rateLimited: true,
    });
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      if (isObject(body) && typeof body.message === "string") detail = body.message;
    } catch {
      /* no JSON body */
    }
    throw new GithubApiError(`GitHub API error (${response.status} on ${path}): ${detail || response.statusText}`, {
      status: response.status,
    });
  }
  return response;
}

/**
 * A call that must succeed, with its JSON body parsed and validated. The
 * parser is what gives the result its type — there is no cast, so no call
 * can claim a shape the payload was never checked against.
 *
 * @template T
 * @param {string} path API path, beginning with "/"
 * @param {string} token
 * @param {(payload: unknown) => T} parse one of the parsers above
 * @param {RequestInit} [options]
 * @returns {Promise<T>}
 */
async function apiJson(path, token, parse, options = {}) {
  const response = await apiOk(path, token, options);
  return parse(await response.json());
}

/**
 * A call that must succeed and whose body the caller ignores — including a
 * 204, which carries none.
 *
 * @param {string} path API path, beginning with "/"
 * @param {string} token
 * @param {RequestInit} [options]
 * @returns {Promise<void>}
 */
async function apiSend(path, token, options = {}) {
  await apiOk(path, token, options);
}

/**
 * @param {string} token
 * @returns {Promise<GithubRepo>}
 */
async function getUpstreamRepo(token) {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`, token, parseRepo);
}

/**
 * @param {string} token
 * @returns {Promise<GithubUser>}
 */
export async function currentUser(token) {
  return apiJson("/user", token, parseUser);
}

/**
 * Read-only; never creates a fork.
 *
 * @param {string} token
 * @param {string} username
 * @returns {Promise<GithubRepo | null>} null if the user has none yet
 */
async function findExistingFork(token, username) {
  const response = await api(`/repos/${username}/${UPSTREAM_REPO}`, token);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GithubApiError(`Could not check for your fork (${response.status}).`, { status: response.status });
  }
  return parseRepo(await response.json());
}

/**
 * Everything the app needs to know about the signed-in user, worked out once.
 *
 * GitHub's collaborator-check endpoint 403s under a public_repo-scoped token
 * even for a real collaborator, so permissions.push comes from the repo-info
 * call instead.
 *
 * @param {string} token
 * @returns {Promise<GithubContext>}
 */
export async function discoverGithubContext(token) {
  const [user, upstream] = await Promise.all([currentUser(token), getUpstreamRepo(token)]);
  const username = user.login;
  const isMember = Boolean(upstream.permissions?.push);
  const fork = isMember ? null : await findExistingFork(token, username);
  const owner = isMember ? UPSTREAM_OWNER : fork ? fork.owner.login : null;
  const repo = isMember ? UPSTREAM_REPO : fork ? fork.name : null;
  // `owner` and `repo` are always set together or both null; testing both
  // changes nothing at run time and lets the checker narrow each to a string.
  const drafts =
    owner && repo ? await findResumableDrafts(token, { owner, repo, username, base: upstream.default_branch }) : [];
  return { username, isMember, fork, drafts };
}

/**
 * This user's own scenario-editor/<username>/* branches, paired with the
 * .tex file each touches, found by diffing against the default branch.
 *
 * @param {string} token
 * @param {{owner: string, repo: string, username: string, base: string}} target
 * @returns {Promise<ResumableDraft[]>}
 */
async function findResumableDrafts(token, { owner, repo, username, base }) {
  const prefix = `scenario-editor/${username}/`;
  const branches = await apiJson(`/repos/${owner}/${repo}/branches?per_page=100`, token, parseBranches);
  const own = branches.filter((b) => b.name.startsWith(prefix));

  /** @type {ResumableDraft[]} */
  const drafts = [];
  for (const b of own) {
    try {
      const compare = await apiJson(
        `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(b.name)}`,
        token,
        parseCompare,
      );
      const files = (compare.files || []).filter((f) => f.status !== "removed");
      const texFile = files.find((f) => f.filename.endsWith(".tex") && !f.filename.endsWith("/main.tex"));
      const assets = files
        .filter((f) =>
          ["assets/images/", "assets/maps/", "assets/map-files/"].some((dir) => f.filename.startsWith(dir)),
        )
        .map((f) => ({ path: f.filename, sha: f.sha }));
      if (texFile) {
        const kind = b.name.startsWith(`${prefix}updates/`) ? "edit" : "new";
        drafts.push({ branch: b.name, kind, texPath: texFile.filename, assets, lastEdit: compare.lastCommitDate });
      }
    } catch {
      // One bad branch (deleted mid-compare, etc.) shouldn't drop the rest.
    }
  }
  return drafts;
}

/**
 * @param {string} base64 base64 text, newlines and all
 * @returns {Uint8Array}
 */
function decodeBase64(base64) {
  return Uint8Array.from(atob(base64.replace(/\n/g, "")), (c) => c.charCodeAt(0));
}

/**
 * @param {string} base64
 * @returns {string}
 */
function decodeBase64Utf8(base64) {
  return new TextDecoder("utf-8").decode(decodeBase64(base64));
}

/**
 * Blobs API, not contents: contents omits the body for files over 1 MB.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} sha
 * @returns {Promise<Uint8Array>}
 */
export async function getBlobBytes(token, owner, repo, sha) {
  const blob = await apiJson(`/repos/${owner}/${repo}/git/blobs/${sha}`, token, parseBlob);
  return decodeBase64(blob.content);
}

/**
 * Blob sha of a file on the repository's default branch, without its
 * content: what a removed upload reverts to when the path predates the draft.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} path repository-relative path
 * @returns {Promise<string | null>} null if the default branch has no such file
 */
async function getDefaultBlobSha(token, owner, repo, path) {
  const response = await api(`/repos/${owner}/${repo}/contents/${path}`, token);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new GithubApiError(`Could not read "${path}" (${response.status}).`, { status: response.status });
  return parseBlobRef(await response.json()).sha;
}

/**
 * Reads one file's text content at a given ref.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} path repository-relative path
 * @param {string} [ref] a branch name; the default branch when omitted
 * @returns {Promise<string | null>} null if it does not exist there
 */
export async function getRepoFile(token, owner, repo, path, ref) {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const response = await api(`/repos/${owner}/${repo}/contents/${path}${query}`, token);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new GithubApiError(`Could not read "${path}" (${response.status}).`, { status: response.status });
  const data = parseContents(await response.json());
  return decodeBase64Utf8(data.content);
}

/**
 * Idempotent: returns the existing fork if there is one. A new fork can
 * 404 for a few seconds; ensureRepoReady covers that.
 *
 * @param {string} token
 * @returns {Promise<GithubRepo>}
 */
export async function ensureFork(token) {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, token, parseRepo, { method: "POST" });
}

/**
 * Polls until a just-created fork answers, since a new one 404s briefly.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {{attempts?: number, delayMs?: number}} [retry]
 * @returns {Promise<GithubRepo>}
 */
async function ensureRepoReady(token, owner, repo, { attempts = 6, delayMs = 1500 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await api(`/repos/${owner}/${repo}`, token);
    if (response.ok) return parseRepo(await response.json());
    if (response.status !== 404) {
      throw new GithubApiError(`Could not read the new fork (${response.status}).`, { status: response.status });
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new GithubApiError("Timed out waiting for your fork to become ready. Try saving again in a moment.");
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @returns {Promise<string | null>} the tip commit sha, or null if no such branch
 */
async function getBranchSha(token, owner, repo, branch) {
  const response = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new GithubApiError(`Could not read branch "${branch}" (${response.status}).`, { status: response.status });
  const data = parseRef(await response.json());
  return data.object.sha;
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} fromSha
 * @returns {Promise<void>}
 */
async function createBranch(token, owner, repo, branch, fromSha) {
  await apiSend(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
}

/**
 * Branch-safe form of a scenario name.
 *
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string | Uint8Array} content
 * @returns {Promise<string>} the new blob's sha
 */
async function createBlob(token, owner, repo, content) {
  const isBinary = content instanceof Uint8Array;
  const blob = await apiJson(`/repos/${owner}/${repo}/git/blobs`, token, shaOnlyParser("blob"), {
    method: "POST",
    body: JSON.stringify(
      isBinary ? { content: toBase64(content), encoding: "base64" } : { content, encoding: "utf-8" },
    ),
  });
  return blob.sha;
}

/**
 * Pushes one commit, creating the branch from the default branch if it does
 * not exist yet. base_tree keeps a save from disturbing files already on the
 * branch, except the ones named in `removed`.
 *
 * @param {string} token
 * @param {{owner: string, repo: string, branch: string, message: string, files: CommitFile[], removed?: string[], startOver?: boolean}} request
 *   `removed` lists paths this branch committed before and no longer wants: each goes back to the default
 *   branch's version, or is deleted when the default branch has none.
 *   `startOver` moves an existing branch back onto the default branch's tip before committing, discarding what it held
 * @returns {Promise<CommitResult>}
 */
export async function commitFiles(token, { owner, repo, branch, message, files, removed = [], startOver = false }) {
  let branchSha = await getBranchSha(token, owner, repo, branch);
  if (branchSha !== null && startOver) {
    const repoInfo = await ensureRepoReady(token, owner, repo);
    const baseSha = await getBranchSha(token, owner, repo, repoInfo.default_branch);
    if (baseSha === null) {
      throw new GithubApiError(`Could not find the default branch "${repoInfo.default_branch}" to start over from.`);
    }
    return commitOnto(token, owner, repo, branch, baseSha, message, files, [], { force: true });
  }
  if (branchSha === null) {
    const repoInfo = await ensureRepoReady(token, owner, repo);
    const baseSha = await getBranchSha(token, owner, repo, repoInfo.default_branch);
    if (baseSha === null) {
      throw new GithubApiError(`Could not find the default branch "${repoInfo.default_branch}" to branch from.`);
    }
    await createBranch(token, owner, repo, branch, baseSha);
    branchSha = baseSha;
  }

  return commitOnto(token, owner, repo, branch, branchSha, message, files, removed);
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} parentSha the commit to build on
 * @param {string} message
 * @param {CommitFile[]} files
 * @param {string[]} removed paths to take back off the branch; see commitFiles
 * @param {{force?: boolean}} [update] force: the commit does not descend from the branch's tip
 * @returns {Promise<CommitResult>}
 */
async function commitOnto(token, owner, repo, branch, parentSha, message, files, removed, { force = false } = {}) {
  const parentCommit = await apiJson(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token, parseCommit);

  /** @type {{path: string, mode: string, type: string, sha: string | null}[]} */
  const entries = [];
  for (const file of files) {
    const sha = await createBlob(token, owner, repo, file.content);
    entries.push({ path: file.path, mode: "100644", type: "blob", sha });
  }
  // A null sha deletes the path from base_tree. A path the default branch
  // also has is put back to that version instead, so the pull request does
  // not delete a file the draft only overwrote.
  const written = new Set(files.map((file) => file.path));
  for (const path of removed) {
    if (written.has(path)) continue;
    entries.push({ path, mode: "100644", type: "blob", sha: await getDefaultBlobSha(token, owner, repo, path) });
  }

  const tree = await apiJson(`/repos/${owner}/${repo}/git/trees`, token, shaOnlyParser("tree"), {
    method: "POST",
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: entries }),
  });

  if (tree.sha === parentCommit.tree.sha) {
    // Nothing actually changed against parentSha; an empty commit would only
    // clutter history. A plain save can just leave the branch as it is, but
    // a startOver still has to force the ref onto parentSha (it may be
    // sitting on discarded content).
    if (force) {
      await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ sha: parentSha, force: true }),
      });
    }
    return { owner, repo, branch, commitSha: parentSha };
  }

  const commit = await apiJson(`/repos/${owner}/${repo}/git/commits`, token, parseCommit, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });

  const updateResponse = await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: "PATCH",
    body: JSON.stringify(force ? { sha: commit.sha, force: true } : { sha: commit.sha }),
  });
  if (updateResponse.status === 422 && !force) {
    // Branch tip moved (racing save); retry once against the fresh tip.
    const freshSha = await getBranchSha(token, owner, repo, branch);
    if (freshSha && freshSha !== parentSha)
      return commitOnto(token, owner, repo, branch, freshSha, message, files, removed);
  }
  if (!updateResponse.ok && (force || updateResponse.status !== 422)) {
    throw new GithubApiError(`Could not update branch "${branch}" (${updateResponse.status}).`, {
      status: updateResponse.status,
    });
  }

  return { owner, repo, branch, commitSha: commit.sha };
}

/**
 * Branch an in-place edit of texPath lives on. Keyed on the file, not on a
 * typed name, so every session editing that file finds the same branch.
 *
 * @param {string} username
 * @param {string} texPath
 * @returns {string}
 */
export function editBranchName(username, texPath) {
  const basename = (texPath.split("/").pop() ?? texPath).replace(/\.tex$/, "");
  return `scenario-editor/${username}/updates/${slugify(basename)}`;
}

/**
 * The upstream branch an earlier session left for an in-place edit of texPath.
 * Only members edit in place, so this only ever looks at the upstream repo.
 *
 * @param {string} token
 * @param {{username: string, texPath: string}} request
 * @returns {Promise<string | null>} the branch name, or null when none exists
 */
export async function findEditBranch(token, { username, texPath }) {
  const branch = editBranchName(username, texPath);
  return (await getBranchSha(token, UPSTREAM_OWNER, UPSTREAM_REPO, branch)) === null ? null : branch;
}

/** Every branch this app creates starts with this; nothing else may be deleted by it. */
const EDITOR_BRANCH_PREFIX = "scenario-editor/";

/**
 * Deletes a work-in-progress branch. Refuses any branch the app did not
 * create, so a bad argument can never remove main or someone else's work.
 * An already-missing branch counts as deleted.
 *
 * @param {string} token
 * @param {{owner: string, repo: string, branch: string}} request
 * @returns {Promise<void>}
 */
export async function deleteWorkBranch(token, { owner, repo, branch }) {
  if (!branch.startsWith(EDITOR_BRANCH_PREFIX)) {
    throw new GithubApiError(`Refusing to delete "${branch}": not a scenario-editor branch.`);
  }
  const response = await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: "DELETE",
  });
  if (response.status === 404 || response.status === 422) return;
  if (!response.ok) {
    throw new GithubApiError(`Could not delete branch "${branch}" (${response.status}).`, { status: response.status });
  }
}

/**
 * @param {string} texPath
 * @returns {import("./build-plan.js").GroupFile | null}
 */
function draftGroupFor(texPath) {
  return DRAFT_GROUP_FILES.find((g) => texPath.startsWith(`${g.dir}/`)) || null;
}

/**
 * Adds a \clearpage + \input line to the category's main.tex if missing.
 * No-op if already there, so safe on every save, not just the first.
 *
 * @param {string} token
 * @param {{owner: string, repo: string, branch: string, group: import("./build-plan.js").GroupFile, texPath: string}} request
 * @returns {Promise<CommitFile | null>} null when no edit is needed
 */
async function ensureDraftEntry(token, { owner, repo, branch, group, texPath }) {
  const slug = texPath.slice(group.dir.length + 1).replace(/\.tex$/, "");
  // `macro` already ends in "path" (clashpath, coopspath): the group files'
  // own lines read \input{\clashpath/x.tex}, and a second "path" here both
  // named a macro that does not exist and never matched an existing line, so
  // every save appended the scenario again.
  const marker = `\\input{\\${group.macro}/${slug}.tex}`;
  const current =
    (await getRepoFile(token, owner, repo, group.path, branch)) ?? (await getRepoFile(token, owner, repo, group.path));
  if (current == null || current.includes(marker)) return null;
  const content = `${current.replace(/\s*$/, "")}\n\n\\clearpage\n\n${marker}\n`;
  return { path: group.path, content };
}

/**
 * Commits to the upstream repo directly for a collaborator, or to the
 * caller's fork otherwise. Fork is created lazily here on first save. This
 * is a plain push — it never opens or touches a PR; see ensurePullRequest.
 *
 * @param {string} token
 * @param {object} request
 * @param {string} request.scenarioName the contributor's own name for it
 * @param {string} request.texPath repository path the .tex lands at
 * @param {string} request.texContent the editor's current text
 * @param {Map<string, Uint8Array>} request.uploadedFiles path -> bytes
 * @param {string[]} [request.removedUploads] uploads an earlier save committed that the contributor has since dropped or renamed
 * @param {GithubContext} request.context from discoverGithubContext
 * @param {string} [request.branch] the branch a resumed or already-saved draft lives on; overrides the name-derived one
 * @param {"new" | "edit"} [request.mode] "edit" changes the file at texPath in place: an updates/ branch, no group file
 * @param {boolean} [request.startOver] edit mode only: discard the branch's earlier work and commit onto the default branch
 * @returns {Promise<SaveTarget>}
 */
export async function saveScenarioToRepo(
  token,
  {
    scenarioName,
    texPath,
    texContent,
    uploadedFiles,
    removedUploads = [],
    context,
    branch: knownBranch,
    mode = "new",
    startOver = false,
  },
) {
  const { username, isMember, fork } = context;

  let owner = UPSTREAM_OWNER;
  let repo = UPSTREAM_REPO;
  if (!isMember) {
    const forkRepo = fork || (await ensureFork(token));
    owner = forkRepo.owner.login;
    repo = forkRepo.name;
  }

  const editing = mode === "edit";
  const branch =
    knownBranch ||
    (editing ? editBranchName(username, texPath) : `scenario-editor/${username}/${slugify(scenarioName)}`);
  /** @type {CommitFile[]} */
  const files = [
    { path: texPath, content: texContent },
    ...[...uploadedFiles.entries()].map(([path, content]) => ({ path, content })),
  ];

  const group = editing ? null : draftGroupFor(texPath);
  if (group) {
    const entryFile = await ensureDraftEntry(token, { owner, repo, branch, group, texPath });
    if (entryFile) files.push(entryFile);
  }

  const message = `${editing ? "Edit" : "Update"} ${scenarioName}`;
  const reset = editing && startOver;
  // A reset branch starts from the default branch, so nothing earlier is left to remove.
  const removed = reset ? [] : removedUploads.filter((path) => !uploadedFiles.has(path));
  const result = await commitFiles(token, { owner, repo, branch, message, files, removed, startOver: reset });
  return { ...result, isMember };
}

/**
 * Looks up a branch's already-open pull request, without creating one.
 *
 * list-pulls always filters head as "owner:branch".
 *
 * @param {string} token
 * @param {{owner: string, branch: string}} request
 * @returns {Promise<GithubPullRequest | null>}
 */
export async function findPullRequest(token, { owner, branch }) {
  const listHead = `${owner}:${branch}`;
  const existing = await apiJson(
    `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls?head=${encodeURIComponent(listHead)}&state=open`,
    token,
    parsePullRequests,
  );
  return existing[0] ?? null;
}

/**
 * Opens a pull request for a saved branch, or returns the one already open
 * for it.
 *
 * create-pull-request only accepts the "owner:branch" head form for a
 * cross-repo (fork) head, plain branch name for a same-repo (collaborator)
 * head.
 *
 * @param {string} token
 * @param {{owner: string, branch: string, scenarioName: string, isMember: boolean, mode?: "new" | "edit"}} request
 * @returns {Promise<GithubPullRequest>}
 */
export async function ensurePullRequest(token, { owner, branch, scenarioName, isMember, mode = "new" }) {
  const upstream = await getUpstreamRepo(token);
  const base = upstream.default_branch;
  const listHead = `${owner}:${branch}`;

  const existing = await findPullRequest(token, { owner, branch });
  if (existing) return existing;

  const head = isMember ? branch : listHead;
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`, token, parsePullRequest, {
    method: "POST",
    body: JSON.stringify({
      title: mode === "edit" ? `Update ${scenarioName}` : `New scenario: ${scenarioName}`,
      head,
      base,
      body: `Edited in the browser mission book editor.`,
    }),
  });
}

export { GithubApiError };
