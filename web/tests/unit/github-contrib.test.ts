// Tier 1 tests for web/shared/github-contrib.ts.
//
// The module calls GitHub through an injected HttpClient (setHttpClient), so
// these tests hand it a small recorded fake of the API instead of reaching
// api.github.com. The fake keeps real state — branches, files, blobs, trees,
// commits — so a second save genuinely sees what the first one committed,
// which is what makes the main.tex idempotency test mean anything.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { DRAFT_GROUP_FILES } from "../../shared/build-plan.ts";
import {
  compareUrl,
  deleteWorkBranch,
  discoverGithubContext,
  ensurePullRequest,
  findEditBranch,
  GithubApiError,
  getRepoFile,
  pullRequestTitle,
  saveScenarioToRepo,
  setHttpClient,
  slugify,
  UPSTREAM_OWNER,
  UPSTREAM_REPO,
  validateTokenContext,
} from "../../shared/github-contrib.ts";
import { signInExpiredMessage, tokenSaveFailureMessage } from "../../shared/sign-in-messages.ts";

const API = "https://api.github.com";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function notFound(): Response {
  return json({ message: "Not Found" }, 404);
}

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

interface PullRequest {
  html_url: string;
  number: number;
  head: string;
}

interface TreeEntry {
  path: string;
  sha: string | null;
}

/** The union of every JSON body the fake's routes read; each route reads its own fields. */
interface GitBody {
  ref: string;
  sha: string;
  head: string;
  force?: boolean;
  encoding?: string;
  content: string;
  base_tree: string;
  tree: TreeEntry[];
  message: string;
  title: string;
  body: string;
  base: string;
}

interface RecordedCall {
  method: string;
  path: string;
  query: string;
  body: GitBody;
}

interface AppliedCommit {
  branch: string;
  message: string;
  files: { path: string; content: string }[];
}

interface GithubFakeOptions {
  /** who the token belongs to */
  userLogin?: string;
  /** upstream permissions.push, the collaborator test */
  push?: boolean;
  /** whether the user already has a fork; true unless set to false */
  forkExists?: boolean;
  defaultBranch?: string;
  /** default-branch path -> text */
  files?: Record<string, string>;
  /** branches that already exist */
  branchNames?: string[];
  /** branch -> .tex paths its compare against the default branch lists */
  branchTexFiles?: Record<string, string[]>;
  /** branches whose compare answers 500 */
  failingCompares?: string[];
  /** open pull requests */
  pulls?: PullRequest[];
  /** status for a ref creation from the all-zero sha (the write probe); 422 when unset */
  probeStatus?: number;
  /** answer every call 401, as for a revoked token */
  unauthorized?: boolean;
}

interface GithubFake {
  client: { fetch: (url: string, options?: RequestInit) => Promise<Response> };
  calls: RecordedCall[];
  commits: AppliedCommit[];
  pulls: PullRequest[];
  hasBranch: (branch: string) => boolean;
  fileOn: (branch: string, path: string) => string | undefined;
}

/**
 * A recorded fake of the slice of the GitHub API this module uses.
 *
 * @param options what the fake starts with
 */
