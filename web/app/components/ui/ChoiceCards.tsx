export interface ChoiceCardOption {
  id: string;
  title: string;
  description: string;
  pressed: boolean;
  onSelect: () => void;
  hidden?: boolean;
  /** A short tag after the title, in Primer's done Label look (purple), such as who the option is for. */
  badge?: string;
}

export interface ChoiceCardsProps {
  /** The id of the visible element that labels the group. */
  labelledBy: string;
  options: ChoiceCardOption[];
}

/** A group of equal cards in the Primer look, each an aria-pressed toggle with a title and a description. */
export function ChoiceCards({ labelledBy, options }: ChoiceCardsProps) {
  return (
    <fieldset
      aria-labelledby={labelledBy}
      className="m-0 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3 border-0 p-0"
    >
      {options.map((option) => (
        <button
          key={option.id}
          id={option.id}
          type="button"
          hidden={option.hidden}
          aria-pressed={option.pressed}
          onClick={option.onSelect}
          className={`cursor-pointer rounded-md border bg-panel p-4 text-left text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${option.pressed ? "border-accent" : "border-line"}`}
        >
          <span
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold ${option.pressed ? "text-accent" : "text-ink"}`}
          >
            {option.title}
            {option.badge && (
              <span className="rounded-full border border-done px-2 text-small font-medium text-done">
                {option.badge}
              </span>
            )}
          </span>
          <span className="mt-1 block text-small text-muted">{option.description}</span>
        </button>
      ))}
    </fieldset>
  );
}
