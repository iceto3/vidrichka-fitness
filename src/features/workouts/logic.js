/**
 * Workout maths (pure): set/volume totals, calorie estimate, personal-record detection,
 * "last time" lookups, progression suggestions and new-session defaults.
 * @module features/workouts/logic
 */

/** @typedef {{w: number, r: number, done: boolean, doneAt?: number}} WSet */
/** @typedef {{exId: string, rest: number, target: {reps: number, weight: number}, sets: WSet[]}} WItem */
/** @typedef {{id: string, endedAt: number, items: WItem[]}} WSession */

/** Default MET for strength training when exercises have none. */
export const DEFAULT_MET = 5;

/**
 * Totals for a workout.
 * @param {WItem[]} items
 * @param {(id: string) => {weighted: boolean}|undefined} exById
 */
export function summarize(items, exById) {
  let setsDone = 0, setsPlanned = 0, reps = 0, volume = 0;
  for (const it of items) {
    const weighted = exById(it.exId)?.weighted ?? true;
    for (const s of it.sets) {
      setsPlanned++;
      if (!s.done) continue;
      setsDone++, (reps += s.r);
      if (weighted) volume += s.w * s.r;
    }
  }
  return { setsDone, setsPlanned, reps, volume: Math.round(volume) };
}

/**
 * Calories estimate: MET × body weight (kg) × hours.
 * @param {number} met
 * @param {number} kg
 * @param {number} seconds
 */
export const estimateKcal = (met, kg, seconds) => Math.round(met * kg * (Math.max(0, seconds) / 3600));

/**
 * Average MET of the exercises that were actually trained.
 * @param {WItem[]} items
 * @param {(id: string) => {met?: number}|undefined} exById
 */
export function sessionMet(items, exById) {
  const mets = items.filter((i) => i.sets.some((s) => s.done)).map((i) => exById(i.exId)?.met ?? DEFAULT_MET);
  return mets.length ? mets.reduce((a, b) => a + b, 0) / mets.length : DEFAULT_MET;
}

/**
 * Best set for an exercise across sessions (weighted: heaviest, then most reps; else most reps).
 * @param {WSession[]} sessions
 * @param {string} exId
 * @param {boolean} weighted
 * @returns {{w: number, r: number, at: number}|null}
 */
export function bestSet(sessions, exId, weighted) {
  /** @type {{w: number, r: number, at: number}|null} */
  let best = null;
  for (const s of sessions)
    for (const it of s.items)
      if (it.exId === exId)
        for (const x of it.sets)
          if (x.done && (!best || better(x, best, weighted))) best = { w: x.w, r: x.r, at: s.endedAt };
  return best;
}

/** @param {{w: number, r: number}} a @param {{w: number, r: number}} b @param {boolean} weighted */
const better = (a, b, weighted) => (weighted ? a.w > b.w || (a.w === b.w && a.r > b.r) : a.r > b.r);

/**
 * Personal records in a session compared with earlier history (first-ever sessions set a
 * baseline and are not PRs).
 * @param {WItem[]} items
 * @param {WSession[]} history Earlier sessions.
 * @param {(id: string) => {weighted: boolean}|undefined} exById
 * @returns {{exId: string, w: number, r: number, prevW: number, prevR: number}[]}
 */
export function detectPRs(items, history, exById) {
  const out = [];
  for (const it of items) {
    const weighted = exById(it.exId)?.weighted ?? true;
    const prev = bestSet(history, it.exId, weighted);
    const now = bestSet([{ id: '', endedAt: 0, items: [it] }], it.exId, weighted);
    if (prev && now && better(now, prev, weighted)) out.push({ exId: it.exId, w: now.w, r: now.r, prevW: prev.w, prevR: prev.r });
  }
  return out;
}

/**
 * Done sets of the most recent session containing the exercise.
 * @param {WSession[]} sessions
 * @param {string} exId
 * @returns {WSet[]}
 */
export function lastSets(sessions, exId) {
  const s = [...sessions].sort((a, b) => b.endedAt - a.endedAt).find((x) => x.items.some((i) => i.exId === exId && i.sets.some((y) => y.done)));
  return s?.items.find((i) => i.exId === exId)?.sets.filter((x) => x.done) ?? [];
}

/**
 * Progression nudge from last time's sets.
 * @param {WSet[]} last
 * @param {number} targetReps
 * @param {boolean} weighted
 * @param {number} step Weight step (kg).
 * @returns {{kind: 'weight'|'reps', value: number}|null}
 */
export function suggest(last, targetReps, weighted, step) {
  if (!last.length) return null;
  const maxR = Math.max(...last.map((s) => s.r));
  if (weighted) {
    const w = Math.max(...last.map((s) => s.w));
    return last.every((s) => s.r >= targetReps) ? { kind: 'weight', value: w + step } : { kind: 'reps', value: targetReps };
  }
  return { kind: 'reps', value: maxR < targetReps ? targetReps : maxR + 1 };
}

/**
 * Build the items for a new session from a plan, defaulting weights to last time's.
 * @param {{exId: string, sets: number, reps: number, weight: number, rest: number}[]} planItems
 * @param {WSession[]} sessions
 * @returns {WItem[]}
 */
export const newItems = (planItems, sessions) =>
  planItems.map((p) => {
    const last = lastSets(sessions, p.exId);
    const w = last.length ? last[last.length - 1].w : p.weight;
    return { exId: p.exId, rest: p.rest, target: { reps: p.reps, weight: p.weight }, sets: Array.from({ length: p.sets }, () => ({ w, r: p.reps, done: false })) };
  });

/**
 * Rough duration estimate in minutes (≈40 s work per set + rest).
 * @param {{sets: number, rest: number}[]} items
 */
export const estimateMinutes = (items) => Math.max(5, Math.round(items.reduce((a, i) => a + i.sets * (40 + i.rest), 0) / 60 / 5) * 5);

/**
 * Index of the set to highlight: the next unfinished set after the most recently completed one.
 * @param {WItem[]} items
 * @returns {[number, number]|null} [itemIndex, setIndex]
 */
export function activeSet(items) {
  /** @type {[number, number, number]} */
  let lastDone = [-1, -1, 0];
  items.forEach((it, i) => it.sets.forEach((s, j) => s.done && (s.doneAt ?? 0) >= lastDone[2] && (lastDone = [i, j, s.doneAt ?? 0])));
  const flat = items.flatMap((it, i) => it.sets.map((s, j) => /** @type {[number, number, boolean]} */ ([i, j, s.done])));
  const start = flat.findIndex(([i, j]) => i === lastDone[0] && j === lastDone[1]) + 1;
  const hit = [...flat.slice(start), ...flat.slice(0, start)].find(([, , d]) => !d);
  return hit ? [hit[0], hit[1]] : null;
}
