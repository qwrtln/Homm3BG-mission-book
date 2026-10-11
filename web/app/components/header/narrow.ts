/** Below 861px every header label collapses to the 1px visually hidden box that keeps it the button's accessible name. */
export const LABEL = "label max-[860px]:sr-only";

/** The narrower side padding an icon-and-label button gets once its label has collapsed. */
export const NARROW = "max-[860px]:px-2";

/** A segment's focused button rises above its neighbour, so its outline is not cut by the joint. */
export const SEGMENT = "focus-visible:relative focus-visible:z-10";
