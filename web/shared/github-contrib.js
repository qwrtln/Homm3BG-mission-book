import { DRAFT_GROUP_FILES } from "./build-plan.js";

export const UPSTREAM_OWNER = "qwrtln";
export const UPSTREAM_REPO = "Homm3BG-mission-book";

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

async function getUpstreamRepo(token) {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`, token);
}

export async function currentUser(token) {
  return apiJson("/user", token);
}

// Read-only; never creates a fork. Returns null if the user has none yet.
async function findExistingFork(token, username) {
  const response = await api(`/repos/${username}/${UPSTREAM_REPO}`, token);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GithubApiError(`Could not check for your fork (${response.status}).`, { status: response.status });
  }
  return response.json();
}

// GitHub's collaborator-check endpoint 403s under a public_repo-scoped
// token even for a real collaborator, so permissions.push comes from the
// repo-info call instead.
export async function discoverGithubContext(token) {
  const [user, upstream] = await Promise.all([currentUser(token), getUpstreamRepo(token)]);
  const username = user.login;
  const isMember = Boolean(upstream.permissions && upstream.permissions.push);
  const fork = isMember ? null : await findExistingFork(token, username);
  const owner = isMember ? UPSTREAM_OWNER : fork ? fork.owner.login : null;
  const repo = isMember ? UPSTREAM_REPO : fork ? fork.name : null;
  const drafts = owner ? await findResumableDrafts(token, { owner, repo, username, base: upstream.default_branch }) : [];
  return { username, isMember, fork, drafts };
}

// This user's own scenario-editor/<username>/* branches, paired with the
// .tex file each touches, found by diffing against the default branch.
async function findResumableDrafts(token, { owner, repo, username, base }) {
  const prefix = `scenario-editor/${username}/`;
  const branches = await apiJson(`/repos/${owner}/${repo}/branches?per_page=100`, token);
  const own = branches.filter((b) => b.name.startsWith(prefix));

  const drafts = [];
  for (const b of own) {
    try {
      const compare = await apiJson(
        `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(b.name)}`,
        token,
      );
      const texFile = (compare.files || []).find((f) => f.filename.endsWith(".tex") && !f.filename.endsWith("/main.tex"));
      if (texFile) drafts.push({ branch: b.name, texPath: texFile.filename });
    } catch {
      // One bad branch (deleted mid-compare, etc.) shouldn't drop the rest.
    }
  }
  return drafts;
}

function decodeBase64Utf8(base64) {
  const bytes = Uint8Array.from(atob(base64.replace(/\n/g, "")), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// Reads one file's text content at a given ref (a branch name, or the
// default branch if ref is omitted). Returns null if it doesn't exist there.
export async function getRepoFile(token, owner, repo, path, ref) {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const response = await api(`/repos/${owner}/${repo}/contents/${path}${query}`, token);
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubApiError(`Could not read "${path}" (${response.status}).`, { status: response.status });
  const data = await response.json();
  return decodeBase64Utf8(data.content);
}

// Idempotent: returns the existing fork if there is one. A new fork can
// 404 for a few seconds; ensureRepoReady covers that.
export async function ensureFork(token) {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, token, { method: "POST" });
}

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

// base_tree keeps a save from disturbing files already on the branch.
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
    // Branch tip moved (racing save); retry once against the fresh tip.
    const freshSha = await getBranchSha(token, owner, repo, branch);
    if (freshSha && freshSha !== parentSha) return commitOnto(token, owner, repo, branch, freshSha, message, files);
  }
  if (!updateResponse.ok && updateResponse.status !== 422) {
    throw new GithubApiError(`Could not update branch "${branch}" (${updateResponse.status}).`, { status: updateResponse.status });
  }

  return { owner, repo, branch, commitSha: commit.sha };
}

function draftGroupFor(texPath) {
  return DRAFT_GROUP_FILES.find((g) => texPath.startsWith(`${g.dir}/`)) || null;
}

// Adds a \clearpage + \input line to the category's main.tex if missing.
// No-op if already there, so safe on every save, not just the first.
async function ensureDraftEntry(token, { owner, repo, branch, group, texPath }) {
  const slug = texPath.slice(group.dir.length + 1).replace(/\.tex$/, "");
  const marker = `\\input{\\${group.macro}path/${slug}.tex}`;
  const current = (await getRepoFile(token, owner, repo, group.path, branch))
    ?? (await getRepoFile(token, owner, repo, group.path));
  if (current == null || current.includes(marker)) return null;
  const content = `${current.replace(/\s*$/, "")}\n\n\\clearpage\n\n${marker}\n`;
  return { path: group.path, content };
}

// Commits to the upstream repo directly for a collaborator, or to the
// caller's fork otherwise. Fork is created lazily here on first save. This
// is a plain push — it never opens or touches a PR; see ensurePullRequest.
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

// list-pulls always filters head as "owner:branch"; create-pull-request
// only accepts that form for a cross-repo (fork) head, plain branch name
// for a same-repo (collaborator) head.
export async function ensurePullRequest(token, { owner, branch, scenarioName, isMember }) {
  const upstream = await getUpstreamRepo(token);
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
