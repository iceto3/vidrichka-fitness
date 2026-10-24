/**
 * Tiny publish/subscribe event bus. Features talk to each other through events
 * (e.g. `workout:finished`) instead of importing each other, which keeps them decoupled.
 * @module core/bus
 */

/** @type {Map<string, Set<(payload: any) => void>>} */
const handlers = new Map();

/**
 * Subscribe to an event.
 * @param {string} name Event name.
 * @param {(payload: any) => void} fn Handler.
 * @returns {() => void} Unsubscribe function.
 */
export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name)?.add(fn);
  return () => handlers.get(name)?.delete(fn);
}

/**
 * Emit an event. A failing handler is logged and never breaks the others.
 * @param {string} name Event name.
 * @param {any} [payload] Data passed to handlers.
 */
export function emit(name, payload) {
  for (const fn of handlers.get(name) ?? []) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus] handler for "${name}" failed`, err);
    }
  }
}
