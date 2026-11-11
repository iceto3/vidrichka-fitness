/**
 * 1.6.0: the coach's short cues and technique videos for the exercises of the two home
 * programs (from the coach's PDF program; videos: the coach's own YouTube channel, each
 * checked against the exercise it belongs to). Exercises without a verified technique card
 * (data/technique.js) show these cues instead; a `video` replaces the YouTube search link.
 * Texts are kept gender-neutral (imperatives), so no `{ f, m }` variants are needed.
 * @module data/cues
 */

/** @typedef {{bg: string[], en: string[], video?: string}} Cues */

/** @param {string} id YouTube video id */
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;

/** @type {Record<string, Cues>} */
export const CUES = {
  kb_swing: {
    bg: [
      'Застани в широк (сумо) разкрач, коленете са леко свити.',
      'Наведи се от таза с изправен гръб и стегнат корем.',
      'Избутай пудовката напред с тласък от седалището, не с ръцете.',
    ],
    en: [
      'Stand in a wide (sumo) stance with soft knees.',
      'Hinge at the hips with a flat back and braced core.',
      'Drive the kettlebell forward with your glutes, not your arms.',
    ],
  },
  band_lateral_walk: {
    bg: [
      'Ластикът е на 1 пръст над коленете.',
      'Торсът е леко наведен напред, гърбът е прав, коремът – стегнат, седалището – назад.',
      'Малки стъпки: две наляво, после две надясно.',
      'Разтварянето идва от коляното, не от стъпалото.',
    ],
    en: [
      'Band one finger above the knees.',
      'Lean forward slightly: flat back, braced core, hips back.',
      'Small steps: two to the left, then two to the right.',
      'Push out from the knees, not the feet.',
    ],
    video: yt('XhhtM8thS5M'),
  },
  knee_push_up: {
    bg: [
      'Ръцете са на нивото на гърдите.',
      'При спускане лактите са на около 45° от тялото.',
      'Целта е 10 повторения – когато стане тежко, прави колкото можеш.',
    ],
    en: [
      'Hands level with your chest.',
      'Keep the elbows at about 45° as you lower.',
      'Aim for 10 reps – when it gets hard, do as many as you can.',
    ],
    video: yt('a6B_iuuERT8'),
  },
  db_bent_over_row: {
    bg: ['Гърбът е изправен, коремът – стегнат през цялото време.', 'Дърпай дъмбелите към таза с мускулите на гърба.'],
    en: ['Keep your back straight and core braced throughout.', 'Pull the dumbbells towards your hips with your back.'],
    video: yt('TKMUEFcIZUs'),
  },
  one_arm_db_row: {
    bg: [
      'Подпри се с ръка и коляно (на пейка или диван).',
      'Спусни ръката, докато плешката се изпъне.',
      'Дърпай с мускула на гърба, не с ръката.',
    ],
    en: [
      'Support yourself with one hand and knee (on a bench or sofa).',
      'Lower the arm until the shoulder blade stretches.',
      'Pull with your back muscle, not your arm.',
    ],
    video: yt('1oavfYp8TBU'),
  },
  lying_db_french_press: {
    bg: [
      'Легни на постелка, сгъни ръцете и насочи лактите към тавана.',
      'Разгъвай нагоре, без да местиш лактите – така работи само трицепсът.',
    ],
    en: [
      'Lie on a mat, bend your arms and point the elbows at the ceiling.',
      'Extend up without moving the elbows, so only the triceps work.',
    ],
    video: yt('GxfNt34rFwY'),
  },
  cross_body_crunch: {
    bg: [
      'Повдигни едновременно горната и долната част на тялото до седнало положение.',
      'Събери левия крак и дясната ръка по средата.',
      'Легни обратно и повтори с другата страна.',
    ],
    en: [
      'Lift your upper and lower body together towards sitting.',
      'Bring the left leg and right hand together in the middle.',
      'Lie back down and repeat on the other side.',
    ],
    video: yt('g3ETmdtmn2w'),
  },
  single_leg_hip_thrust: {
    bg: [
      'Същите правила като при хип тръста на два крака.',
      'Когато стане лесно, сложи дъмбел (напр. 4 кг) върху работещия крак.',
    ],
    en: ['Same rules as the two-leg hip thrust.', 'When it gets easy, put a dumbbell (e.g. 4 kg) on the working leg.'],
    video: yt('4vOc3_R0SLI'),
  },
  single_leg_rdl: {
    bg: [
      'Започни без тежест.',
      'Гърбът е изправен при навеждането, коремът – задължително стегнат.',
      'Когато стане лесно, вземи тежест (напр. 6 кг) в противоположната ръка.',
    ],
    en: [
      'Start without weight.',
      'Keep your back straight as you hinge and always brace your core.',
      'When it gets easy, hold a weight (e.g. 6 kg) in the opposite hand.',
    ],
    video: yt('HcMekCmNEa0'),
  },
  band_glute_kickback: {
    bg: [
      'Ластикът е на 1 пръст над коленете.',
      'Ритай назад – движението идва от седалището, кръстът не се движи.',
      'Ако имаш тежести за краката, можеш да ги добавиш.',
    ],
    en: [
      'Band one finger above the knees.',
      'Kick back – the movement comes from the glutes, the lower back stays still.',
      'Add ankle weights if you have them.',
    ],
    video: yt('Mq8ivBp6FLg'),
  },
  band_abductor_kick: {
    bg: [
      'Ластикът е на 1 пръст над коленете.',
      'Ритай настрани – движението идва от седалището, кръстът не се движи.',
      'Не подпирай коляното в земята между повторенията.',
    ],
    en: [
      'Band one finger above the knees.',
      'Kick out to the side – the movement comes from the glutes, the lower back stays still.',
      "Don't rest the knee on the floor between reps.",
    ],
  },
  barbell_row: {
    bg: [
      'Застани като за гребане: гърбът е изправен, коремът – стегнат.',
      'Дърпай лоста към таза и събирай плешките назад.',
    ],
    en: [
      'Get into the row position: straight back, braced core.',
      'Pull the bar to your hips and squeeze the shoulder blades back.',
    ],
    video: yt('JNKxr-Dn2Jk'),
  },
  front_raise: {
    bg: [
      'Вдигай ръцете напред до нивото на очите.',
      'Спускай бавно и с контрол.',
      'Ако е тежко, хвани една тежест с двете ръце.',
    ],
    en: [
      'Raise your arms forward to eye level.',
      'Lower slowly and under control.',
      'If it is too heavy, hold one weight with both hands.',
    ],
    video: yt('zT2j9noC4u0'),
  },
  overhead_triceps_extension: {
    bg: ['Насочи лакътя към тавана.', 'Разгъвай само от лакътя.', 'Коремът е стегнат през цялото време.'],
    en: ['Point the elbow at the ceiling.', 'Extend from the elbow only.', 'Keep your core braced throughout.'],
    video: yt('9COpcY4wwhI'),
  },
  hammer_curl: {
    bg: ['При сгъването лакътят винаги сочи надолу.', 'Спускай бавно и контролирано, докато ръцете се изпънат докрай.'],
    en: [
      'Keep the elbows pointing down as you curl.',
      'Lower slowly and under control until the arms are fully straight.',
    ],
    video: yt('QuUXhaihxBA'),
  },
  kb_knee_tuck_situp: {
    bg: [
      'Дръж пудовката (напр. 4 кг) пред гърдите.',
      'Сгъвай коленете към тежестта, без краката да опират в пода.',
      'Отпусни се назад, докато легнеш изцяло.',
    ],
    en: [
      'Hold the kettlebell (e.g. 4 kg) at your chest.',
      'Bring the knees to the weight without your feet touching the floor.',
      'Lower back until you are lying flat.',
    ],
    video: yt('-FukOmkiN20'),
  },
  // the coach's videos for the library exercises of the home programs (they keep their
  // verified technique card; the video replaces the YouTube search link)
  back_squat: { bg: [], en: [], video: yt('6SX8fOZ2xSc') },
  reverse_lunge: { bg: [], en: [], video: yt('adbvywmfLpU') },
  lateral_raise: { bg: [], en: [], video: yt('f7O4k88h-iQ') },
  db_shoulder_press: { bg: [], en: [], video: yt('db5tTrvqYiU') },
  bulgarian_split_squat: { bg: [], en: [], video: yt('z3nkTqRcmHM') },
};

/** Cues of an exercise (undefined when it has none). @param {string} id */
export const cuesOf = (id) => (Object.hasOwn(CUES, id) ? CUES[id] : undefined);
