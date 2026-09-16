// Fork-and-branch-write logic for the GitHub contribution flow (ticket 06
// of .scratch/scenario-builder-github-contrib/map.md).
//
// Upstream correction (found while grilling this ticket): the repository a
// contribution actually targets is Heegu-sama/Homm3BG, not
// qwrtln/Homm3BG-mission-book (the repo this app is developed and deployed
// from — origin's own remote). Every call below reads and writes against
// UPSTREAM_OWNER/UPSTREAM_REPO, never against `location` or a git remote.
export const UPSTREAM_OWNER = "Heegu-sama";
export const UPSTREAM_REPO = "Homm3BG";

const API = "https://api.github.com";

class GithubApiError extends Error {
  constructor(message, { status, rateLimited = false } = {}) {
    super(message);
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

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
    try { detail = (await response.json()).message || ""; } catch { /* no JSON body */ }
    throw new GithubApiError(
      `GitHub API error (${response.status} on ${path}): ${detail || response.statusText}`,
      { status: response.status },
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

// GitHub's "check if a user is a repository collaborator" endpoint needs
// more OAuth scope than this app's token ever holds: live-tested this
// session with a real `public_repo`-scoped token against a real
// collaborator (push: true on the repo, confirmed via the repo-info call
// below) and it still 403s with "Resource not accessible by personal
// access token". So membership is read from GET /repos/{owner}/{repo}
// instead, which reports the caller's own permissions on that same scope.
export async function canPushToUpstream(token) {
  const repo = await apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`, token);
  return Boolean(repo.permissions && repo.permissions.push);
}

export async function currentUser(token) {
  return apiJson("/user", token);
}

// Read-only check for an already-existing fork, safe to run at sign-in:
// unlike ensureFork below, this never creates one. Returns the fork's repo
// object, or null if the signed-in user has none yet.
async function findExistingFork(token, username) {
  const response = await api(`/repos/${username}/${UPSTREAM_REPO}`, token);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GithubApiError(`Could not check for your fork (${response.status}).`, { status: response.status });
  }
  return response.json();
}

// Runs at sign-in (not at save time): reads the signed-in user's login,
// upstream push permission, and whether their fork already exists. Forking
// itself stays lazy, on first save (ensureFork below) — this only looks,
// it never creates. The save flow and the header UI both read this once,
// rather than repeating these calls on every save.
export async function discoverGithubContext(token) {
  const [user, isMember] = await Promise.all([currentUser(token), canPushToUpstream(token)]);
  const username = user.login;
  const fork = isMember ? null : await findExistingFork(token, username);
  return { username, isMember, fork };
}

// Idempotent per GitHub: a user can only have one fork of a given repo, and
// re-forking an existing fork just returns it. Fork creation is
// asynchronous on GitHub's side, so the returned repo can 404 for a few
// seconds on a genuinely new fork; ensureRepoReady below covers that.
export async function ensureFork(token) {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, token, { method: "POST" });
}

// Polls a freshly-forked repo until GitHub actually serves it, rather than
// racing the async fork-creation step in ensureFork's response. Give up
// after a handful of tries rather than hanging indefinitely; a caller sees
// this surface as a normal thrown error.
async function ensureRepoReady(token, owner, repo, { attempts = 6, delayMs = 1500 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await api(`/repos/${owner}/${repo}`, token);
    if (response.ok) return response.json();
    if (response.status !== 404) {
      throw new GithubApiError(`Could not read the new fork (${response.status}).`, { status: response.status });
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new GithubApiError("Timed out waiting for your fork to become ready. Try saving again in a moment.");
}

async function getBranchSha(token, owner, repo, branch) {
  const response = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubApiError(`Could not read branch "${branch}" (${response.status}).`, { status: response.status });
  const data = await response.json();
  return data.object.sha;
}

async function createBranch(token, owner, repo, branch, fromSha) {
  await apiJson(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
}

// Lowercase, hyphenated, git-safe. Branch names come from a scenario's
// human title (e.g. "Dances with Dwarves"), not its filename, so this
// always runs before a name reaches a branch.
export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function createBlob(token, owner, repo, content) {
  const isBinary = content instanceof Uint8Array;
  const blob = await apiJson(`/repos/${owner}/${repo}/git/blobs`, token, {
    method: "POST",
    body: JSON.stringify(
      isBinary
        ? { content: toBase64(content), encoding: "base64" }
        : { content, encoding: "utf-8" },
    ),
  });
  return blob.sha;
}

// Builds one commit out of every changed file: the edited .tex source plus
// any staged uploads. Using a git tree keyed off the previous commit's own
// tree (base_tree) is what keeps a later save from disturbing unrelated
// files already on the branch — only the paths actually passed in here ever
// change; everything else in the tree carries over untouched.
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

async function commitOnto(token, owner, repo, branch, parentSha, message, files) {
  const parentCommit = await apiJson(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token);

  const entries = [];
  for (const file of files) {
    const sha = await createBlob(token, owner, repo, file.content);
    entries.push({ path: file.path, mode: "100644", type: "blob", sha });
  }

  const tree = await apiJson(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: entries }),
  });

  const commit = await apiJson(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });

  const updateResponse = await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  if (updateResponse.status === 422) {
    // The branch tip moved between the read above and this write (another
    // save racing this one, most likely from a second open tab). Retried
    // once against the branch's now-current tip; a second collision
    // surfaces as a real error instead of retrying forever.
    const freshSha = await getBranchSha(token, owner, repo, branch);
    if (freshSha && freshSha !== parentSha) return commitOnto(token, owner, repo, branch, freshSha, message, files);
  }
  if (!updateResponse.ok && updateResponse.status !== 422) {
    throw new GithubApiError(`Could not update branch "${branch}" (${updateResponse.status}).`, { status: updateResponse.status });
  }

  return { owner, repo, branch, commitSha: commit.sha };
}

/**
 * Saves the current scenario to a real, buildable branch: on the upstream
 * repo directly for a collaborator, or on the caller's fork otherwise (see
 * the two-flow decision on ticket 06). Returns the branch's repo location,
 * for ticket 07's PR step to open or update a PR against.
 *
 * @param {string} token
 * @param {object} params
 * @param {string} params.scenarioName the scenario's human title (e.g.
 *   "Dances with Dwarves"), used for the branch name and the commit message
 * @param {string} params.texPath repository path of the .tex file, e.g.
 *   "clash/astral_run.tex"
 * @param {string} params.texContent current editor contents
 * @param {Map<string, Uint8Array>} params.uploadedFiles staged images,
 *   keyed by their repository path (already `assets/images/...` or
 *   `assets/maps/...`, per the upload popover)
 * @param {object} params.context this sign-in's discoverGithubContext()
 *   result — {username, isMember, fork}. The fork, if any, is reused as-is;
 *   a missing one is still created lazily here, on first save.
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

  // scenario-editor/<username>/<slug>, always — both flows, so branches
  // can be filtered by prefix regardless of which repo they land on. The
  // username also keeps two collaborators editing the same scenario from
  // colliding on the same upstream branch.
  const branch = `scenario-editor/${username}/${slugify(scenarioName)}`;
  const files = [
    { path: texPath, content: texContent },
    ...[...uploadedFiles.entries()].map(([path, content]) => ({ path, content })),
  ];
  const message = `Update ${scenarioName}`;

  const result = await commitFiles(token, { owner, repo, branch, message, files });
  return { ...result, isMember };
}

// Opens a PR from the just-written branch to upstream's default branch, or
// returns the one already open for it (ticket 07). GitHub's "list pulls"
// endpoint always filters `head` as "owner:branch", cross-repo or not, but
// the "create pull request" endpoint only accepts that namespaced form for
// a cross-repo (fork) head — a same-repo (collaborator) head must be the
// plain branch name, per the map's Notes on the two save flows.
export async function ensurePullRequest(token, { owner, branch, scenarioName, isMember }) {
  const upstream = await apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`, token);
  const base = upstream.default_branch;
  const listHead = `${owner}:${branch}`;

  const existing = await apiJson(
    `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls?head=${encodeURIComponent(listHead)}&state=open`,
    token,
  );
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
