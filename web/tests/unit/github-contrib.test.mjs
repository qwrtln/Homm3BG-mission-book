// Tier 1 tests for web/shared/github-contrib.js.
//
// The module calls GitHub through an injected HttpClient (setHttpClient), so
// these tests hand it a small recorded fake of the API instead of reaching
// api.github.com. The fake keeps real state — branches, files, blobs, trees,
// commits — so a second save genuinely sees what the first one committed,
// which is what makes the main.tex idempotency test mean anything.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  setHttpClient,
  slugify,
  discoverGithubContext,
  findEditBranch,
  saveScenarioToRepo,
  ensurePullRequest,
  deleteWorkBranch,
  getRepoFile,
  UPSTREAM_OWNER,
  UPSTREAM_REPO,
} from "../../shared/github-contrib.js";
import { DRAFT_GROUP_FILES } from "../../shared/build-plan.js";

const API = "https://api.github.com";

/**
 * @param {unknown} payload
 * @param {number} [status]
 * @returns {Response}
 */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** @returns {Response} */
function notFound() {
  return json({ message: "Not Found" }, 404);
}

/**
 * @param {string} text
 * @returns {string}
 */
function base64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * A recorded fake of the slice of the GitHub API this module uses.
 *
 * @param {object} [options]
 * @param {string} [options.userLogin] who the token belongs to
 * @param {boolean} [options.push] upstream permissions.push, the collaborator test
 * @param {boolean} [options.forkExists] whether the user already has a fork; true unless set to false
 * @param {string} [options.defaultBranch]
 * @param {Record<string, string>} [options.files] default-branch path -> text
 * @param {string[]} [options.branchNames] branches that already exist
 * @param {Record<string, string[]>} [options.branchTexFiles] branch -> .tex paths its compare against the default branch lists
 * @param {{html_url: string, number: number, head: string}[]} [options.pulls] open pull requests
 * @returns {{
 *   client: {fetch: (url: string, options?: RequestInit) => Promise<Response>},
 *   calls: {method: string, path: string, query: string, body: any}[],
 *   commits: {branch: string, message: string, files: {path: string, content: string}[]}[],
 *   pulls: {html_url: string, number: number, head: string}[],
 *   hasBranch: (branch: string) => boolean,
 *   fileOn: (branch: string, path: string) => string | undefined,
 * }}
 */
function createGithubFake(options = {}) {
  const userLogin = options.userLogin || "octocat";
  const defaultBranch = options.defaultBranch || "main";
  const forkOwner = userLogin;

  const base = new Map(Object.entries(options.files || {}));
  /** @type {Map<string, string>} */
  const branches = new Map([[defaultBranch, "base-sha"]]);
  /** @type {Map<string, Map<string, string>>} */
  const branchFiles = new Map([[defaultBranch, base]]);
  for (const name of options.branchNames || []) {
    branches.set(name, "base-sha");
    branchFiles.set(name, new Map(base));
  }

  /** @type {Map<string, {tree: string, entries: {path: string, sha: string}[], message: string}>} */
  const commits = new Map([["base-sha", { tree: "base-tree", entries: [], message: "" }]]);
  /** @type {Map<string, string>} */
  const blobs = new Map();
  /** @type {Map<string, {path: string, sha: string}[]>} */
  const trees = new Map();
  /** @type {Map<string, string>} */
  const treeShaByContent = new Map();
  /** @type {Map<string, string>} */
  const blobShaByContent = new Map();
  /** @type {Map<string, Map<string, string>>} tree sha -> path -> blob sha, fully resolved */
  const resolvedTrees = new Map();

  /**
   * @param {string} content
   * @returns {string}
   */
  function blobShaFor(content) {
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

  /**
   * @param {string} path
   * @returns {[string, string][]}
   */
  function canonicalEntries(entriesMap) {
    return [...entriesMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  /**
   * @param {string} sha
   * @returns {Map<string, string>}
   */
  function resolveTree(sha) {
    if (resolvedTrees.has(sha)) return /** @type {Map<string, string>} */ (resolvedTrees.get(sha));
    if (sha === "base-tree") {
      const resolved = new Map();
      for (const [filePath, content] of base) resolved.set(filePath, blobShaFor(content));
      resolvedTrees.set(sha, resolved);
      treeShaByContent.set(JSON.stringify(canonicalEntries(resolved)), sha);
      return resolved;
    }
    return new Map();
  }

  const calls = [];
  /** @type {{branch: string, message: string, files: {path: string, content: string}[]}[]} */
  const applied = [];
  const pulls = [...(options.pulls || [])];
  let forkExists = options.forkExists !== false;
  let counter = 0;

  /**
   * @param {string} owner
   * @param {boolean} withPermissions
   * @returns {object}
   */
  function repoPayload(owner, withPermissions) {
    return {
      name: UPSTREAM_REPO,
      owner: { login: owner },
      default_branch: defaultBranch,
      ...(withPermissions ? { permissions: { push: options.push === true } } : {}),
    };
  }

  /**
   * @param {string} url
   * @param {RequestInit} [init]
   * @returns {Promise<Response>}
   */
  async function handle(url, init = {}) {
    assert.ok(url.startsWith(API), `call escaped the seam: ${url}`);
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const [path, query = ""] = url.slice(API.length).split("?");
    calls.push({ method, path, query, body });

    /** @type {RegExpMatchArray | null} */
    let match;

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
      return json({ content: base64(content) });
    }

    if ((match = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/)) && method === "GET") {
      const branch = decodeURIComponent(match[1]);
      const sha = branches.get(branch);
      return sha === undefined ? notFound() : json({ object: { sha } });
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs$/) && method === "POST") {
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
      for (const entry of body.tree) merged.set(entry.path, entry.sha);
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
      commits.set(sha, { tree: body.tree, entries: trees.get(body.tree) || [], message: body.message });
      return json({ sha, tree: { sha: body.tree } }, 201);
    }

    if ((match = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/)) && method === "PATCH") {
      const branch = decodeURIComponent(match[1]);
      const commit = commits.get(body.sha);
      if (!commit) return notFound();
      // A ref moved off its own history is only accepted with force, as on GitHub.
      const files = body.force ? new Map(base) : branchFiles.get(branch) || new Map(base);
      const written = commit.entries.map((entry) => ({ path: entry.path, content: blobs.get(entry.sha) || "" }));
      for (const file of written) files.set(file.path, file.content);
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
      const listed = options.branchTexFiles?.[branch] || [];
      return json({ files: listed.map((filename) => ({ filename, sha: "sha", status: "modified" })) });
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/pulls$/) && method === "GET") {
      const head = new URLSearchParams(query).get("head");
      return json(pulls.filter((pull) => pull.head === head));
    }

    if (path.match(/^\/repos\/[^/]+\/[^/]+\/pulls$/) && method === "POST") {
      const created = { html_url: `https://github.com/pull/${pulls.length + 1}`, number: pulls.length + 1, head: body.head };
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
    hasBranch: (branch) => branches.has(branch),
    fileOn: (branch, path) => {
      const files = branchFiles.get(branch);
      return files ? files.get(path) : undefined;
    },
  };
}

