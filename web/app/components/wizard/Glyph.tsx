import { REPO } from "../../modules/config.ts";

function glyphUrl(name: string): string {
  return `${REPO}/assets/glyphs/${encodeURIComponent(name)}.svg`;
}

/**
 * A decorative glyph image; the control beside it carries the name. With a
 * dark variant, a second image follows that only the dark theme shows.
 */
export function Glyph({ name, dark, inline = false }: { name: string; dark?: string | null; inline?: boolean }) {
  return (
    <>
      <img className={`wizard-glyph${inline ? " wizard-glyph-inline" : ""}`} src={glyphUrl(name)} alt="" />
      {dark && <img className="wizard-glyph dark" src={glyphUrl(dark)} alt="" />}
    </>
  );
}
