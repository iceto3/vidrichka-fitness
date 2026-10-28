/**
 * Release notes (pure, unit tested). One entry per release, newest first; each item is
 * `[icon, i18n key, needs?]` where `needs` is a feature flag ('voice' = voice server set,
 * 'push' = push server set). The "What's new" popup shows the items of every release newer
 * than the one the user last saw; Profile › What's new lists them all.
 * Extension point: for a new release, add an entry at the TOP with its keys in bg.js and en.js.
 * @module features/whatsnew/notes
 */

/** @typedef {[string, string, ('voice'|'push')?]} NoteItem */
/** @typedef {{v: string, items: NoteItem[]}} Release */

/** @type {Release[]} */
export const NOTES = [
  { v: '1.4.1', items: [['dumbbell', 'whatsNew.technique141']] },
  {
    v: '1.4.0',
    items: [
      ['calendar', 'whatsNew.dayView'],
      ['camera', 'whatsNew.shot', 'voice'],
      ['drop', 'whatsNew.waterMinus'],
      ['food', 'whatsNew.foods140'],
      ['chart', 'whatsNew.charts140'],
      ['star', 'whatsNew.recap'],
      ['message', 'whatsNew.feedback140'],
      ['check', 'whatsNew.fixes140'],
    ],
  },
  {
    v: '1.3.4',
    items: [
      ['food', 'whatsNew.homeMeals'],
      ['mic', 'whatsNew.voiceTour', 'voice'],
      ['steps', 'whatsNew.steps'],
      ['moon', 'whatsNew.sleep134'],
      ['chart', 'whatsNew.trends'],
      ['message', 'whatsNew.feedback'],
    ],
  },
  {
    v: '1.3.3',
    items: [
      ['mic', 'whatsNew.record', 'voice'],
      ['check', 'whatsNew.fixes133'],
    ],
  },
  {
    v: '1.3.2',
    items: [
      ['undo', 'whatsNew.undoPill'],
      ['star', 'whatsNew.comboRename'],
      ['check', 'whatsNew.fixes132'],
    ],
  },
  {
    v: '1.3.1',
    items: [
      ['mic', 'whatsNew.voiceMeal', 'voice'],
      ['food', 'whatsNew.fiberSalt'],
      ['edit', 'whatsNew.mealEdit'],
      ['star', 'whatsNew.combos'],
    ],
  },
  { v: '1.3.0', items: [['mic', 'whatsNew.voice', 'voice']] },
  {
    v: '1.2.1',
    items: [
      ['camera', 'whatsNew.photos'],
      ['calendar', 'whatsNew.photoMonth'],
      ['check', 'whatsNew.fixes121'],
    ],
  },
  {
    v: '1.2.0',
    items: [
      ['bell', 'whatsNew.push', 'push'],
      ['sun', 'whatsNew.pushIos', 'push'],
      ['check', 'whatsNew.pushStop', 'push'],
      ['clock', 'whatsNew.proteinBar'],
      ['food', 'whatsNew.breakfast'],
      ['drop', 'whatsNew.micro'],
    ],
  },
];

/**
 * `[major, minor, patch]` of a version string ('1.2' = 1.2.0, '' or junk = 0.0.0; a build
 * suffix like `-beta-abc` is ignored). @param {string} v
 */
export function parseV(v) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : [0, 0, 0];
}

/** a < b ? @param {string} a @param {string} b */
export function older(a, b) {
  const x = parseV(a),
    y = parseV(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/**
 * Items to show after an update. @param {string} seen last version whose note was shown
 * ('' = never, i.e. a pre-1.2 install) @param {{voice: boolean, push: boolean}} flags
 * @param {Release[]} [notes] @param {string} [current] the running version: notes of later
 *   releases are never shown (e.g. a note written before the version bump)
 * @returns {{items: [string, string][], gender: boolean, push: boolean}} `gender`: also ask
 *   for the grammatical gender (came from before 1.2); `push`: offer to turn reminders on.
 */
export function newSince(seen, flags, notes = NOTES, current = '999.0.0') {
  const fresh = notes.filter((r) => older(seen, r.v) && !older(current, r.v));
  const items = fresh.flatMap((r) => r.items.filter(([, , need]) => !need || flags[need]));
  const from12 = older(seen, '1.2.0');
  return {
    items: items.map(([i, k]) => /** @type {[string, string]} */ ([i, k])),
    gender: from12,
    push: from12 && flags.push,
  };
}

/**
 * Every release up to `current` with the items available on this phone (Profile › What's new).
 * @param {{voice: boolean, push: boolean}} flags @param {string} [current]
 */
export const allNotes = (flags, current = '999.0.0') =>
  NOTES.filter((r) => !older(current, r.v))
    .map((r) => ({ v: r.v, items: r.items.filter(([, , need]) => !need || flags[need]) }))
    .filter((r) => r.items.length);
