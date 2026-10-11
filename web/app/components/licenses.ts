/** One license row the About dialog offers for a file outside npm: the deploy ships `src`, relative to the page. */
export interface StaticLicense {
  src: string;
  name: string;
  kind: string;
  /** The project's home page, when it has one worth a link. */
  home?: { href: string; label: string };
}

/** The About dialog's license groups. A bundled npm package needs no row: the build lists it in licenses.json. */
export const LICENSE_GROUPS = {
  app: [{ src: "../LICENSE", name: "Scenario builder", kind: "AGPL-3.0" }],
  engine: [
    {
      src: "../shared/vendor/texlyre-busytex.LICENSE",
      name: "TeXlyre BusyTeX",
      kind: "AGPL-3.0",
      home: { href: "https://github.com/TeXlyre/texlyre-busytex", label: "github.com/TeXlyre/texlyre-busytex" },
    },
    { src: "../LATEX-ENGINE-NOTICE", name: "BusyTeX and TeX Live", kind: "Several licenses" },
  ],
} satisfies Record<string, StaticLicense[]>;
