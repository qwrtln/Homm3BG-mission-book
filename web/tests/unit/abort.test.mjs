// Tier 1 unit tests for web/shared/abort.js, the helper that lets a Stop
// press end a build without waiting on the step it interrupted.

import assert from "node:assert/strict";
import test from "node:test";

import { untilAborted } from "../../shared/abort.js";

/** A promise that never settles, standing in for a compile that hangs. */
const never = () => new Promise(() => {});

test("untilAborted resolves with the promise when nothing aborts", async () => {
  const controller = new AbortController();
  assert.equal(await untilAborted(Promise.resolve(42), controller.signal), 42);
});

test("untilAborted passes a rejection through when nothing aborts", async () => {
  const controller = new AbortController();
  await assert.rejects(untilAborted(Promise.reject(new Error("boom")), controller.signal), /boom/);
});

test("untilAborted rejects with the abort reason while the promise is still pending", async () => {
  const controller = new AbortController();
  const pending = untilAborted(never(), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("untilAborted rejects with a custom abort reason unchanged", async () => {
  const controller = new AbortController();
  const reason = new Error("stopped by the contributor");
  const pending = untilAborted(never(), controller.signal);
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
});

test("untilAborted rejects at once on a signal that has already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(untilAborted(Promise.resolve("too late"), controller.signal), { name: "AbortError" });
});

test("untilAborted ignores an abort after the promise has settled", async () => {
  const controller = new AbortController();
  const value = await untilAborted(Promise.resolve("done"), controller.signal);
  controller.abort();
  assert.equal(value, "done");
});

test("untilAborted handles a rejection that lands after the abort", async () => {
  let unhandled = null;
  /** @param {unknown} reason */
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const controller = new AbortController();
    /** @type {(error: Error) => void} */
    let rejectLate = () => {};
    const late = new Promise((_, reject) => {
      rejectLate = reject;
    });
    const pending = untilAborted(late, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    rejectLate(new Error("the dropped compile timed out"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(unhandled, null, "a rejection after the abort must not go unhandled");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("untilAborted stops listening once the promise settles", async () => {
  const controller = new AbortController();
  let removed = 0;
  const { signal } = controller;
  const remove = signal.removeEventListener.bind(signal);
  signal.removeEventListener = (...args) => {
    removed += 1;
    return remove(...args);
  };
  await untilAborted(Promise.resolve(1), signal);
  await new Promise((resolve) => setImmediate(resolve)); // the cleanup runs a microtask later
  assert.equal(removed, 1);
});
