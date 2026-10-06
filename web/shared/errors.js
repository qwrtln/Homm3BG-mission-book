/**
 * The message of a caught value. `catch` binds `unknown`: a thrown value is
 * usually an Error but need not be one, so this reads the message when there
 * is one and stringifies whatever else was thrown.
 *
 * @param {unknown} thrown
 * @returns {string}
 */
export function errorMessage(thrown) {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * The stack of a caught value, falling back to its message. Used where a
 * whole trace is wanted, such as a build log.
 *
 * @param {unknown} thrown
 * @returns {string}
 */
export function errorTrace(thrown) {
  return thrown instanceof Error && thrown.stack ? thrown.stack : errorMessage(thrown);
}
