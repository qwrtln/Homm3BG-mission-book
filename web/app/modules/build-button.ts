let button: HTMLButtonElement | null = null;

/** The header's Build button hands itself over on mount (null on unmount), so setBuilding() can measure it. */
export function registerBuildButton(element: HTMLButtonElement | null): void {
  button = element;
}

/** The Build button's width as drawn now; null when the header is not mounted. */
export function buildButtonWidth(): number | null {
  return button === null ? null : button.getBoundingClientRect().width;
}
