// Builds web/app/index.html into web/dist/, and serves it in development.
//
// The app reaches one level above itself at run time, for files the bundle
// must not hold: the BusyTeX engine (core/), the wrapper and the carried
// texmf bundle (shared/), and the book's own sources (repo/). Those stay at
// their ../ URLs. The deploy copies web/dist/ to site/builder/ and the
// allow-list in publish-docs.yaml puts them at the site root; in development
// outOfBundleAssets() serves them from disk.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const WEB = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(WEB);

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".tex": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".wasm": "application/wasm",
};

/** Dev URL prefixes served from web/, as they sit one level above the page when deployed. */
const WEB_PREFIXES = ["/web/shared/vendor/", "/web/shared/texmf/", "/web/core/"];

/** The dev URL prefix served from the repository root. */
const REPO_PREFIX = "/web/repo/";

/**
 * Cross-origin isolation, which the engine's worker needs. Vite adds
 * server.headers only to the responses it serves itself, so
 * outOfBundleAssets() sets them too: without them the worker script and the
 * engine files load without COEP, and the browser blocks the worker.
 */
const ISOLATION_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/** The name of the third-party notices file, next to index.html. */
const NOTICES_FILE = "licenses.json";

/**
 * Serves the files the app loads from outside the bundle, from disk, so the
 * dev server shows the same URLs as the deployed site and the tests.
 */
function outOfBundleAssets(): Plugin {
  return {
    name: "out-of-bundle-assets",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
        let root: string;
        let relative: string;
        if (pathname.startsWith(REPO_PREFIX)) {
          root = REPO_ROOT;
          relative = pathname.slice(REPO_PREFIX.length);
        } else if (WEB_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
          root = WEB;
          relative = pathname.slice("/web/".length);
        } else {
          next();
          return;
        }
        const file = normalize(join(root, relative));
        if (!file.startsWith(root + sep) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        for (const [name, value] of Object.entries(ISOLATION_HEADERS)) res.setHeader(name, value);
        res.setHeader("Content-Type", CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
  };
}

interface Notice {
  name: string;
  version: string;
  license: string;
  homepage: string;
  text: string;
}

const LICENSE_FILE = /^(licen[sc]e|copying)(\.(md|txt))?$/i;

/** A repository field as a web address: "git+ssh://git@host/x.git" becomes "https://host/x". */
function webAddress(repository: string | undefined): string {
  return (repository ?? "")
    .replace(/^git\+/, "")
    .replace(/^(ssh|git):\/\/(git@)?/, "https://")
    .replace(/\.git$/, "");
}

/** The package directory an installed module belongs to, or null for a file outside node_modules. */
function packageDir(id: string): string | null {
  const marker = `${sep}node_modules${sep}`;
  const at = id.lastIndexOf(marker);
  if (at === -1) return null;
  const parts = id.slice(at + marker.length).split(sep);
  const depth = parts[0].startsWith("@") ? 2 : 1;
  return join(id.slice(0, at + marker.length), ...parts.slice(0, depth));
}

/**
 * Emits licenses.json next to index.html: the name, version, license and
 * license text of every npm package that reached the bundle. The About dialog
 * lists them, so a dependency added later shows up with no edit.
 */
function licenseNotices(): Plugin {
  return {
    name: "license-notices",
    apply: "build",
    generateBundle(_options, bundle) {
      const dirs = new Set<string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of Object.keys(chunk.modules)) {
          const dir = id.startsWith("\0") ? null : packageDir(id.split("?")[0]);
          if (dir) dirs.add(dir);
        }
      }
      const notices: Notice[] = [];
      for (const dir of dirs) {
        const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        const file = readdirSync(dir).find((name) => LICENSE_FILE.test(name));
        const repository = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
        notices.push({
          name: manifest.name,
          version: manifest.version,
          license: typeof manifest.license === "string" ? manifest.license : "See license text",
          homepage: manifest.homepage ?? webAddress(repository),
          text: file ? readFileSync(join(dir, file), "utf8") : "",
        });
      }
      notices.sort((a, b) => a.name.localeCompare(b.name));
      this.emitFile({ type: "asset", fileName: NOTICES_FILE, source: `${JSON.stringify(notices, null, 2)}\n` });
    },
  };
}

export default defineConfig(({ command }) => ({
  root: "app",
  // The dev server mounts the page where the tests and serve.sh expect it. The
  // build uses relative URLs, so the same files work under /builder/.
  base: command === "serve" ? "/web/app/" : "./",
  plugins: [react(), tailwindcss(), outOfBundleAssets(), licenseNotices()],
  server: {
    headers: ISOLATION_HEADERS,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
}));
