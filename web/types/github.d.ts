// The GitHub REST payload fields shared/github-contrib.js actually reads.
// Deliberately partial: these describe what the code touches, not the whole
// API. Adding a field here is cheap; guessing at one the code never reads is
// noise.

interface GithubUser {
  login: string;
}

interface GithubRepo {
  name: string;
  owner: GithubUser;
  default_branch: string;
  /** Absent under a token that cannot see it; push is the collaborator test. */
  permissions?: { push?: boolean };
}

interface GithubBranch {
  name: string;
}

interface GithubCompareFile {
  filename: string;
  sha: string;
  status: string;
}

interface GithubCompare {
  files?: GithubCompareFile[];
}

interface GithubBlob {
  /** Base64, with newlines, as the blobs API returns it. */
  content: string;
  sha: string;
}

interface GithubContents {
  content: string;
}

interface GithubRef {
  object: { sha: string };
}

interface GithubCommit {
  sha: string;
  tree: { sha: string };
}

interface GithubTree {
  sha: string;
}

interface GithubPullRequest {
  html_url: string;
  number: number;
}

/** One of this user's own scenario-editor branches, with the .tex it touches. */
interface ResumableDraft {
  branch: string;
  texPath: string;
  assets: { path: string; sha: string }[];
}

/** What discoverGithubContext works out once, on sign-in. */
interface GithubContext {
  username: string;
  isMember: boolean;
  fork: GithubRepo | null;
  drafts: ResumableDraft[];
}

/** A file heading for a commit: repository text, or uploaded bytes. */
interface CommitFile {
  path: string;
  content: string | Uint8Array;
}

/**
 * Where a push landed. saveScenarioToRepo adds `isMember` to this to make a
 * SaveTarget, which is what the app's buttons then act on.
 */
interface CommitResult {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
}

/**
 * The transport seam FR-006 will inject, so a test can fake the GitHub API
 * without reaching api.github.com. Declared here so the shape is agreed
 * before the refactor lands; nothing is wired to it yet, because
 * shared/github-contrib.js is under concurrent edit by a separate effort
 * (see the PRD's Constraints & Compatibility).
 */
interface GithubTransport {
  (path: string, init?: RequestInit): Promise<Response>;
}
