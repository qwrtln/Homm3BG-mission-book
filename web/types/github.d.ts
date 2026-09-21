// The GitHub REST payload fields shared/github-contrib.js actually reads.
// Deliberately partial: these describe what the code touches, not the whole
// API. Adding a field here is cheap; guessing at one the code never reads is
// noise.
//
// Nothing here is asserted onto a payload. Each shape has a parser in
// shared/github-contrib.js that checks it field by field at the point of
// entry, so a shape that has drifted fails there rather than travelling on as
// an undefined.

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
  /** ISO date of the branch's newest commit, when the response lists commits. */
  lastCommitDate?: string;
}

interface GithubBlob {
  /** Base64, with newlines, as the blobs API returns it. */
  content: string;
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

/** A create response this app reads only the sha from: blobs, trees. */
interface GithubShaOnly {
  sha: string;
}

interface GithubPullRequest {
  html_url: string;
  number: number;
}

/** One of this user's own scenario-editor branches, with the .tex it touches. */
interface ResumableDraft {
  branch: string;
  /** "edit" for a member's in-place edit of an existing scenario, "new" for a draft of a new one. */
  kind: "edit" | "new";
  texPath: string;
  assets: { path: string; sha: string }[];
  /** ISO date of the newest commit on the branch; absent if unknown. */
  lastEdit?: string;
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
