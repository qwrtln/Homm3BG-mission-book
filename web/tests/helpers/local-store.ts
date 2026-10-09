// Tier 2 helper: writes a local-store record directly, bypassing the UI, the
// way a previous session would have left it. Reads the app's __localStore hook.

import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";

/**
 * The git blob SHA of a text, as GitHub reports it.
 *
 * @param text
 */
export function blobSha(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

/**
 * Seeds a local-store record, for seeding a stored text or upload set before
 * a reload.
 *
 * @param page
 * @param path
 * @param fields `baseSha` is the git blob SHA of the text the copy is based on;
 *   omitted, the record is a legacy one with no baseline
 */
export async function seedLocalRecord(
  page: Page,
  path: string,
  fields: { text?: string; baseSha?: string; uploads?: { path: string; length: number }[] },
): Promise<void> {
  await page.evaluate(
    async ([p, f]: [string, typeof fields]) => {
      const { saveText, saveUploads } = globalThis.__localStore!;
      if (f.text !== undefined) await saveText(p, f.text, f.baseSha);
      if (f.uploads !== undefined) {
        await saveUploads(
          p,
          f.uploads.map((u) => ({ path: u.path, bytes: new Uint8Array(u.length) })),
        );
      }
    },
    [path, fields] as [string, typeof fields],
  );
}
