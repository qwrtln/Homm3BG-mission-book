import { DRAFT_GROUP_FILES } from "./build-plan.js";

export const UPSTREAM_OWNER = "qwrtln";
export const UPSTREAM_REPO = "Homm3BG-mission-book";

const API = "https://api.github.com";

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
  const response = await fetch(`${API}${path}`, {
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

/**
 * A call that must succeed, with its JSON body parsed. Throws GithubApiError
 * on a rate limit or any non-ok status.
 *
 * `T` is inferred from the calling function's own declared return type — each
 * wrapper below names the payload shape it expects, and those shapes live in
 * types/github.d.ts.
 *
 * @template [T=unknown]
 * @param {string} path API path, beginning with "/"
 * @param {string} token
 * @param {RequestInit} [options]
 * @returns {Promise<T>}
 */
async function apiJson(path, token, options = {}) {
  const response = await api(path, token, options);
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    const resetAt = new Date(Number(response.headers.get("x-ratelimit-reset")) * 1000);
    throw new GithubApiError(
      `GitHub API rate limit reached. It resets at ${resetAt.toLocaleTimeString()}.`,
      { status: 403, rateLimited: true },
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = /** @type {{message?: string}} */ (await response.json());
      detail = body.message || "";
    } catch { /* no JSON body */ }
    throw new GithubApiError(
      `GitHub API error (${response.status} on ${path}): ${detail || response.statusText}`,
      { status: response.status },
    );
  }
  // 204 carries no body. Only the callers that ignore their result can get
  // one, so the null is cast rather than widening every caller's type.
  if (response.status === 204) return /** @type {T} */ (/** @type {unknown} */ (null));
  return response.json();
}

/**
 * @param {string} token
 * @returns {Promise<GithubRepo>}
 */
async function getUpstreamRepo(token) {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`, token);
}

/**
 * @param {string} token
 * @returns {Promise<GithubUser>}
 */
export async function currentUser(token) {
  return apiJson("/user", token);
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
  return /** @type {Promise<GithubRepo>} */ (response.json());
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
  const isMember = Boolean(upstream.permissions && upstream.permissions.push);
  const fork = isMember ? null : await findExistingFork(token, username);
  const owner = isMember ? UPSTREAM_OWNER : fork ? fork.owner.login : null;
  const repo = isMember ? UPSTREAM_REPO : fork ? fork.name : null;
  // `owner` and `repo` are always set together or both null; testing both
  // changes nothing at run time and lets the checker narrow each to a string.
  const drafts = owner && repo ? await findResumableDrafts(token, { owner, repo, username, base: upstream.default_branch }) : [];
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
  const branches = /** @type {GithubBranch[]} */ (
    await apiJson(`/repos/${owner}/${repo}/branches?per_page=100`, token)
  );
  const own = branches.filter((b) => b.name.startsWith(prefix));

  /** @type {ResumableDraft[]} */
  const drafts = [];
  for (const b of own) {
    try {
      const compare = /** @type {GithubCompare} */ (await apiJson(
        `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(b.name)}`,
        token,
      ));
      const files = (compare.files || []).filter((f) => f.status !== "removed");
      const texFile = files.find((f) => f.filename.endsWith(".tex") && !f.filename.endsWith("/main.tex"));
      const assets = files
        .filter((f) => f.filename.startsWith("assets/images/") || f.filename.startsWith("assets/maps/"))
        .map((f) => ({ path: f.filename, sha: f.sha }));
      if (texFile) drafts.push({ branch: b.name, texPath: texFile.filename, assets });
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
  const blob = /** @type {GithubBlob} */ (
    await apiJson(`/repos/${owner}/${repo}/git/blobs/${sha}`, token)
  );
  return decodeBase64(blob.content);
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
  if (!response.ok) throw new GithubApiError(`Could not read "${path}" (${response.status}).`, { status: response.status });
  const data = /** @type {GithubContents} */ (await response.json());
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
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, token, { method: "POST" });
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
    if (response.ok) return /** @type {Promise<GithubRepo>} */ (response.json());
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
  if (!response.ok) throw new GithubApiError(`Could not read branch "${branch}" (${response.status}).`, { status: response.status });
  const data = /** @type {GithubRef} */ (await response.json());
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
  await apiJson(`/repos/${owner}/${repo}/git/refs`, token, {
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
  const blob = /** @type {GithubBlob} */ (await apiJson(`/repos/${owner}/${repo}/git/blobs`, token, {
    method: "POST",
    body: JSON.stringify(
      isBinary
        ? { content: toBase64(content), encoding: "base64" }
        : { content, encoding: "utf-8" },
    ),
  }));
  return blob.sha;
}

/**
 * Pushes one commit, creating the branch from the default branch if it does
 * not exist yet. base_tree keeps a save from disturbing files already on the
 * branch.
 *
 * @param {string} token
 * @param {{owner: string, repo: string, branch: string, message: string, files: CommitFile[]}} request
 * @returns {Promise<CommitResult>}
 */
export async function commitFiles(token, { owner, repo, branch, message, files }) {
  let branchSha = await getBranchSha(token, owner, repo, branch);
  if (branchSha === null) {
    const repoInfo = await ensureRepoReady(token, owner, repo);
    const baseSha = await getBranchSha(token, owner, repo, repoInfo.default_branch);
    if (baseSha === null) {
      throw new GithubApiError(`Could not find the default branch "${repoInfo.default_branch}" to branch from.`);
    }
    await createBranch(token, owner, repo, branch, baseSha);
    branchSha = baseSha;
  }

  return commitOnto(token, owner, repo, branch, branchSha, message, files);
}

/**
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} parentSha the commit to build on
 * @param {string} message
 * @param {CommitFile[]} files
 * @returns {Promise<CommitResult>}
 */
async function commitOnto(token, owner, repo, branch, parentSha, message, files) {
  const parentCommit = /** @type {GithubCommit} */ (
    await apiJson(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token)
  );

  /** @type {{path: string, mode: string, type: string, sha: string}[]} */
  const entries = [];
  for (const file of files) {
    const sha = await createBlob(token, owner, repo, file.content);
    entries.push({ path: file.path, mode: "100644", type: "blob", sha });
  }

  const tree = /** @type {GithubTree} */ (await apiJson(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: entries }),
  }));

  const commit = /** @type {GithubCommit} */ (await apiJson(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  }));

  const updateResponse = await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  if (updateResponse.status === 422) {
    // Branch tip moved (racing save); retry once against the fresh tip.
    const freshSha = await getBranchSha(token, owner, repo, branch);
    if (freshSha && freshSha !== parentSha) return commitOnto(token, owner, repo, branch, freshSha, message, files);
  }
  if (!updateResponse.ok && updateResponse.status !== 422) {
    throw new GithubApiError(`Could not update branch "${branch}" (${updateResponse.status}).`, { status: updateResponse.status });
  }

  return { owner, repo, branch, commitSha: commit.sha };
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
  const marker = `\\input{\\${group.macro}path/${slug}.tex}`;
  const current = (await getRepoFile(token, owner, repo, group.path, branch))
    ?? (await getRepoFile(token, owner, repo, group.path));
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
 * @param {GithubContext} request.context from discoverGithubContext
 * @returns {Promise<SaveTarget>}
 */
export async function saveScenarioToRepo(token, { scenarioName, texPath, texContent, uploadedFiles, context }) {
  const { username, isMember, fork } = context;

  let owner = UPSTREAM_OWNER;
  let repo = UPSTREAM_REPO;
  if (!isMember) {
    const forkRepo = fork || await ensureFork(token);
    owner = forkRepo.owner.login;
    repo = forkRepo.name;
  }

  const branch = `scenario-editor/${username}/${slugify(scenarioName)}`;
  /** @type {CommitFile[]} */
  const files = [
    { path: texPath, content: texContent },
    ...[...uploadedFiles.entries()].map(([path, content]) => ({ path, content })),
  ];

  const group = draftGroupFor(texPath);
  if (group) {
    const entryFile = await ensureDraftEntry(token, { owner, repo, branch, group, texPath });
    if (entryFile) files.push(entryFile);
  }

  const message = `Update ${scenarioName}`;
  const result = await commitFiles(token, { owner, repo, branch, message, files });
  return { ...result, isMember };
}

/**
 * Opens a pull request for a saved branch, or returns the one already open
 * for it.
 *
 * list-pulls always filters head as "owner:branch"; create-pull-request only
 * accepts that form for a cross-repo (fork) head, plain branch name for a
 * same-repo (collaborator) head.
 *
 * @param {string} token
 * @param {{owner: string, branch: string, scenarioName: string, isMember: boolean}} request
 * @returns {Promise<GithubPullRequest>}
 */
export async function ensurePullRequest(token, { owner, branch, scenarioName, isMember }) {
  const upstream = await getUpstreamRepo(token);
  const base = upstream.default_branch;
  const listHead = `${owner}:${branch}`;

  const existing = /** @type {GithubPullRequest[]} */ (await apiJson(
    `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls?head=${encodeURIComponent(listHead)}&state=open`,
    token,
  ));
  if (existing.length > 0) return existing[0];

  const head = isMember ? branch : listHead;
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`, token, {
    method: "POST",
    body: JSON.stringify({
      title: `Update ${scenarioName}`,
      head,
      base,
      body: `Updates the "${scenarioName}" scenario, edited in the browser mission book editor.`,
    }),
  });
}

export { GithubApiError };
