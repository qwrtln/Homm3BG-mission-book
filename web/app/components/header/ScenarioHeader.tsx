import { categoryOfPath, DRAFT_CATEGORIES } from "../../../shared/scenario-name.ts";
import { leaveWorkspace } from "../../github/session.ts";
import { categoryLocked, LOCKED_TITLE, moveToCategory, OPEN_TITLE } from "../../modules/category.ts";
import { CATEGORY_LABELS } from "../../modules/config.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Select } from "../ui/Select.tsx";
import { ArrowLeftIcon } from "./icons.tsx";

/** The header's left side while a scenario is open: the way back, its name, its category and its notes. */
export function ScenarioHeader() {
  const title = useAppStore((s) => s.chosenTitle);
  const category = useAppStore((s) => (s.chosenPath && categoryOfPath(s.chosenPath)) ?? "");
  const locked = useAppStore((s) => categoryLocked(s));
  const note = useAppStore((s) => s.categoryNote);
  const draftNote = useAppStore((s) => s.draftNote);
  const unsaved = useAppStore((s) => s.dirty && s.signedIn);

  return (
    <div id="header-scenario" className="flex min-w-0 flex-1 items-center gap-2">
      <Button
        id="back-to-welcome"
        variant="icon"
        size="compact"
        title="Back to choosing a scenario"
        aria-label="Back to choosing a scenario"
        onClick={() => void leaveWorkspace()}
      >
        <ArrowLeftIcon />
      </Button>
      <span id="scenario-title" className="min-w-0 truncate font-semibold">
        {title}
      </span>
      <Select
        id="scenario-category"
        aria-label="Category"
        className="flex-none disabled:cursor-help"
        value={category}
        disabled={locked}
        title={locked ? LOCKED_TITLE : OPEN_TITLE}
        onChange={(event) => moveToCategory(event.currentTarget.value)}
      >
        {category === "" && <option value="" hidden />}
        {DRAFT_CATEGORIES.map((name) => (
          <option key={name} value={name}>
            {CATEGORY_LABELS[name]}
          </option>
        ))}
      </Select>
      <span
        id="category-note"
        role="status"
        title={note ?? undefined}
        hidden={note === null}
        className="min-w-0 flex-initial truncate text-small text-warn"
      >
        {note}
      </span>
      {draftNote && (
        <span
          id="draft-note"
          title="Showing your locally saved edits, not the original source."
          className="flex-none cursor-help rounded-full border border-line px-2 py-px text-small whitespace-nowrap text-muted"
        >
          Local draft
        </span>
      )}
      {unsaved && (
        <span id="unsaved-note" className="flex-none text-small font-semibold whitespace-nowrap text-warn">
          <span aria-hidden="true">●</span> Unsaved
        </span>
      )}
    </div>
  );
}
