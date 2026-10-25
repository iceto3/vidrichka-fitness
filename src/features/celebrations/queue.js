/**
 * Celebration queue (pure, DOM-free): plays one celebration at a time, in order, and never
 * stacks them. A celebration with a `key` that is already waiting is merged (the newer
 * options win), so rapid taps — e.g. three "+1 glass" in a row — don't line up three toasts.
 * A keyed item with `live` that matches the one playing now is dropped: the playing toast
 * reads its text from the current state itself (e.g. "Set done! 14 of 18" while tapping fast).
 * @module features/celebrations/queue
 */

/**
 * @template {{key?: string}} T
 * @param {(item: T) => Promise<unknown>} play Runs one item; the next starts when it settles.
 */
export function createQueue(play) {
  /** @type {T[]} */
  const waiting = [];
  let busy = false;
  /** @type {T|null} */
  let current = null;

  async function next() {
    if (busy) return;
    const item = waiting.shift();
    if (!item) return;
    busy = true;
    current = item;
    try {
      await play(item);
    } catch {
      /* a broken celebration must never block the queue */
    } finally {
      busy = false;
      current = null;
      next();
    }
  }

  return {
    /** Queue an item. @param {T} item @returns {boolean} false if merged into a waiting one. */
    push(item) {
      if (item.key && current?.key === item.key && /** @type {any} */ (item).live) return false;
      const i = item.key ? waiting.findIndex((w) => w.key === item.key) : -1;
      if (i >= 0) {
        waiting[i] = item;
        return false;
      }
      waiting.push(item);
      next();
      return true;
    },
    /** Items not started yet. */
    get pending() {
      return waiting.length;
    },
    /** Whether one is playing now. */
    get busy() {
      return busy;
    },
    /** Drop everything that has not started. */
    clear: () => void (waiting.length = 0),
  };
}