function createGithubFake(options: GithubFakeOptions = {}): GithubFake {
  const userLogin = options.userLogin || "octocat";
  const defaultBranch = options.defaultBranch || "main";
  const forkOwner = userLogin;

  const base = new Map(Object.entries(options.files || {}));
  const branches = new Map<string, string>([[defaultBranch, "base-sha"]]);
  const branchFiles = new Map<string, Map<string, string>>([[defaultBranch, base]]);
  for (const name of options.branchNames || []) {
    branches.set(name, "base-sha");
    branchFiles.set(name, new Map(base));
  }

  const commits = new Map<string, { tree: string; entries: TreeEntry[]; message: string }>([
    ["base-sha", { tree: "base-tree", entries: [], message: "" }],
  ]);
  const blobs = new Map<string, string>();
  const trees = new Map<string, TreeEntry[]>();
  const treeShaByContent = new Map<string, string>();
  const blobShaByContent = new Map<string, string>();
  /** tree sha -> path -> blob sha, fully resolved */
  const resolvedTrees = new Map<string, Map<string, string>>();

  function blobShaFor(content: string): string {
    const key = `raw:${content}`;
    let sha = blobShaByContent.get(key);
    if (!sha) {
      counter += 1;
      sha = `blob-${counter}`;
      blobShaByContent.set(key, sha);
      blobs.set(sha, content);
    }
    return sha;
  }

  function canonicalEntries(entriesMap: Map<string, string>): [string, string][] {
    return [...entriesMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  function resolveTree(sha: string): Map<string, string> {
    const known = resolvedTrees.get(sha);
    if (known) return known;
    if (sha === "base-tree") {
      const resolved = new Map<string, string>();
      for (const [filePath, content] of base) resolved.set(filePath, blobShaFor(content));
      resolvedTrees.set(sha, resolved);
      treeShaByContent.set(JSON.stringify(canonicalEntries(resolved)), sha);
      return resolved;
    }
    return new Map();
  }

  const calls: RecordedCall[] = [];
  const applied: AppliedCommit[] = [];
  const pulls = [...(options.pulls || [])];
  let forkExists = options.forkExists !== false;
  let counter = 0;

  function repoPayload(owner: string, withPermissions: boolean): object {
    return {
      name: UPSTREAM_REPO,
      owner: { login: owner },
      default_branch: defaultBranch,
      ...(withPermissions ? { permissions: { push: options.push === true } } : {}),
    };
  }

  async function handle(url: string, init: RequestInit = {}): Promise<Response> {
    assert.ok(url.startsWith(API), `call escaped the seam: ${url}`);
    const method = (init.method || "GET").toUpperCase();
    const body = (init.body ? JSON.parse(String(init.body)) : null) as GitBody;
    const [path, query = ""] = url.slice(API.length).split("?");
    calls.push({ method, path, query, body });

    if (options.unauthorized) return json({ message: "Bad credentials" }, 401);

    let match: RegExpMatchArray | null;

    if (method === "GET" && path === "/user") return json({ login: userLogin });

    if (method === "POST" && /^\/repos\/[^/]+\/[^/]+\/forks$/.test(path)) {
      forkExists = true;
      return json(repoPayload(forkOwner, false), 202);
    }

    if ((match = path.match(/^\/repos\/([^/]+)\/([^/]+)$/)) && method === "GET") {
      const owner = match[1];
      if (owner === UPSTREAM_OWNER) return json(repoPayload(UPSTREAM_OWNER, true));
      return forkExists ? json(repoPayload(owner, false)) : notFound();
    }

    if ((match = path.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/)) && method === "GET") {
      const filePath = match[1];
      const ref = new URLSearchParams(query).get("ref");
      if (ref !== null && !branches.has(ref)) return notFound();
      const source = ref !== null ? branchFiles.get(ref) : base;
      const content = source?.get(filePath);
      if (content === undefined) return notFound();
      return json({ content: base64(content), sha: blobShaFor(content) });
    }

    if ((match = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/)) && method === "GET") {
      const branch = decodeURIComponent(match[1]);
      const sha = branches.get(branch);
      return sha === undefined ? notFound() : json({ object: { sha } });
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs$/) && method === "POST") {
      if (/^0+$/.test(body.sha)) return json({ message: "probe" }, options.probeStatus ?? 422);
      const branch = String(body.ref).replace("refs/heads/", "");
      branches.set(branch, body.sha);
      branchFiles.set(branch, new Map(base));
      return json({ ref: body.ref }, 201);
    }

    if ((match = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/commits\/(.+)$/)) && method === "GET") {
      const commit = commits.get(match[1]);
      if (!commit) return notFound();
      return json({ sha: match[1], tree: { sha: commit.tree } });
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/blobs$/) && method === "POST") {
      // Content-addressed like the real API, so an unchanged file reuses its
      // existing blob sha instead of minting a new one.
      const content = body.encoding === "base64" ? Buffer.from(body.content, "base64").toString("utf8") : body.content;
      return json({ sha: blobShaFor(content) }, 201);
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/trees$/) && method === "POST") {
      // Content-addressed like the real API: base_tree overlaid with entries
      // that leave every path unchanged resolves back to base_tree's own
      // sha, which is what lets commitOnto notice a save changed nothing.
      const merged = new Map(resolveTree(body.base_tree));
      // A null sha deletes the path, as on GitHub.
      for (const entry of body.tree) {
        if (entry.sha === null) merged.delete(entry.path);
        else merged.set(entry.path, entry.sha);
      }
      const key = JSON.stringify(canonicalEntries(merged));
      let sha = treeShaByContent.get(key);
      if (!sha) {
        counter += 1;
        sha = `tree-${counter}`;
        treeShaByContent.set(key, sha);
        resolvedTrees.set(sha, merged);
      }
      trees.set(sha, body.tree);
      return json({ sha }, 201);
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/commits$/) && method === "POST") {
      counter += 1;
      const sha = `commit-${counter}`;
      commits.set(sha, {
        tree: body.tree as unknown as string,
        entries: trees.get(body.tree as unknown as string) || [],
        message: body.message,
      });
      return json({ sha, tree: { sha: body.tree as unknown as string } }, 201);
    }

    if ((match = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/)) && method === "PATCH") {
      const branch = decodeURIComponent(match[1]);
      const commit = commits.get(body.sha);
      if (!commit) return notFound();
      // A ref moved off its own history is only accepted with force, as on GitHub.
      const files = body.force ? new Map(base) : branchFiles.get(branch) || new Map(base);
      const written = commit.entries
        .filter((entry) => entry.sha !== null)
        .map((entry) => ({ path: entry.path, content: blobs.get(entry.sha as string) || "" }));
      for (const file of written) files.set(file.path, file.content);
      for (const entry of commit.entries) if (entry.sha === null) files.delete(entry.path);
      branchFiles.set(branch, files);
      branches.set(branch, body.sha);
      applied.push({ branch, message: commit.message, files: written });
      return json({ object: { sha: body.sha } });
    }

    if ((match = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/)) && method === "DELETE") {
      const branch = decodeURIComponent(match[1]);
      if (!branches.delete(branch)) return json({ message: "Reference does not exist" }, 422);
      branchFiles.delete(branch);
      return new Response(null, { status: 204 });
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/branches$/) && method === "GET") {
      return json([...branches.keys()].map((name) => ({ name })));
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/compare\//) && method === "GET") {
      const branch = decodeURIComponent(path.split("...").pop() ?? "");
      if (options.failingCompares?.includes(branch)) return json({ message: "boom" }, 500);
      const listed = options.branchTexFiles?.[branch] || [];
      return json({ files: listed.map((filename) => ({ filename, sha: `sha-of-${filename}`, status: "modified" })) });
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/pulls$/) && method === "GET") {
      const head = new URLSearchParams(query).get("head");
      return json(pulls.filter((pull) => pull.head === head));
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/pulls$/) && method === "POST") {
      const created = {
        html_url: `https://github.com/pull/${pulls.length + 1}`,
        number: pulls.length + 1,
        head: body.head,
      };
      pulls.push(created);
      return json(created, 201);
    }

    return json({ message: `the fake has no route for ${method} ${path}` }, 599);
  }

  return {
    client: { fetch: handle },
    calls,
    commits: applied,
    pulls,
    hasBranch: (branch: string) => branches.has(branch),
    fileOn: (branch: string, path: string) => {
      const files = branchFiles.get(branch);
      return files ? files.get(path) : undefined;
    },
  };
}

