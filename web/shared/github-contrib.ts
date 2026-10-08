import { DRAFT_GROUP_FILES, type GroupFile } from "./build-plan.ts";
import { pullRequestBody } from "./submit-checklist.ts";

export const UPSTREAM_OWNER = "qwrtln";
export const UPSTREAM_REPO = "Homm3BG-mission-book";

const API = "https://api.github.com";

/**
 * The one way out of this module to the network. Every GitHub call in this
 * file goes through `http.fetch`, so a caller — a test, in practice — can
 * hand the module a recorded fake instead of reaching api.github.com.
 */
export interface HttpClient {
  /** called with an absolute URL and the same options `fetch` takes */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const defaultHttpClient: HttpClient = { fetch: (url, options) => fetch(url, options) };

let http: HttpClient = defaultHttpClient;

/**
 * Replaces the HTTP dependency this module calls GitHub through. A seam for
 * tests: the application never calls this, so no call site in app/modules/
 * has to carry a client it does not care about.
 *
 * @param client null restores the global fetch
 */
export function setHttpClient(client: HttpClient | null): void {
  http = client || defaultHttpClient;
}

class GithubApiError extends Error {
  status: number | undefined;
  rateLimited: boolean;

  constructor(message: string, { status, rateLimited = false }: { status?: number; rateLimited?: boolean } = {}) {
    super(message);
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

/**
 * One raw call against the API. Returns the Response untouched, so callers
 * can read a 404 or a 422 as a value rather than as a thrown error.
 *
 * @param path API path, beginning with "/"
 */
async function api(path: string, token: string, options: RequestInit = {}): Promise<Response> {
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param what names the shape, for the error message */
function object(payload: unknown, what: string): Record<string, unknown> {
  if (!isObject(payload)) throw new GithubApiError(`GitHub returned an unexpected ${what}.`);
  return payload;
}

function array(payload: unknown, what: string): unknown[] {
  if (!Array.isArray(payload)) throw new GithubApiError(`GitHub returned an unexpected ${what}.`);
  return payload;
}

function stringField(source: Record<string, unknown>, key: string, what: string): string {
  const value = source[key];
  if (typeof value !== "string") throw new GithubApiError(`GitHub's ${what} is missing "${key}".`);
  return value;
}

function numberField(source: Record<string, unknown>, key: string, what: string): number {
  const value = source[key];
  if (typeof value !== "number") throw new GithubApiError(`GitHub's ${what} is missing "${key}".`);
  return value;
}

function objectField(source: Record<string, unknown>, key: string, what: string): Record<string, unknown> {
  const value = source[key];
  if (!isObject(value)) throw new GithubApiError(`GitHub's ${what} is missing "${key}".`);
  return value;
}

function parseUser(payload: unknown): GithubUser {
  return { login: stringField(object(payload, "user"), "login", "user") };
}

function parseRepo(payload: unknown): GithubRepo {
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

function parseBranches(payload: unknown): GithubBranch[] {
  return array(payload, "branch list").map((entry) => ({
    name: stringField(object(entry, "branch"), "name", "branch"),
  }));
}

/** Compare lists commits oldest first, so the newest is the last entry. */
function lastCommitDate(commits: unknown): string | undefined {
  if (!Array.isArray(commits) || commits.length === 0) return undefined;
  const commit = object(commits[commits.length - 1], "compared commit").commit;
  const committer = commit && typeof commit === "object" ? (commit as Record<string, unknown>).committer : null;
  const date = committer && typeof committer === "object" ? (committer as Record<string, unknown>).date : null;
  return typeof date === "string" ? date : undefined;
}

function parseCompare(payload: unknown): GithubCompare {
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

function parseBlob(payload: unknown): GithubBlob {
  return { content: stringField(object(payload, "blob"), "content", "blob") };
}

function parseContents(payload: unknown): GithubContents {
  return { content: stringField(object(payload, "file"), "content", "file") };
}

function parseBlobRef(payload: unknown): GithubBlobRef {
  return { sha: stringField(object(payload, "file"), "sha", "file") };
}

function parseRef(payload: unknown): GithubRef {
  const ref = object(payload, "ref");
  return { object: { sha: stringField(objectField(ref, "object", "ref"), "sha", "ref") } };
}

function parseCommit(payload: unknown): GithubCommit {
  const commit = object(payload, "commit");
  return {
    sha: stringField(commit, "sha", "commit"),
    tree: { sha: stringField(objectField(commit, "tree", "commit"), "sha", "commit tree") },
  };
}

/**
 * The create-blob and create-tree responses, which this app reads only the
 * sha from.
 */
function shaOnlyParser(what: string): (payload: unknown) => GithubShaOnly {
  return (payload) => ({ sha: stringField(object(payload, what), "sha", what) });
}

function parsePullRequest(payload: unknown): GithubPullRequest {
  const pull = object(payload, "pull request");
  return {
    html_url: stringField(pull, "html_url", "pull request"),
    number: numberField(pull, "number", "pull request"),
  };
}

function parsePullRequests(payload: unknown): GithubPullRequest[] {
  return array(payload, "pull request list").map(parsePullRequest);
}

// --- Calls ----------------------------------------------------------------

/**
 * A call that must succeed. Throws GithubApiError on a rate limit or any
 * non-ok status; hands the Response back otherwise.
 *
 * @param path API path, beginning with "/"
 */
async function apiOk(path: string, token: string, options: RequestInit = {}): Promise<Response> {
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
 * @param path API path, beginning with "/"
 * @param parse one of the parsers above
 */
async function apiJson<T>(
  path: string,
  token: string,
  parse: (payload: unknown) => T,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiOk(path, token, options);
  return parse(await response.json());
}

/**
 * A call that must succeed and whose body the caller ignores — including a
 * 204, which carries none.
 *
 * @param path API path, beginning with "/"
 */
async function apiSend(path: string, token: string, options: RequestInit = {}): Promise<void> {
  await apiOk(path, token, options);
}

async function getUpstreamRepo(token: string): Promise<GithubRepo> {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`, token, parseRepo);
}

export async function currentUser(token: string): Promise<GithubUser> {
  return apiJson("/user", token, parseUser);
}

/**
 * Read-only; never creates a fork.
 *
 * @returns null if the user has none yet
 */
async function findExistingFork(token: string, username: string): Promise<GithubRepo | null> {
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
 */
export async function discoverGithubContext(token: string): Promise<GithubContext> {
  const [user, upstream] = await Promise.all([currentUser(token), getUpstreamRepo(token)]);
  const username = user.login;
  const isMember = Boolean(upstream.permissions?.push);
  const fork = isMember ? null : await findExistingFork(token, username);
  const owner = isMember ? UPSTREAM_OWNER : fork ? fork.owner.login : null;
  const repo = isMember ? UPSTREAM_REPO : fork ? fork.name : null;
  // `owner` and `repo` are always set together or both null; testing both
  // changes nothing at run time and lets the checker narrow each to a string.
  const found =
    owner && repo
      ? await findResumableDrafts(token, { owner, repo, username, base: upstream.default_branch })
      : { drafts: [], complete: true };
  return {
    username,
    isMember,
    fork,
    base: upstream.default_branch,
    drafts: found.drafts,
    draftsComplete: found.complete,
  };
}

/** A sha no commit can have, so the permission probe's ref creation can never succeed. */
const PROBE_SHA = "0".repeat(40);

/**
 * Whether the token can write to the repository the app will push to.
 * GitHub has no endpoint that lists a token's permissions, so this tries to
 * create a ref from an unresolvable sha: that creates nothing, and the answer
 * is in the status. 403 is a refusal and 422 a pass (the permission held and
 * the sha was rejected). Any other status, or a network error, passes: the
 * save-time message covers a missing permission.
 */
async function probeWriteAccess(token: string, owner: string, repo: string): Promise<void> {
  let status: number;
  try {
    const response = await api(`/repos/${owner}/${repo}/git/refs`, token, {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/scenario-editor/permission-probe", sha: PROBE_SHA }),
    });
    status = response.status;
  } catch {
    return;
  }
  if (status === 403) {
    throw new GithubApiError(
      `This token cannot write to ${owner}/${repo}. Give it \`Contents: Read and write\` on that repository.`,
      { status: 403 },
    );
  }
}

/**
 * Decides at paste time whether a token can be used, with a specific reason
 * when it cannot.
 *
 * @param token as pasted; surrounding whitespace is trimmed
 * @returns the account's context, found with the trimmed token
 * @throws GithubApiError with a user-facing message
 */
export async function validateTokenContext(token: string): Promise<GithubContext> {
  const trimmed = token.trim();
  if (!trimmed) throw new GithubApiError("Paste a GitHub token first.");

  let context: GithubContext;
  try {
    context = await discoverGithubContext(trimmed);
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 401) {
      throw new GithubApiError("The token was not accepted by GitHub. Check that you copied all of it.", {
        status: 401,
      });
    }
    throw error;
  }

  if (!context.isMember && !context.fork) {
    throw new GithubApiError(
      `This token cannot see a fork named \`${UPSTREAM_REPO}\` in your account. Fork the repository, then give the token access to that fork.`,
    );
  }
  const target =
    context.isMember || !context.fork
      ? { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO }
      : { owner: context.fork.owner.login, repo: context.fork.name };
  await probeWriteAccess(trimmed, target.owner, target.repo);
  return context;
}

/** GitHub's page size for the branch list; a full page may hide more branches. */
const BRANCH_PAGE_SIZE = 100;

/**
 * This user's own scenario-editor/<username>/* branches, paired with the
 * .tex file each touches, found by diffing against the default branch.
 *
 * `complete` is false when a compare failed or the branch page was full, so
 * a draft may be missing from the list.
 */
async function findResumableDrafts(
  token: string,
  { owner, repo, username, base }: { owner: string; repo: string; username: string; base: string },
): Promise<{ drafts: ResumableDraft[]; complete: boolean }> {
  const prefix = `scenario-editor/${username}/`;
  const branches = await apiJson(`/repos/${owner}/${repo}/branches?per_page=100`, token, parseBranches);
  const own = branches.filter((b) => b.name.startsWith(prefix));

  const drafts: ResumableDraft[] = [];
  let complete = branches.length < BRANCH_PAGE_SIZE;
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
        drafts.push({
          branch: b.name,
          kind,
          texPath: texFile.filename,
          texSha: texFile.sha,
          assets,
          lastEdit: compare.lastCommitDate,
        });
      }
    } catch {
      // One bad branch (deleted mid-compare, etc.) shouldn't drop the rest.
      complete = false;
    }
  }
  return { drafts, complete };
}

/** @param base64 base64 text, newlines and all */
function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64.replace(/\n/g, "")), (c) => c.charCodeAt(0));
}

