/**
 * The message of a caught value. `catch` binds `unknown`: a thrown value is
 * usually an Error but need not be one, so this reads the message when there
 * is one and stringifies whatever else was thrown.
 */
export function errorMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * The stack of a caught value, falling back to its message. Used where a
 * whole trace is wanted, such as a build log.
 */
export function errorTrace(thrown: unknown): string {
  return thrown instanceof Error && thrown.stack ? thrown.stack : errorMessage(thrown);
}
