import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { DRAFT_CATEGORIES } from "../../../shared/scenario-name.ts";
import { groupedResults as groupedResultsFor, type ResultGroup } from "../../../shared/search.ts";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../../modules/config.ts";
import { pickBlank, selectPending } from "../../modules/picker.ts";
import { type AppState, useAppStore } from "../../store.ts";

/** Every matching entry, grouped by book and category, each group's items sorted best-match first. */
function groupedResults(entries: AppState["entries"], query: string): ResultGroup[] {
  return groupedResultsFor(entries, query, CATEGORY_ORDER);
}

/** One flattened row, for the keyboard's wrap-around move and Enter. */
interface FlatItem {
  path: string;
  title: string;
}

function flatten(groups: ResultGroup[]): FlatItem[] {
  return groups.flatMap((group) => group.items.map(({ entry }) => ({ path: entry.path, title: entry.title })));
}

/**
 * The welcome screen's search box and its results dropdown: a combobox over
 * the book's scenarios, with an empty-search fallback to the blank
 * templates. Picking a row (by mouse, keyboard or a blank-template button)
 * writes the pick to the store through modules/picker.ts; the box itself
 * mirrors whatever was picked, from anywhere (a blank-template link in
 * scratch-row included).
 */
export function SearchCombobox() {
  const pendingTitle = useAppStore((s) => s.pendingTitle);
  const pickerMode = useAppStore((s) => s.pickerMode);
  const entries = useAppStore((s) => s.entries);
  const entriesError = useAppStore((s) => s.entriesError);
  const [query, setQuery] = useState(pendingTitle);
  const [listOpen, setListOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A pick made anywhere (a row here, a blank button here or in scratch-row)
  // shows its title in the box and closes the dropdown, exactly like picking
  // used to set the search box value and hide its results directly.
  useEffect(() => {
    setQuery(pendingTitle);
    setListOpen(false);
    setActiveItem(-1);
  }, [pendingTitle]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".combobox")) setListOpen(false);
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  // Every native input event reopens the list with no row highlighted, as the
  // old module's redraw did. React's onChange skips an input event that leaves
  // the value unchanged, so it cannot carry this on its own.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const reopen = (): void => {
      setListOpen(true);
      setActiveItem(-1);
    };
    input.addEventListener("input", reopen);
    return () => input.removeEventListener("input", reopen);
  }, []);

  useEffect(() => {
    if (activeItem < 0) return;
    const row = listRef.current?.querySelectorAll(".combobox-item")[activeItem];
    row?.scrollIntoView({ block: "nearest" });
  }, [activeItem]);

  const groups = entriesError ? [] : groupedResults(entries, query);
  const flatItems = flatten(groups);
  const blanksAllowed = pickerMode === "new";

  function pick(path: string, title: string): void {
    selectPending(path, title);
  }

  function moveActive(delta: number): void {
    if (!flatItems.length) return;
    setActiveItem((current) => (current + delta + flatItems.length) % flatItems.length);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Escape") {
      setListOpen(false);
      setActiveItem(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = activeItem >= 0 ? flatItems[activeItem] : flatItems[0];
      if (target) pick(target.path, target.title);
    }
  }

  return (
    <div className="combobox">
      <input
        type="text"
        id="search"
        aria-labelledby="pick-heading"
        placeholder="Type a scenario name…"
        autoComplete="off"
        value={query}
        onFocus={() => {
          setListOpen(true);
          setActiveItem(-1);
        }}
        ref={inputRef}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="combobox-list" id="search-results" ref={listRef} hidden={!listOpen && entriesError === null}>
        {entriesError ? (
          <div className="combobox-empty">Could not read the scenario list: {entriesError}</div>
        ) : groups.length === 0 ? (
          <>
            <div className="combobox-empty">No scenario matches.</div>
            {blanksAllowed && (
              <div className="combobox-blanks">
                {DRAFT_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="combobox-blank"
                    data-blank={category}
                    onClick={() => pickBlank(category)}
                  >
                    Start a blank {CATEGORY_LABELS[category]} scenario
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          groups.map((group) => {
            let offset = 0;
            for (const previous of groups) {
              if (previous === group) break;
              offset += previous.items.length;
            }
            return (
              <div key={`${group.book}|${group.category}`}>
                <div className="combobox-group-label">
                  {group.book === "mission" ? "Mission Book" : "Draft Book"}: {group.category}
                </div>
                {group.items.map(({ entry }, index) => (
                  <button
                    key={entry.path}
                    type="button"
                    className={`combobox-item${offset + index === activeItem ? " active" : ""}`}
                    data-path={entry.path}
                    // mousedown, not click: fires before the input's blur hides the list.
                    onMouseDown={() => pick(entry.path, entry.title)}
                  >
                    {entry.title}
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
