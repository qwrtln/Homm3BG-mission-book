import { gitBlobSha, type LocalSnapshot } from "../../shared/local-drafts.ts";
import { listDraftPaths, loadDraft } from "./drafts.ts";
import { listRecords } from "./local-store.ts";

/**
 * Everything this browser holds, one snapshot per scenario path. The
 * IndexedDB record wins over the localStorage draft for the same path; a
 * draft with no record (written by an older version) has no baseline and no
 * write time.
 *
 * @returns the snapshots, in no particular order
 */
export async function listLocalSnapshots(): Promise<LocalSnapshot[]> {
  const records = await listRecords();
  const known = new Set(records.map((record) => record.path));

  const fromRecords = records.map(
    async (record): Promise<LocalSnapshot> => ({
      path: record.path,
      textSha: record.text === null ? null : await gitBlobSha(record.text),
      baseSha: record.baseSha,
      staged: record.staged,
      updatedAt: record.updatedAt,
    }),
  );
  const fromDrafts = listDraftPaths()
    .filter((path) => !known.has(path))
    .map(async (path): Promise<LocalSnapshot | null> => {
      const text = loadDraft(path);
      if (text === null) return null;
      return { path, textSha: await gitBlobSha(text), baseSha: null, staged: false, updatedAt: null };
    });

  const snapshots = await Promise.all([...fromRecords, ...fromDrafts]);
  return snapshots.filter((snapshot): snapshot is LocalSnapshot => snapshot !== null);
}
