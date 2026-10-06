import { basenameNoExt } from "./dom.ts";

const CATEGORY_LABELS: Record<string, string> = {
  clash: "Clash",
  coops: "Cooperative",
  campaigns: "Campaign",
  alliances: "Alliance",
};

/** "draft-scenarios/clash/kyrre_link.tex" -> "Clash: Kyrre Link". */
export function draftLabel(texPath: string): string {
  const dir = texPath.split("/").slice(-2, -1)[0] ?? "";
  const title = basenameNoExt(texPath)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const category = CATEGORY_LABELS[dir];
  return category ? `${category}: ${title}` : title;
}

/** "3 hours ago", "yesterday", ...; empty when the date is missing or invalid. */
export function timeAgo(iso: string | undefined): string {
  const then = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(then)) return "";
  const seconds = Math.min(0, Math.round((then - Date.now()) / 1000));
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (-seconds >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
