import { type AppState, store } from "../store.ts";

/**
 * The old modules' view of the store: reading `state.chosenPath` reads the
 * store, assigning to it sets the store, so one source of state exists. Its
 * shape is AppState in app/store.ts. A mutation inside a field (a Map's
 * `set`) does not notify subscribers, as before; assign a new value to do so.
 */
export const state: AppState = new Proxy({} as AppState, {
  get: (_target, key: string) => store.getState()[key as keyof AppState],
  set: (_target, key: string, value) => {
    store.setState({ [key]: value });
    return true;
  },
});

/**
 * The editor instance, for the paths that cannot run before initEditor has
 * made it. Throws rather than returning null, so no caller has to assert a
 * shape the type system cannot see.
 */
export function requireEditor(): CodeMirrorEditor {
  if (state.cm === null) throw new Error("The editor is not ready yet.");
  return state.cm;
}