/**
 * @param {ReturnType<typeof createGithubFake>} fake
 * @returns {{path: string, content: string}[]} the files of the last push
 */
function lastCommitFiles(fake) {
  const commit = fake.commits[fake.commits.length - 1];
  assert.ok(commit, "nothing was committed");
  return commit.files;
}

/**
 * @param {object} [overrides]
 * @returns {GithubContext}
 */
function context(overrides = {}) {
  return {
    username: "octocat",
    isMember: false,
    fork: { name: UPSTREAM_REPO, owner: { login: "octocat" }, default_branch: "main" },
    drafts: [],
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
  assert.equal(fake.calls.some((call) => call.path === "/repos/octocat/Homm3BG-mission-book"), false);
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
  assert.equal(fake.calls.some((call) => call.path.endsWith("/forks")), false);
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
  assert.equal(fake.calls.some((call) => call.path.endsWith("/forks")), false);
});

// --- the new-scenario path rule ------------------------------------------

test("every draft group file lives under draft-scenarios/, never a published directory", () => {
  for (const group of DRAFT_GROUP_FILES) {
    assert.ok(group.dir.startsWith("draft-scenarios/"), `${group.dir} is not a draft directory`);
    assert.ok(group.path.startsWith("draft-scenarios/"), `${group.path} is not a draft group file`);
  }
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
  assert.deepEqual(paths, [
    "draft-scenarios/clash/dragon-valley.tex",
    "assets/images/dragon.png",
    CLASH_MAIN,
  ]);
  assert.equal(paths.some((path) => path.startsWith("clash/")), false);
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

  assert.deepEqual(lastCommitFiles(fake).map((file) => file.path), ["clash/secret_bomb_stash.tex"]);
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
    mode: /** @type {const} */ ("edit"),
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

  assert.deepEqual(lastCommitFiles(fake).map((file) => file.path), ["draft-scenarios/clash/unlisted.tex"]);
});

test("an in-place edit is committed as \"Edit <name>\"", async () => {
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
    [["clash/secret_bomb_stash.tex", "edit"], ["draft-scenarios/clash/valley.tex", "new"]],
  );
});

test("an in-place edit's pull request is titled \"Update <name>\"", async () => {
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

test("startOver resets the edit branch to the default branch and commits the new content on top", async () => {
  const fake = createGithubFake({ push: true, files: { "clash/secret_bomb_stash.tex": "main copy" } });
  setHttpClient(fake.client);
  const request = {
    scenarioName: "Secret Bomb Stash",
    texPath: "clash/secret_bomb_stash.tex",
    uploadedFiles: new Map(),
    context: context({ isMember: true, fork: null }),
    mode: /** @type {const} */ ("edit"),
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

  const save = (texContent) => saveScenarioToRepo("t", {
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

  const pull = await ensurePullRequest("t", { owner: "octocat", branch, scenarioName: "Dragon Valley", isMember: false });

  assert.equal(pull.number, 7);
  assert.equal(pull.html_url, "https://github.com/pull/7");
  assert.equal(fake.calls.some((call) => call.method === "POST" && call.path.endsWith("/pulls")), false);
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
  assert.deepEqual(deletes.map((c) => c.path), [
    `/repos/octocat/${UPSTREAM_REPO}/git/refs/heads/${encodeURIComponent(branch)}`,
  ]);
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
