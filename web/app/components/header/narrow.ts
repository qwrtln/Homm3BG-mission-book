/** Below 861px every header label collapses to the 1px visually hidden box that keeps it the button's accessible name. */
export const LABEL = "label max-[860px]:sr-only";

/** The narrower side padding an icon-and-label button gets once its label has collapsed. */
export const NARROW = "max-[860px]:px-2";

/** A segment's focused button rises above its neighbour, so its outline is not cut by the joint. */
export const SEGMENT = "focus-visible:relative focus-visible:z-10";

/** At phone width (640px and below) a header part that does not fit is hidden. An action hidden this way gets a PHONE_ONLY twin in the overflow menu. */
export const PHONE_HIDDEN = "max-[640px]:hidden";

/** The overflow-menu twin of a control hidden at phone width: shown only at that width. */
export const PHONE_ONLY = "min-[641px]:hidden";
