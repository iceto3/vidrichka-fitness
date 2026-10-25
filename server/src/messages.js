/**
 * Push message for a due slot. Texts come from the app (localized, with the user's and
 * the otter's names, and without action buttons on iPhone); English defaults otherwise.
 * @module messages
 */

/** @type {Record<string, {title: string, body: string, actions?: Record<string, string>}>} */
export const DEFAULT_TEXTS = {
  wake: { title: 'Good morning ☀️', body: 'Tap when you are up – Vidrichka has your protein timer ready.' },
  loud: { title: 'Rise and shine! ⏰', body: 'Still sleeping? Tap to start your day with Vidrichka.' },
  protein: {
    title: 'Protein time 🍳',
    body: 'Did you eat your 30 g of protein?',
    actions: { 'protein-yes': 'Yes, I ate' },
  },
  water: { title: 'Water break 💧', body: 'Hey, did you add your water?', actions: { 'water-add': '+1 glass' } },
  checkinAm: { title: 'Morning check-in', body: 'How do you feel, and how did you sleep? Two taps.' },
  checkinPm: { title: 'Evening check-in', body: 'How was your energy today? One tap.' },
  bed: { title: 'Bedtime 🌙', body: 'Vidrichka is getting sleepy… tuck her in?' },
  photos: { title: 'Monthly photo day 📸', body: 'Vidrichka is ready with the camera: front, back, left and right.' },
};

/** Text key of a slot (protein and water share one text per group). @param {{group: string, kind: string}} s */
export const textKey = (s) => (s.group === 'protein' || s.group === 'water' ? s.group : s.kind);

/**
 * @param {{texts: Record<string, any>}} device
 * @param {import('./schedule.js').Slot} s
 */
export function message(device, s) {
  const t = device.texts?.[textKey(s)] ?? DEFAULT_TEXTS[textKey(s)];
  return {
    v: 1,
    title: t.title,
    body: t.body,
    tag: `vf-${s.group}`,
    route: s.route,
    silent: s.silent,
    loud: s.loud,
    actions: s.actions.filter((a) => t.actions?.[a]).map((a) => ({ action: a, title: t.actions[a] })),
    day: s.day,
    kind: s.kind,
    group: s.group,
    at: s.at,
  };
}
