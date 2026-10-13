import bundledPackages, { type BundledPackage } from "virtual:bundled-packages";
import { type ReactNode, type SyntheticEvent, useState } from "react";
import { dialogClosed, useAppStore } from "../store.ts";
import { LICENSE_GROUPS, type StaticLicense } from "./licenses.ts";
import { Button } from "./ui/Button.tsx";
import { Dialog, DialogActions, DialogTitle } from "./ui/Dialog.tsx";
import { Link } from "./ui/Link.tsx";

/** A readable row: a name and kind, and the license text under it. */
function LicenseRow({
  name,
  kind,
  home,
  text,
  onOpen,
}: {
  name: string;
  kind: string;
  home?: { href: string; label: string };
  text: string;
  onOpen?: () => void;
}) {
  return (
    <details
      className="license group border-t border-line last:border-b"
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => {
        if (event.currentTarget.open) onOpen?.();
      }}
    >
      <summary className="flex cursor-pointer list-none items-baseline gap-4 px-1 py-2 before:text-muted before:content-['▸'] group-open:before:content-['▾'] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="license-name flex-1">{name}</span>
        <span className="license-kind text-small text-muted">{kind}</span>
      </summary>
      {home && (
        <p className="mb-1.5 ml-5 text-small">
          <Link href={home.href} external>
            {home.label}
          </Link>
        </p>
      )}
      <pre className="license-text mb-2.5 max-h-56 overflow-auto rounded-md bg-code-bg px-3 py-2.5 font-mono text-code leading-normal whitespace-pre-wrap">
        {text}
      </pre>
    </details>
  );
}

/** A row for a file the deploy ships beside the code it covers; its text loads the first time the row opens. */
function StaticLicenseRow({ license }: { license: StaticLicense }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load(): Promise<void> {
    if (loaded) return;
    const url = new URL(license.src, document.baseURI);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setText(await response.text());
      setLoaded(true);
    } catch {
      setText(`Could not load this license. It is published at ${url.href}`);
    }
  }

  return <LicenseRow name={license.name} kind={license.kind} home={license.home} text={text} onOpen={load} />;
}

function Group({
  id,
  title,
  wrapperId,
  children,
}: {
  id: string;
  title: string;
  wrapperId?: string;
  children: ReactNode;
}) {
  return (
    <fieldset id={wrapperId} className="license-group m-0 mt-3 min-w-0 border-0 p-0" aria-labelledby={id}>
      <h4 id={id} className="mb-1 text-small font-semibold text-muted">
        {title}
      </h4>
      {children}
    </fieldset>
  );
}

/** The bundled packages' license texts by name, from the file the build writes next to the page. */
let bundledTexts: Promise<Record<string, string>> | null = null;

/** Fetches licenses.json once; a failed fetch is tried again at the next call. */
function loadBundledTexts(): Promise<Record<string, string>> {
  bundledTexts ??= (async () => {
    const response = await fetch(new URL("licenses.json", document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Record<string, string>;
  })();
  bundledTexts.catch(() => {
    bundledTexts = null;
  });
  return bundledTexts;
}

/** A row for an npm package in the bundle; its text loads the first time the row opens. */
function BundledLicenseRow({ pkg }: { pkg: BundledPackage }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const fallback = `See ${pkg.homepage || "the package"} for its license.`;

  async function load(): Promise<void> {
    if (loaded) return;
    try {
      setText((await loadBundledTexts())[pkg.name] || fallback);
      setLoaded(true);
    } catch {
      setText(`Could not load this license. ${fallback}`);
    }
  }

  return (
    <LicenseRow
      name={pkg.name}
      kind={`${pkg.license} · ${pkg.version}`}
      home={
        /^https?:\/\//.test(pkg.homepage)
          ? { href: pkg.homepage, label: pkg.homepage.replace(/^https?:\/\//, "") }
          : undefined
      }
      text={text}
      onOpen={load}
    />
  );
}

/**
 * The menu's About item opens this dialog. It names the app's license, links
 * its source code, and lists each bundled project's license.
 */
export function AboutDialog() {
  const open = useAppStore((state) => state.dialogs.about);

  return (
    <Dialog
      id="about-dialog"
      labelledBy="about-title"
      size="lg"
      open={open}
      onClose={() => dialogClosed("about")}
      closeOnBackdrop
    >
      <DialogTitle id="about-title">About the scenario builder</DialogTitle>
      <p className="mb-2">
        The scenario builder is free software under the GNU Affero General Public License v3.0. You can read, copy and
        change its{" "}
        <Link id="about-source" href="https://github.com/qwrtln/Homm3BG-mission-book/tree/main/web" external>
          source code on GitHub
        </Link>
        .
      </p>
      <h3 className="mt-5 mb-1 text-body font-bold">Open-source licenses</h3>
      <p className="mb-2 text-small text-muted">It is built with these projects. Open one to read its license.</p>
      <Group id="license-group-app" title="This app">
        {LICENSE_GROUPS.app.map((license) => (
          <StaticLicenseRow key={license.src} license={license} />
        ))}
      </Group>
      <Group id="license-group-engine" title="LaTeX engine">
        {LICENSE_GROUPS.engine.map((license) => (
          <StaticLicenseRow key={license.src} license={license} />
        ))}
      </Group>
      {bundledPackages.length > 0 && (
        <Group id="license-group-bundled" wrapperId="license-bundled" title="Bundled libraries">
          {bundledPackages.map((pkg) => (
            <BundledLicenseRow key={pkg.name} pkg={pkg} />
          ))}
        </Group>
      )}
      <DialogActions>
        <Button id="about-close" type="submit" value="close">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
