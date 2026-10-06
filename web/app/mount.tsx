import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { el } from "./modules/dom.ts";

const roots = new Map<string, Root>();

/**
 * Mounts a React subtree into an element of index.html. The render is
 * synchronous, so the subtree's DOM and its effects exist when this returns,
 * and the init*() calls after it can rely on them. Mounting the same region
 * again replaces its subtree.
 */
export function mountRegion(id: keyof ElementIdMap, element: ReactElement): void {
  let root = roots.get(id);
  if (root === undefined) {
    root = createRoot(el(id));
    roots.set(id, root);
  }
  const mounted = root;
  flushSync(() => mounted.render(element));
}