function decodeBase64Utf8(base64: string): string {
  return new TextDecoder("utf-8").decode(decodeBase64(base64));
}

/**
 * Blobs API, not contents: contents omits the body for files over 1 MB.
 */
export async function getBlobBytes(token: string, owner: string, repo: string, sha: string): Promise<Uint8Array> {
  const blob = await apiJson(`/repos/${owner}/${repo}/git/blobs/${sha}`, token, parseBlob);
  return decodeBase64(blob.content);
}

/**
 * Blob sha of a file on the repository's default branch, without its
 * content: what a removed upload reverts to when the path predates the draft.
 *
 * @param path repository-relative path
 * @returns null if the default branch has no such file
 */
async function getDefaultBlobSha(token: string, owner: string, repo: string, path: string): Promise<string | null> {
  const response = await api(`/repos/${owner}/${repo}/contents/${path}`, token);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new GithubApiError(`Could not read "${path}" (${response.status}).`, { status: response.status });
  return parseBlobRef(await response.json()).sha;
}

/**
 * Reads one file's text content at a given ref.
 *
 * @param path repository-relative path
 * @param ref a branch name; the default branch when omitted
 * @returns null if it does not exist there
 */
export async function getRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
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
 */
export async function ensureFork(token: string): Promise<GithubRepo> {
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, token, parseRepo, { method: "POST" });
}

