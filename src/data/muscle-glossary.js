/**
 * 1.4.1: the one muscle glossary of the app. Every "Подробно за мускулите" text in
 * data/technique.js names muscles only in these forms (a test checks it), so the same muscle is
 * never written in two ways (e.g. "солеус" vs "камбаловиден мускул (солеус)").
 * The source set (exercise-styles/final/*.md) uses the same forms.
 * @module data/muscle-glossary
 */

/** Canonical Bulgarian names; the Latin-based common name follows in brackets where people use it. */
export const MUSCLES = Object.freeze([
  // legs and hips
  'четириглав бедрен мускул (квадрицепс)',
  'прав бедрен мускул',
  'задна бедрена група',
  'голям седалищен мускул',
  'среден седалищен мускул',
  'малък седалищен мускул',
  'седалищни мускули',
  'голям привеждащ мускул',
  'опъвач на широката фасция',
  'хълбочно-поясен мускул (илиопсоас)',
  'шивашки мускул',
  'нежен мускул',
  'подколенен мускул',
  'двуглав мускул на прасеца (гастрокнемиус)',
  'камбаловиден мускул (солеус)',
  'преден пищялен мускул',
  // trunk
  'коремни мускули',
  'прав коремен мускул',
  'коси коремни мускули',
  'напречен коремен мускул',
  'квадратен мускул на кръста',
  'изправители на гръбначния стълб',
  // back and shoulder girdle
  'широк гръбен мускул',
  'трапецовиден мускул',
  'ромбовидни мускули',
  'мускул повдигач на лопатката',
  'голям обли мускул',
  'малък обли мускул',
  'надостен мускул',
  'подостен мускул',
  'преден назъбен мускул',
  'преден делтоид',
  'страничен делтоид',
  'заден делтоид',
  // chest and arms
  'голям гръден мускул',
  'малък гръден мускул',
  'клюномишничен мускул',
  'двуглав мишничен мускул (бицепс)',
  'къса глава на бицепса',
  'мишничен мускул (брахиалис)',
  'раменно-лъчев мускул (брахиорадиалис)',
  'триглав мишничен мускул (трицепс)',
  'дълга глава на трицепса',
  'сгъвачи на китката',
  'разгъвачи на китката',
]);

/** Which part works, or how it works, written in brackets after a muscle name. */
export const QUALIFIERS = Object.freeze([
  'гръдна част',
  'ключична част',
  'горна част',
  'долна част',
  'средна и долна част',
  'горна и средна част',
  'изометрично',
]);

/** Role labels (singular when the list has one muscle). */
export const ROLES = Object.freeze({
  Основен: 'Основни',
  Синергист: 'Синергисти',
  Стабилизатор: 'Стабилизатори',
  'Динамичен стабилизатор': 'Динамични стабилизатори',
  'Антагонист-стабилизатор': 'Антагонист-стабилизатори',
  'Синергист и стабилизатор': 'Синергисти и стабилизатори',
});

/**
 * Other spellings of the same muscles that must not appear in any user-visible text.
 * Each entry is a RegExp source (Cyrillic-aware word boundaries are added by the test).
 */
export const BANNED_VARIANTS = Object.freeze([
  'обел',
  'ромбоид\\p{L}*',
  'тибиален',
  'тензор',
  'флексори на китката',
  'екстензори на китката',
  'китков\\p{L}* флексори',
  'делтоиди',
  'аддуктор\\p{L}*',
  'адуктор\\p{L}*',
  'хамстринг\\p{L}*',
  'глутеус\\p{L}*',
  'латисимус',
  'пекторал\\p{L}*',
  'трапец(?!овид)\\p{L}*',
]);

/**
 * Split one muscles text ("a, b (горна част), c.") into its muscles.
 * @param {string} text
 * @returns {{name: string, qualifier: string | null}[]}
 */
export function parseMuscles(text) {
  return text
    .replace(/\.$/, '')
    .split(', ')
    .map((part) => {
      const q = /^(.*) \(([^()]+)\)$/.exec(part);
      if (q && !MUSCLES.includes(part) && QUALIFIERS.includes(q[2])) return { name: q[1], qualifier: q[2] };
      return { name: part, qualifier: null };
    });
}