/**
 * @param fake
 * @returns the files of the last push
 */
function lastCommitFiles(fake: GithubFake): { path: string; content: string }[] {
  const commit = fake.commits[fake.commits.length - 1];
  assert.ok(commit, "nothing was committed");
  return commit.files;
}

function context(overrides: Partial<GithubContext> = {}): GithubContext {
  return {
    username: "octocat",
    isMember: false,
    fork: { name: UPSTREAM_REPO, owner: { login: "octocat" }, default_branch: "main" },
    base: "main",
    drafts: [],
    draftsComplete: true,
    ...overrides,
  };
}

const CLASH_MAIN = "draft-scenarios/clash/main.tex";
const CLASH_MAIN_SOURCE = String.raw`\addscenariogroup{Clash}{\layout/clash.png}

\clearpage

\input{\clashpath/secret_bomb_stash.tex}
`;

afterEach(() => setHttpClient(null));

// --- slugify and the branch name -----------------------------------------

test("slugify lowercases, collapses runs of non-alphanumerics, and trims them", () => {
  assert.equal(slugify("The Valley of Wild Magic"), "the-valley-of-wild-magic");
  assert.equal(slugify("  Grail & Glory!!  "), "grail-glory");
  assert.equal(slugify("Round 2 -- Hero's Return"), "round-2-hero-s-return");
  // Lossy on non-ASCII by design: a branch name has to be safe, not faithful.
  assert.equal(slugify("épée"), "p-e");
});

