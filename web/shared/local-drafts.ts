// The rules behind the welcome screen's "Resume your work" list and behind
// opening a scenario that has a local copy. DOM-free, so the list and the open
// paths share one definition of "edited" and cannot disagree.

/** What the browser holds for one scenario path, boiled down to what the rules read. */
export interface LocalSnapshot {
  path: string;
  /** git blob SHA of the local text; null when no text is stored */
  textSha: string | null;
  /** git blob SHA of the text the local copy was based on; null for a legacy record */
  baseSha: string | null;
  /** true when the record holds a staged upload set */
  staged: boolean;
  /** ISO time of the last text write; null when unknown */
  updatedAt: string | null;
}

export type EntryState = "synced" | "unsaved" | "conflict" | "local-only" | "local-unknown";

export interface WelcomeEntry {
  path: string;
  state: EntryState;
  local?: LocalSnapshot;
  remote?: ResumableDraft;
}

/** How much the list knows about the signed-in user's branches. */
export type BranchKnowledge = "signed-out" | "complete" | "unknown";

export type OpenDecision = "loaded" | "local" | "ask";

/**
 * The SHA-1 git gives a file's blob, so a text can be compared with GitHub's
 * blob SHA without a request. Hashes the UTF-8 bytes, which is what GitHub
 * stores.
 *
 * Needs `crypto.subtle`, so a secure context (https or localhost). On a
 * plain-http origin it throws, and the welcome list and opening a scenario
 * fail with it.
 *
 * @returns lowercase hex
 */
export async function gitBlobSha(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + bytes.byteLength);
  blob.set(header, 0);
  blob.set(bytes, header.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", blob));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Whether the local copy holds changes of its own. A record with a baseline is
 * edited when its text left that baseline. A legacy record has none, so the
 * text it is compared with stands in for it.
 */
function isEdited(local: LocalSnapshot, comparedSha: string | null): boolean {
  if (local.staged) return true;
  if (local.textSha === null) return false;
  const baseline = local.baseSha ?? comparedSha;
  return baseline !== null && local.textSha !== baseline;
}

/** The later of the two ISO dates as a time value; -Infinity when neither is known. */
function newest(...dates: (string | null | undefined)[]): number {
  let latest = Number.NEGATIVE_INFINITY;
  for (const date of dates) {
    const time = date ? Date.parse(date) : Number.NaN;
    if (!Number.isNaN(time) && time > latest) latest = time;
  }
  return latest;
}

function entryTime(entry: WelcomeEntry): number {
  return newest(entry.local?.updatedAt, entry.remote?.lastEdit);
}

function classifyLocalOnly(local: LocalSnapshot, knowledge: BranchKnowledge): EntryState | null {
  const empty = local.textSha === null && !local.staged;
  const untouched = local.baseSha !== null && !isEdited(local, null);
  if (empty || untouched) return null;
  return knowledge === "unknown" ? "local-unknown" : "local-only";
}

function classifyPair(local: LocalSnapshot, remote: ResumableDraft): EntryState {
  if (!isEdited(local, remote.texSha)) return "synced";
  if (local.baseSha === null || local.baseSha === remote.texSha) return "unsaved";
  return "conflict";
}

/**
 * Merges the local copies and the GitHub branches by scenario path and gives
 * each a state. Entries that hold nothing worth resuming are dropped. Two
 * branches on one path: the newest pairs with the local copy, the other stands
 * alone.
 *
 * @returns newest first by the later of the local write and the branch's last
 *   edit; entries with no date last, then by path
 */
export function classifyEntries(
  local: LocalSnapshot[],
  remote: ResumableDraft[],
  knowledge: BranchKnowledge,
): WelcomeEntry[] {
  const localByPath = new Map(local.map((snapshot) => [snapshot.path, snapshot]));
  const entries: WelcomeEntry[] = [];
  const paired = new Set<string>();

  const byRecency = [...remote].sort((a, b) => newest(b.lastEdit) - newest(a.lastEdit));
  for (const draft of byRecency) {
    const snapshot = localByPath.get(draft.texPath);
    if (snapshot && !paired.has(draft.texPath)) {
      paired.add(draft.texPath);
      entries.push({ path: draft.texPath, state: classifyPair(snapshot, draft), local: snapshot, remote: draft });
    } else {
      entries.push({ path: draft.texPath, state: "synced", remote: draft });
    }
  }
  for (const snapshot of local) {
    if (paired.has(snapshot.path)) continue;
    const state = classifyLocalOnly(snapshot, knowledge);
    if (state) entries.push({ path: snapshot.path, state, local: snapshot });
  }

  return entries.sort((a, b) => {
    const ta = entryTime(a);
    const tb = entryTime(b);
    if (ta !== tb) return tb > ta ? 1 : -1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

/**
 * What opening a scenario does about its local copy, given the SHA of the text
 * that was just loaded from GitHub or the Mission Book.
 *
 * @returns "loaded" to open the loaded text, "local" to open the local copy
 *   with no question, "ask" when both changed (or a record with no baseline differs)
 */
export function decideOpen(local: LocalSnapshot | null, loadedSha: string): OpenDecision {
  if (local === null || local.textSha === null) return "loaded";
  if (local.textSha === loadedSha && !local.staged) return "loaded";
  if (!isEdited(local, loadedSha)) return "loaded";
  return local.baseSha === loadedSha ? "local" : "ask";
}