/**
 * Polls until a just-created fork answers, since a new one 404s briefly.
 */
async function ensureRepoReady(
  token: string,
  owner: string,
  repo: string,
  { attempts = 6, delayMs = 1500 }: { attempts?: number; delayMs?: number } = {},
): Promise<GithubRepo> {
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

/** @returns the tip commit sha, or null if no such branch */
async function getBranchSha(token: string, owner: string, repo: string, branch: string): Promise<string | null> {
  const response = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new GithubApiError(`Could not read branch "${branch}" (${response.status}).`, { status: response.status });
  const data = parseRef(await response.json());
  return data.object.sha;
}

async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  fromSha: string,
): Promise<void> {
  await apiSend(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
}

/** Branch-safe form of a scenario name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** @returns the new blob's sha */
async function createBlob(token: string, owner: string, repo: string, content: string | Uint8Array): Promise<string> {
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
 * `removed` lists paths this branch committed before and no longer wants:
 * each goes back to the default branch's version, or is deleted when the
 * default branch has none.
 * `startOver` moves an existing branch back onto the default branch's tip
 * before committing, discarding what it held.
 */
export async function commitFiles(
  token: string,
  {
    owner,
    repo,
    branch,
    message,
    files,
    removed = [],
    startOver = false,
  }: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: CommitFile[];
    removed?: string[];
    startOver?: boolean;
  },
): Promise<CommitResult> {
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
 * @param parentSha the commit to build on
 * @param removed paths to take back off the branch; see commitFiles
 * @param update force: the commit does not descend from the branch's tip
 */
async function commitOnto(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  parentSha: string,
  message: string,
  files: CommitFile[],
  removed: string[],
  { force = false }: { force?: boolean } = {},
): Promise<CommitResult> {
  const parentCommit = await apiJson(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token, parseCommit);

  const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
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
 */
export function editBranchName(username: string, texPath: string): string {
  const basename = (texPath.split("/").pop() ?? texPath).replace(/\.tex$/, "");
  return `scenario-editor/${username}/updates/${slugify(basename)}`;
}

/**
 * The upstream branch an earlier session left for an in-place edit of texPath.
 * Only members edit in place, so this only ever looks at the upstream repo.
 *
 * @returns the branch name, or null when none exists
 */
export async function findEditBranch(
  token: string,
  { username, texPath }: { username: string; texPath: string },
): Promise<string | null> {
  const branch = editBranchName(username, texPath);
  return (await getBranchSha(token, UPSTREAM_OWNER, UPSTREAM_REPO, branch)) === null ? null : branch;
}

/** Every branch this app creates starts with this; nothing else may be deleted by it. */
const EDITOR_BRANCH_PREFIX = "scenario-editor/";

/**
 * Deletes a work-in-progress branch. Refuses any branch the app did not
 * create, so a bad argument can never remove main or someone else's work.
 * An already-missing branch counts as deleted.
 */
export async function deleteWorkBranch(
  token: string,
  { owner, repo, branch }: { owner: string; repo: string; branch: string },
): Promise<void> {
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

function draftGroupFor(texPath: string): GroupFile | null {
  return DRAFT_GROUP_FILES.find((g) => texPath.startsWith(`${g.dir}/`)) || null;
}

/**
 * Adds a \clearpage + \input line to the category's main.tex if missing.
 * No-op if already there, so safe on every save, not just the first.
 *
 * @returns null when no edit is needed
 */
async function ensureDraftEntry(
  token: string,
  {
    owner,
    repo,
    branch,
    group,
    texPath,
  }: { owner: string; repo: string; branch: string; group: GroupFile; texPath: string },
): Promise<CommitFile | null> {
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
 * @param request.scenarioName the contributor's own name for it
 * @param request.texPath repository path the .tex lands at
 * @param request.texContent the editor's current text
 * @param request.uploadedFiles path -> bytes
 * @param request.removedUploads uploads an earlier save committed that the
 *   contributor has since dropped or renamed
 * @param request.context from discoverGithubContext
 * @param request.branch the branch a resumed or already-saved draft lives
 *   on; overrides the name-derived one
 * @param request.mode "edit" changes the file at texPath in place: an
 *   updates/ branch, no group file
 * @param request.startOver edit mode only: discard the branch's earlier
 *   work and commit onto the default branch
 */
export async function saveScenarioToRepo(
  token: string,
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
  }: {
    scenarioName: string;
    texPath: string;
    texContent: string;
    uploadedFiles: Map<string, Uint8Array>;
    removedUploads?: string[];
    context: GithubContext;
    branch?: string;
    mode?: "new" | "edit";
    startOver?: boolean;
  },
): Promise<SaveTarget> {
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
  const files: CommitFile[] = [
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
 */
export async function findPullRequest(
  token: string,
  { owner, branch }: { owner: string; branch: string },
): Promise<GithubPullRequest | null> {
  const listHead = `${owner}:${branch}`;
  const existing = await apiJson(
    `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls?head=${encodeURIComponent(listHead)}&state=open`,
    token,
    parsePullRequests,
  );
  return existing[0] ?? null;
}

/** The pull request title: one rule for the API path and the compare page. */
export function pullRequestTitle(mode: "new" | "edit", scenarioName: string): string {
  return mode === "edit" ? `Update ${scenarioName}` : `New scenario: ${scenarioName}`;
}

/**
 * The github.com compare page that opens a pull request with its title and
 * body filled in, for a token that may not create one through the API.
 *
 * The head is always "owner:branch". github.com accepts it for a fork and
 * for a branch of the upstream repository itself, so a member needs no form
 * of its own.
 */
export function compareUrl({
  base,
  owner,
  branch,
  title,
  body,
}: {
  base: string;
  owner: string;
  branch: string;
  title: string;
  body: string;
}): string {
  const range = `${encodeURIComponent(base)}...${encodeURIComponent(owner)}:${encodeURIComponent(branch)}`;
  return `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/compare/${range}?quick_pull=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/**
 * Opens a pull request for a saved branch, or returns the one already open
 * for it.
 *
 * create-pull-request only accepts the "owner:branch" head form for a
 * cross-repo (fork) head, plain branch name for a same-repo (collaborator)
 * head.
 *
 * An existing pull request is returned as it is; its body is not updated.
 *
 * @param request.body the pull request description; defaults to the fixed
 *   line with no checklist
 */
export async function ensurePullRequest(
  token: string,
  {
    owner,
    branch,
    scenarioName,
    isMember,
    mode = "new",
    body = pullRequestBody([]),
  }: { owner: string; branch: string; scenarioName: string; isMember: boolean; mode?: "new" | "edit"; body?: string },
): Promise<GithubPullRequest> {
  const upstream = await getUpstreamRepo(token);
  const base = upstream.default_branch;
  const listHead = `${owner}:${branch}`;

  const existing = await findPullRequest(token, { owner, branch });
  if (existing) return existing;

  const head = isMember ? branch : listHead;
  return apiJson(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`, token, parsePullRequest, {
    method: "POST",
    body: JSON.stringify({
      title: pullRequestTitle(mode, scenarioName),
      head,
      base,
      body,
    }),
  });
}

export { GithubApiError };