test("a save pushes to scenario-editor/<username>/<slug>", async () => {
  const fake = createGithubFake({ files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  const saved = await saveScenarioToRepo("t", {
    scenarioName: "The Valley of Wild Magic",
    texPath: "draft-scenarios/clash/the-valley-of-wild-magic.tex",
    texContent: "\\section{Valley}",
    uploadedFiles: new Map(),
    context: context(),
  });

  assert.equal(saved.branch, "scenario-editor/octocat/the-valley-of-wild-magic");
});

// --- save-target resolution ----------------------------------------------

test("permissions.push decides membership, and a collaborator is not asked for a fork", async () => {
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  const discovered = await discoverGithubContext("t");

  assert.equal(discovered.isMember, true);
  assert.equal(discovered.fork, null);
  assert.equal(discovered.username, "octocat");
  assert.equal(
    fake.calls.some((call) => call.path === "/repos/octocat/Homm3BG-mission-book"),
    false,
  );
});

test("without permissions.push the user is a contributor, and their existing fork is found", async () => {
  const fake = createGithubFake({ push: false, forkExists: true });
  setHttpClient(fake.client);

  const discovered = await discoverGithubContext("t");

  assert.equal(discovered.isMember, false);
  assert.equal(discovered.fork?.owner.login, "octocat");
});

test("a collaborator's save lands on the upstream repository", async () => {
  const fake = createGithubFake({ push: true, files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  const saved = await saveScenarioToRepo("t", {
    scenarioName: "Dragon Valley",
    texPath: "draft-scenarios/clash/dragon-valley.tex",
    texContent: "\\section{Dragons}",
    uploadedFiles: new Map(),
    context: context({ isMember: true, fork: null }),
  });

  assert.equal(saved.owner, UPSTREAM_OWNER);
  assert.equal(saved.repo, UPSTREAM_REPO);
  assert.equal(saved.isMember, true);
  assert.equal(
    fake.calls.some((call) => call.path.endsWith("/forks")),
    false,
  );
});

test("a contributor's save lands on their fork, created lazily when they have none", async () => {
  const fake = createGithubFake({ push: false, files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  const saved = await saveScenarioToRepo("t", {
    scenarioName: "Dragon Valley",
    texPath: "draft-scenarios/clash/dragon-valley.tex",
    texContent: "\\section{Dragons}",
    uploadedFiles: new Map(),
    context: context({ fork: null }),
  });

  assert.equal(saved.owner, "octocat");
  assert.equal(saved.repo, UPSTREAM_REPO);
  assert.equal(saved.isMember, false);
  assert.equal(fake.calls.filter((call) => call.method === "POST" && call.path.endsWith("/forks")).length, 1);
});

test("a contributor who already has a fork is not asked to create another", async () => {
  const fake = createGithubFake({ push: false, forkExists: true, files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  const saved = await saveScenarioToRepo("t", {
    scenarioName: "Dragon Valley",
    texPath: "draft-scenarios/clash/dragon-valley.tex",
    texContent: "\\section{Dragons}",
    uploadedFiles: new Map(),
    context: context(),
  });

  assert.equal(saved.owner, "octocat");
  assert.equal(
    fake.calls.some((call) => call.path.endsWith("/forks")),
    false,
  );
});

// --- the new-scenario path rule ------------------------------------------

test("every draft group file lives under draft-scenarios/, never a published directory", () => {
  for (const group of DRAFT_GROUP_FILES) {
    assert.ok(group.dir.startsWith("draft-scenarios/"), `${group.dir} is not a draft directory`);
    assert.ok(group.path.startsWith("draft-scenarios/"), `${group.path} is not a draft group file`);
  }
});

test("a dropped upload comes off the branch on the next save; a kept or re-added one stays", async () => {
  const fake = createGithubFake({ files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);
  const texPath = "draft-scenarios/clash/valley.tex";
  const first = await saveScenarioToRepo("t", {
    scenarioName: "Valley",
    texPath,
    texContent: "one",
    uploadedFiles: new Map([
      ["assets/images/valley.png", new Uint8Array([1])],
      ["assets/maps/valley_2p.png", new Uint8Array([2])],
      ["assets/map-files/valley_2p.map", new Uint8Array([3])],
      ["assets/maps/valley_3p.png", new Uint8Array([4])],
    ]),
    context: context(),
  });

  // The header was replaced by a JPG, the two-player layout and its map file
  // were removed, and the three-player layout stayed.
  await saveScenarioToRepo("t", {
    scenarioName: "Valley",
    texPath,
    texContent: "two",
    uploadedFiles: new Map([
      ["assets/images/valley.jpg", new Uint8Array([5])],
      ["assets/maps/valley_3p.png", new Uint8Array([4])],
    ]),
    removedUploads: [
      "assets/images/valley.png",
      "assets/maps/valley_2p.png",
      "assets/map-files/valley_2p.map",
      "assets/maps/valley_3p.png",
    ],
    context: context(),
    branch: first.branch,
  });

  assert.equal(fake.fileOn(first.branch, "assets/images/valley.png"), undefined);
  assert.equal(fake.fileOn(first.branch, "assets/maps/valley_2p.png"), undefined);
  assert.equal(fake.fileOn(first.branch, "assets/map-files/valley_2p.map"), undefined);
  assert.ok(fake.fileOn(first.branch, "assets/images/valley.jpg") !== undefined);
  assert.ok(fake.fileOn(first.branch, "assets/maps/valley_3p.png") !== undefined, "a kept upload was deleted");
});

test("a dropped upload that overwrote a default-branch file goes back to that file, not deleted", async () => {
  const fake = createGithubFake({
    files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE, "assets/images/crusader.png": "original" },
  });
  setHttpClient(fake.client);
  const texPath = "draft-scenarios/clash/valley.tex";
  const first = await saveScenarioToRepo("t", {
    scenarioName: "Valley",
    texPath,
    texContent: "one",
    uploadedFiles: new Map([["assets/images/crusader.png", new TextEncoder().encode("mine")]]),
    context: context(),
  });
  assert.equal(fake.fileOn(first.branch, "assets/images/crusader.png"), "mine");

  await saveScenarioToRepo("t", {
    scenarioName: "Valley",
    texPath,
    texContent: "two",
    uploadedFiles: new Map(),
    removedUploads: ["assets/images/crusader.png"],
    context: context(),
    branch: first.branch,
  });

  assert.equal(fake.fileOn(first.branch, "assets/images/crusader.png"), "original");
});

test("starting an in-place edit over removes nothing: the reset branch has nothing earlier", async () => {
  const fake = createGithubFake({
    push: true,
    files: { "clash/secret_bomb_stash.tex": "old" },
    branchNames: ["scenario-editor/octocat/updates/secret-bomb-stash"],
  });
  setHttpClient(fake.client);

  await saveScenarioToRepo("t", {
    scenarioName: "Secret Bomb Stash",
    texPath: "clash/secret_bomb_stash.tex",
    texContent: "new",
    uploadedFiles: new Map(),
    removedUploads: ["assets/images/gone.png"],
    context: context({ isMember: true, fork: null }),
    mode: "edit",
    startOver: true,
  });

  const trees = fake.calls.filter((call) => call.method === "POST" && call.path.endsWith("/git/trees"));
  assert.deepEqual(
    trees.flatMap((call) => call.body.tree.filter((entry) => entry.sha === null)),
    [],
  );
});

test("a new scenario is committed at draft-scenarios/<category>/<slug>.tex, with its group file", async () => {
  const fake = createGithubFake({ files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  await saveScenarioToRepo("t", {
    scenarioName: "Dragon Valley",
    texPath: "draft-scenarios/clash/dragon-valley.tex",
    texContent: "\\section{Dragons}",
    uploadedFiles: new Map([["assets/images/dragon.png", new Uint8Array([1, 2, 3])]]),
    context: context(),
  });

  const paths = lastCommitFiles(fake).map((file) => file.path);
  assert.deepEqual(paths, ["draft-scenarios/clash/dragon-valley.tex", "assets/images/dragon.png", CLASH_MAIN]);
  assert.equal(
    paths.some((path) => path.startsWith("clash/")),
    false,
  );
});

test("an edit to a published scenario saves back to its own path and touches no group file", async () => {
  const fake = createGithubFake({ files: { "clash/main.tex": CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  await saveScenarioToRepo("t", {
    scenarioName: "Secret Bomb Stash",
    texPath: "clash/secret_bomb_stash.tex",
    texContent: "\\section{Bombs}",
    uploadedFiles: new Map(),
    context: context(),
  });

  assert.deepEqual(
    lastCommitFiles(fake).map((file) => file.path),
    ["clash/secret_bomb_stash.tex"],
  );
});

// --- editing in place (members) ------------------------------------------

test("an in-place edit pushes to scenario-editor/<username>/updates/<slug of the file's basename>", async () => {
  const fake = createGithubFake({ push: true, files: { "clash/secret_bomb_stash.tex": "old" } });
  setHttpClient(fake.client);

  const saved = await saveScenarioToRepo("t", {
    scenarioName: "A title the editor retitled",
    texPath: "clash/secret_bomb_stash.tex",
    texContent: "new",
    uploadedFiles: new Map(),
    context: context({ isMember: true, fork: null }),
    mode: "edit",
  });

  assert.equal(saved.branch, "scenario-editor/octocat/updates/secret-bomb-stash");
  assert.equal(saved.owner, UPSTREAM_OWNER);
  assert.equal(fake.fileOn(saved.branch, "clash/secret_bomb_stash.tex"), "new");
});

test("saving content identical to the branch tip commits nothing, but still reports success", async () => {
  const fake = createGithubFake({ push: true, files: { "clash/secret_bomb_stash.tex": "old" } });
  setHttpClient(fake.client);
  const request = {
    scenarioName: "Secret Bomb Stash",
    texPath: "clash/secret_bomb_stash.tex",
    texContent: "new",
    uploadedFiles: new Map(),
    context: context({ isMember: true, fork: null }),
    mode: "edit" as const,
  };

  const first = await saveScenarioToRepo("t", request);
  assert.equal(fake.commits.length, 1, "the real edit was committed");

  const second = await saveScenarioToRepo("t", { ...request, branch: first.branch });

  assert.equal(fake.commits.length, 1, "no second commit was pushed for unchanged content");
  assert.equal(second.commitSha, first.commitSha);
  assert.equal(fake.fileOn(first.branch, "clash/secret_bomb_stash.tex"), "new");
});

test("an in-place edit of a draft never touches its group file, even when it lists no \\input for it", async () => {
  const fake = createGithubFake({
    push: true,
    files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE, "draft-scenarios/clash/unlisted.tex": "old" },
  });
  setHttpClient(fake.client);

  await saveScenarioToRepo("t", {
    scenarioName: "Unlisted",
    texPath: "draft-scenarios/clash/unlisted.tex",
    texContent: "new",
    uploadedFiles: new Map(),
    context: context({ isMember: true, fork: null }),
    mode: "edit",
  });

  assert.deepEqual(
    lastCommitFiles(fake).map((file) => file.path),
    ["draft-scenarios/clash/unlisted.tex"],
  );
});

test('an in-place edit is committed as "Edit <name>"', async () => {
  const fake = createGithubFake({ push: true, files: { "clash/secret_bomb_stash.tex": "old" } });
  setHttpClient(fake.client);

  await saveScenarioToRepo("t", {
    scenarioName: "Secret Bomb Stash",
    texPath: "clash/secret_bomb_stash.tex",
    texContent: "new",
    uploadedFiles: new Map(),
    context: context({ isMember: true, fork: null }),
    mode: "edit",
  });

  assert.equal(fake.commits[fake.commits.length - 1].message, "Edit Secret Bomb Stash");
});

test("findEditBranch answers the branch an earlier session left for that file, and null when there is none", async () => {
  const fake = createGithubFake({
    push: true,
    branchNames: ["scenario-editor/octocat/updates/secret-bomb-stash"],
  });
  setHttpClient(fake.client);

  assert.equal(
    await findEditBranch("t", { username: "octocat", texPath: "clash/secret_bomb_stash.tex" }),
    "scenario-editor/octocat/updates/secret-bomb-stash",
  );
  assert.equal(await findEditBranch("t", { username: "octocat", texPath: "clash/other.tex" }), null);
});

test("a resumable draft says whether it is an in-place edit or a new draft, by its branch name", async () => {
  const fake = createGithubFake({
    push: true,
    branchNames: ["scenario-editor/octocat/updates/secret-bomb-stash", "scenario-editor/octocat/valley"],
    branchTexFiles: {
      "scenario-editor/octocat/updates/secret-bomb-stash": ["clash/secret_bomb_stash.tex"],
      "scenario-editor/octocat/valley": ["draft-scenarios/clash/valley.tex"],
    },
  });
  setHttpClient(fake.client);

  const { drafts } = await discoverGithubContext("t");

  assert.deepEqual(
    drafts.map((draft) => [draft.texPath, draft.kind]),
    [
      ["clash/secret_bomb_stash.tex", "edit"],
      ["draft-scenarios/clash/valley.tex", "new"],
    ],
  );
});

test("a resumable draft keeps the .tex blob sha from the compare", async () => {
  const fake = createGithubFake({
    push: true,
    branchNames: ["scenario-editor/octocat/valley"],
    branchTexFiles: { "scenario-editor/octocat/valley": ["draft-scenarios/clash/valley.tex"] },
  });
  setHttpClient(fake.client);

  const { drafts, draftsComplete } = await discoverGithubContext("t");

  assert.equal(drafts[0].texSha, "sha-of-draft-scenarios/clash/valley.tex");
  assert.equal(draftsComplete, true);
});

test("the draft lookup is incomplete when a compare fails", async () => {
  const fake = createGithubFake({
    push: true,
    branchNames: ["scenario-editor/octocat/valley", "scenario-editor/octocat/castle"],
    branchTexFiles: {
      "scenario-editor/octocat/valley": ["draft-scenarios/clash/valley.tex"],
      "scenario-editor/octocat/castle": ["draft-scenarios/clash/castle.tex"],
    },
    failingCompares: ["scenario-editor/octocat/castle"],
  });
  setHttpClient(fake.client);

  const { drafts, draftsComplete } = await discoverGithubContext("t");

  assert.deepEqual(
    drafts.map((draft) => draft.texPath),
    ["draft-scenarios/clash/valley.tex"],
  );
  assert.equal(draftsComplete, false);
});

test("the draft lookup is incomplete when the branch page is full", async () => {
  // the default branch fills the 100th slot
  const names = Array.from({ length: 99 }, (_, i) => `feature/b${i}`);
  const fake = createGithubFake({ push: true, branchNames: names });
  setHttpClient(fake.client);

  const { draftsComplete } = await discoverGithubContext("t");

  assert.equal(draftsComplete, false);
});

test("a resumable draft carries its header, map images and map-editor files, and nothing else", async () => {
  const fake = createGithubFake({
    push: true,
    branchNames: ["scenario-editor/octocat/valley"],
    branchTexFiles: {
      "scenario-editor/octocat/valley": [
        "draft-scenarios/clash/valley.tex",
        "assets/images/valley.png",
        "assets/maps/valley_2p.png",
        "assets/map-files/valley_2p.map",
        "README.md",
      ],
    },
  });
  setHttpClient(fake.client);

  const { drafts } = await discoverGithubContext("t");

  assert.deepEqual(
    drafts[0].assets.map((asset) => asset.path),
    ["assets/images/valley.png", "assets/maps/valley_2p.png", "assets/map-files/valley_2p.map"],
  );
});

test('an in-place edit\'s pull request is titled "Update <name>"', async () => {
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  await ensurePullRequest("t", {
    owner: UPSTREAM_OWNER,
    branch: "scenario-editor/octocat/updates/secret-bomb-stash",
    scenarioName: "Secret Bomb Stash",
    isMember: true,
    mode: "edit",
  });

  const opened = fake.calls.find((call) => call.method === "POST" && call.path.endsWith("/pulls"));
  assert.equal(opened?.body.title, "Update Secret Bomb Stash");
});

test("a new pull request carries the body the caller passes", async () => {
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  await ensurePullRequest("t", {
    owner: UPSTREAM_OWNER,
    branch: "scenario-editor/octocat/valley",
    scenarioName: "Valley",
    isMember: true,
    body: "### Pre-submit checklist\n\n- [x] **Playtested:** yes",
  });

  const opened = fake.calls.find((call) => call.method === "POST" && call.path.endsWith("/pulls"));
  assert.equal(opened?.body.body, "### Pre-submit checklist\n\n- [x] **Playtested:** yes");
});

test("a new pull request without a body gets the fixed editor line", async () => {
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  await ensurePullRequest("t", {
    owner: UPSTREAM_OWNER,
    branch: "scenario-editor/octocat/valley",
    scenarioName: "Valley",
    isMember: true,
  });

  const opened = fake.calls.find((call) => call.method === "POST" && call.path.endsWith("/pulls"));
  assert.equal(opened?.body.body, "Edited in the browser mission book editor.");
});

test("startOver resets the edit branch to the default branch and commits the new content on top", async () => {
  const fake = createGithubFake({ push: true, files: { "clash/secret_bomb_stash.tex": "main copy" } });
  setHttpClient(fake.client);
  const request = {
    scenarioName: "Secret Bomb Stash",
    texPath: "clash/secret_bomb_stash.tex",
    uploadedFiles: new Map(),
    context: context({ isMember: true, fork: null }),
    mode: "edit" as const,
  };

  const first = await saveScenarioToRepo("t", {
    ...request,
    texContent: "earlier edit",
    uploadedFiles: new Map([["assets/images/old.png", new Uint8Array([1])]]),
  });
  assert.equal(fake.fileOn(first.branch, "clash/secret_bomb_stash.tex"), "earlier edit");

  const second = await saveScenarioToRepo("t", { ...request, texContent: "fresh edit", startOver: true });

  assert.equal(second.branch, first.branch);
  assert.equal(fake.fileOn(second.branch, "clash/secret_bomb_stash.tex"), "fresh edit");
  assert.equal(fake.fileOn(second.branch, "assets/images/old.png"), undefined);
});

// --- the idempotent main.tex append --------------------------------------

test("the first save appends one \\clearpage and one \\input line to the group file", async () => {
  const fake = createGithubFake({ files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  await saveScenarioToRepo("t", {
    scenarioName: "Dragon Valley",
    texPath: "draft-scenarios/clash/dragon-valley.tex",
    texContent: "\\section{Dragons}",
    uploadedFiles: new Map(),
    context: context(),
  });

  const groupFile = lastCommitFiles(fake).find((file) => file.path === CLASH_MAIN);
  assert.ok(groupFile, "the group file was not committed");
  assert.ok(groupFile.content.endsWith("\\clearpage\n\n\\input{\\clashpath/dragon-valley.tex}\n"));
  // The macro is the one the group file's own lines already use.
  assert.ok(groupFile.content.includes("\\input{\\clashpath/secret_bomb_stash.tex}"));
  assert.equal(groupFile.content.includes("clashpathpath"), false);
});

test("a second save of the same scenario does not append the \\input line again", async () => {
  const fake = createGithubFake({ files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  const save = (texContent: string) =>
    saveScenarioToRepo("t", {
      scenarioName: "Dragon Valley",
      texPath: "draft-scenarios/clash/dragon-valley.tex",
      texContent,
      uploadedFiles: new Map(),
      context: context(),
    });

  const first = await save("\\section{Dragons}");
  // A genuine edit, not a repeat of the first save's content, so this second
  // save still pushes a real commit and exercises the append-once logic.
  await save("\\section{Dragons, again}");

  assert.equal(fake.commits.length, 2);
  assert.deepEqual(
    lastCommitFiles(fake).map((file) => file.path),
    ["draft-scenarios/clash/dragon-valley.tex"],
    "the second save should carry the .tex only",
  );

  const onBranch = fake.fileOn(first.branch, CLASH_MAIN) || "";
  const occurrences = onBranch.split("\\input{\\clashpath/dragon-valley.tex}").length - 1;
  assert.equal(occurrences, 1);
});

test("getRepoFile reads the branch's own copy, and answers null for a path that is not there", async () => {
  const fake = createGithubFake({ files: { [CLASH_MAIN]: CLASH_MAIN_SOURCE } });
  setHttpClient(fake.client);

  assert.equal(await getRepoFile("t", "octocat", UPSTREAM_REPO, CLASH_MAIN), CLASH_MAIN_SOURCE);
  assert.equal(await getRepoFile("t", "octocat", UPSTREAM_REPO, "draft-scenarios/clash/nothing.tex"), null);
});

// --- ensurePullRequest ---------------------------------------------------

test("an already-open pull request is returned instead of a second one being opened", async () => {
  const branch = "scenario-editor/octocat/dragon-valley";
  const fake = createGithubFake({
    pulls: [{ html_url: "https://github.com/pull/7", number: 7, head: `octocat:${branch}` }],
  });
  setHttpClient(fake.client);

  const pull = await ensurePullRequest("t", {
    owner: "octocat",
    branch,
    scenarioName: "Dragon Valley",
    isMember: false,
  });

  assert.equal(pull.number, 7);
  assert.equal(pull.html_url, "https://github.com/pull/7");
  assert.equal(
    fake.calls.some((call) => call.method === "POST" && call.path.endsWith("/pulls")),
    false,
  );
});

test("a contributor's pull request is opened with an owner:branch head", async () => {
  const branch = "scenario-editor/octocat/dragon-valley";
  const fake = createGithubFake();
  setHttpClient(fake.client);

  await ensurePullRequest("t", { owner: "octocat", branch, scenarioName: "Dragon Valley", isMember: false });

  const list = fake.calls.find((call) => call.method === "GET" && call.path.endsWith("/pulls"));
  const create = fake.calls.find((call) => call.method === "POST" && call.path.endsWith("/pulls"));
  assert.ok(list && create);
  // list-pulls always filters on owner:branch; create only accepts that form cross-repo.
  assert.equal(new URLSearchParams(list.query).get("head"), `octocat:${branch}`);
  assert.equal(create.body.head, `octocat:${branch}`);
  assert.equal(create.body.base, "main");
  assert.equal(create.body.title, "New scenario: Dragon Valley");
});

test("a collaborator's pull request is opened with a plain branch name as its head", async () => {
  const branch = "scenario-editor/octocat/dragon-valley";
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  await ensurePullRequest("t", { owner: UPSTREAM_OWNER, branch, scenarioName: "Dragon Valley", isMember: true });

  const list = fake.calls.find((call) => call.method === "GET" && call.path.endsWith("/pulls"));
  const create = fake.calls.find((call) => call.method === "POST" && call.path.endsWith("/pulls"));
  assert.ok(list && create);
  assert.equal(new URLSearchParams(list.query).get("head"), `${UPSTREAM_OWNER}:${branch}`);
  assert.equal(create.body.head, branch);
});

// --- the seam itself ------------------------------------------------------

test("every GitHub call goes through the injected client", async () => {
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  await discoverGithubContext("t");

  // The fake asserts the api.github.com prefix on each call it handles; this
  // asserts it handled them all, so nothing reached the global fetch.
  assert.ok(fake.calls.length >= 3);
  assert.ok(fake.calls.every((call) => call.path.startsWith("/")));
});

test("deleteWorkBranch removes the branch and calls DELETE on that ref only", async () => {
  const branch = "scenario-editor/octocat/half-written";
  const fake = createGithubFake({ branchNames: [branch] });
  setHttpClient(fake.client);

  await deleteWorkBranch("token", { owner: "octocat", repo: UPSTREAM_REPO, branch });

  assert.equal(fake.hasBranch(branch), false);
  assert.equal(fake.hasBranch("main"), true);
  const deletes = fake.calls.filter((c) => c.method === "DELETE");
  assert.deepEqual(
    deletes.map((c) => c.path),
    [`/repos/octocat/${UPSTREAM_REPO}/git/refs/heads/${encodeURIComponent(branch)}`],
  );
});

test("deleteWorkBranch refuses a branch the app did not create", async () => {
  const fake = createGithubFake();
  setHttpClient(fake.client);

  await assert.rejects(deleteWorkBranch("token", { owner: "octocat", repo: UPSTREAM_REPO, branch: "main" }));
  assert.equal(fake.calls.filter((c) => c.method === "DELETE").length, 0);
  assert.equal(fake.hasBranch("main"), true);
});

test("deleteWorkBranch treats an already-missing branch as deleted", async () => {
  setHttpClient(createGithubFake().client);
  await deleteWorkBranch("token", { owner: "octocat", repo: UPSTREAM_REPO, branch: "scenario-editor/octocat/gone" });
});

// --- token validation ------------------------------------------------------

function probeCalls(fake: GithubFake): RecordedCall[] {
  return fake.calls.filter((call) => call.method === "POST" && call.path.endsWith("/git/refs"));
}

async function refusal(promise: Promise<unknown>): Promise<GithubApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof GithubApiError, "expected a GithubApiError");
    return error;
  }
  assert.fail("expected the token to be refused");
}

test("a member's token is accepted", async () => {
  setHttpClient(createGithubFake({ push: true }).client);

  const result = await validateTokenContext("t");

  assert.equal(result.isMember, true);
});

test("a non-member's token is accepted when it sees a fork", async () => {
  setHttpClient(createGithubFake({ push: false, forkExists: true }).client);

  const result = await validateTokenContext("t");

  assert.equal(result.isMember, false);
  assert.equal(result.fork?.owner.login, "octocat");
});

test("a non-member's token without a fork is refused with the fork message", async () => {
  setHttpClient(createGithubFake({ push: false, forkExists: false }).client);

  const error = await refusal(validateTokenContext("t"));

  assert.match(error.message, /cannot see a fork named `Homm3BG-mission-book` in your account/);
  assert.match(error.message, /Fork the repository/);
});

test("a 401 from GitHub is refused as not accepted", async () => {
  setHttpClient(createGithubFake({ unauthorized: true }).client);

  const error = await refusal(validateTokenContext("t"));

  assert.match(error.message, /The token was not accepted by GitHub/);
});

test("blank input is refused without a network call", async () => {
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  await refusal(validateTokenContext(""));
  await refusal(validateTokenContext("  \n\t "));

  assert.equal(fake.calls.length, 0);
});

test("a pasted token is trimmed before it is used", async () => {
  let authorization = "";
  const fake = createGithubFake({ push: true });
  setHttpClient({
    fetch: (url, options) => {
      authorization = String(new Headers(options?.headers).get("Authorization"));
      return fake.client.fetch(url, options);
    },
  });

  await validateTokenContext("  ghp_abc \n");

  assert.equal(authorization, "Bearer ghp_abc");
});

test("the context carries the upstream default branch as base", async () => {
  setHttpClient(createGithubFake({ push: true, defaultBranch: "develop" }).client);

  assert.equal((await discoverGithubContext("t")).base, "develop");
});

test("a 403 on the write probe refuses the token", async () => {
  setHttpClient(createGithubFake({ push: true, probeStatus: 403 }).client);

  const error = await refusal(validateTokenContext("t"));

  assert.equal(
    error.message,
    `This token cannot write to ${UPSTREAM_OWNER}/${UPSTREAM_REPO}. Give it \`Contents: Read and write\` on that repository.`,
  );
});

test("a 422 on the write probe accepts the token", async () => {
  setHttpClient(createGithubFake({ push: true, probeStatus: 422 }).client);

  await validateTokenContext("t");
});

test("a 500 on the write probe accepts the token", async () => {
  setHttpClient(createGithubFake({ push: true, probeStatus: 500 }).client);

  await validateTokenContext("t");
});

test("the write probe creates nothing and aims at upstream for a member", async () => {
  const fake = createGithubFake({ push: true });
  setHttpClient(fake.client);

  await validateTokenContext("t");

  const probes = probeCalls(fake);
  assert.equal(probes.length, 1);
  assert.equal(probes[0].path, `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/refs`);
  assert.equal(probes[0].body.ref, "refs/heads/scenario-editor/permission-probe");
  assert.match(probes[0].body.sha, /^0{40}$/);
  assert.equal(fake.hasBranch("scenario-editor/permission-probe"), false);
});

test("the write probe aims at the fork for a non-member", async () => {
  const fake = createGithubFake({ push: false, forkExists: true });
  setHttpClient(fake.client);

  await validateTokenContext("t");

  assert.equal(probeCalls(fake)[0].path, `/repos/octocat/${UPSTREAM_REPO}/git/refs`);
});

// --- sign-in-method messages -----------------------------------------------

test("a 403 on save under a token maps to the save-time message", () => {
  const message = tokenSaveFailureMessage(new GithubApiError("nope", { status: 403 }), "token", "octocat");

  assert.equal(
    message,
    "Your token cannot write to your fork. Give it Contents: Read and write on octocat/Homm3BG-mission-book, or sign in with a new token.",
  );
});

test("a 403 on save under OAuth keeps GitHub's own message", () => {
  assert.equal(tokenSaveFailureMessage(new GithubApiError("nope", { status: 403 }), "oauth", "octocat"), null);
});

test("a token user's other failures keep their own message", () => {
  assert.equal(tokenSaveFailureMessage(new GithubApiError("nope", { status: 500 }), "token", "octocat"), null);
});

test("the expiry message depends on the sign-in method", () => {
  assert.equal(signInExpiredMessage("oauth"), "Your GitHub sign-in has expired. Sign in again.");
  assert.equal(
    signInExpiredMessage("token"),
    "Your GitHub token has expired or was revoked. Sign in with a new token.",
  );
});

// --- compare page ----------------------------------------------------------

test("compareUrl for a fork head names the fork's owner", () => {
  const url = compareUrl({ base: "main", owner: "octocat", branch: "scenario-x", title: "T", body: "B" });

  assert.equal(
    url,
    `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/compare/main...octocat:scenario-x?quick_pull=1&title=T&body=B`,
  );
});

test("compareUrl for a member head names the upstream owner", () => {
  const url = compareUrl({ base: "main", owner: UPSTREAM_OWNER, branch: "scenario-x", title: "T", body: "B" });

  assert.ok(url.includes(`/compare/main...${UPSTREAM_OWNER}:scenario-x?`));
});

test("compareUrl encodes newlines and # in the body, and sets no label, milestone, assignee or project", () => {
  const url = compareUrl({
    base: "main",
    owner: "octocat",
    branch: "b",
    title: "New scenario: A & B",
    body: "line one\n- [x] item #1",
  });
  const params = new URL(url).searchParams;

  assert.ok(url.includes("body=line%20one%0A-%20%5Bx%5D%20item%20%231"));
  assert.equal(params.get("body"), "line one\n- [x] item #1");
  assert.equal(params.get("title"), "New scenario: A & B");
  for (const key of ["labels", "milestone", "assignees", "projects"]) assert.equal(params.has(key), false);
});

test("the pull request title says new or update by mode", () => {
  assert.equal(pullRequestTitle("new", "Dragon Pass"), "New scenario: Dragon Pass");
  assert.equal(pullRequestTitle("edit", "Dragon Pass"), "Update Dragon Pass");
});
