/**
 * 1.6.0: the coach's short cues and technique videos for the exercises of the two home
 * programs (from the coach's PDF program; videos: the coach's own YouTube channel, each
 * checked against the exercise it belongs to). Exercises without a verified technique card
 * (data/technique.js) show these cues instead; a `video` replaces the YouTube search link.
 * 1.6.1: `sources` – ExRx / ACE pages the cues were checked against (only real, matching pages).
 * Texts are kept gender-neutral (imperatives), so no `{ f, m }` variants are needed.
 * @module data/cues
 */

/** @typedef {{text: string, url: string}} CueSource */
/** @typedef {{bg: string[], en: string[], video?: string, sources?: CueSource[]}} Cues */

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
    sources: [
      { text: 'ExRx.net – Kettlebell Two Arm Swing', url: 'https://exrx.net/WeightExercises/Kettlebell/KBTwoArmSwing' },
      {
        text: 'ACE Exercise Library – Swing',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/391/swing/',
      },
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
  // 1.6.1: the kettlebell list – cues checked against the linked ExRx / ACE pages where they
  // exist; no source is listed where there is no matching page (never a made-up one)
  kb_one_arm_swing: {
    bg: [
      'Пудовката е малко пред теб, стъпалата – малко по-широко от раменете.',
      'Наведи се от таза с прав гръб, хвани дръжката с една ръка и я „подай“ назад между краката.',
      'Изпъни рязко таза и коленете – пудовката се издига до височината на гърдите от тласъка на седалището, не от рамото.',
      'Не позволявай на торса да се извърти – раменете остават успоредни на пода.',
    ],
    en: [
      'The kettlebell is slightly in front of you, feet a bit wider than the shoulders.',
      'Hinge at the hips with a flat back, grip the handle with one hand and hike it back between your legs.',
      'Snap the hips and knees straight – the bell rises to chest height from the glutes, not the shoulder.',
      'Resist the twist – keep the shoulders square.',
    ],
    sources: [
      { text: 'ExRx.net – Kettlebell Swing', url: 'https://exrx.net/WeightExercises/Kettlebell/KBSwing' },
      {
        text: 'ACE Exercise Library – Single-arm Swing',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/392/single-arm-swing/',
      },
    ],
  },
  kb_sumo_deadlift: {
    bg: [
      'Застани в широк разкрач, пръстите леко навън, пудовката е между стъпалата.',
      'Клекни с избутване на таза назад, гърбът е прав, хвани дръжката с две ръце.',
      'Изправи се, като натискаш пода с цялото стъпало и стягаш седалището горе.',
      'Коленете следват посоката на пръстите.',
    ],
    en: [
      'Stand wide with toes slightly out, the kettlebell between your feet.',
      'Sit the hips back with a flat back and grip the handle with both hands.',
      'Stand up by pushing the floor away and squeeze the glutes at the top.',
      'Knees track over the toes.',
    ],
    sources: [
      {
        text: 'ExRx.net – Kettlebell Sumo Deadlift',
        url: 'https://exrx.net/WeightExercises/Kettlebell/KBSumoDeadlift',
      },
    ],
  },
  kb_good_morning: {
    bg: [
      'Дръж пудовката до гърдите с двете ръце, стъпалата – на ширина на таза.',
      'Коленете са леко свити, наведи се напред от таза с прав гръб.',
      'Спри, когато усетиш опъване в задната част на бедрата, и се изправи със стягане на седалището.',
      'Използвай лека тежест – гърбът не се закръгля.',
    ],
    en: [
      'Hold the kettlebell at your chest with both hands, feet hip-width apart.',
      'With soft knees, hinge forward at the hips with a flat back.',
      'Stop when you feel the stretch in the hamstrings and stand up by squeezing the glutes.',
      'Go light – the back never rounds.',
    ],
    sources: [
      { text: 'ExRx.net – Barbell Good-morning', url: 'https://exrx.net/WeightExercises/Hamstrings/BBGoodMorning' },
    ],
  },
  kb_goblet_squat: {
    bg: [
      'Дръж пудовката за рогата пред гърдите, стъпалата – на ширина на раменете или малко по-широко.',
      'Клекни, като таза отива назад и надолу, гърбът е прав, гърдите – нагоре.',
      'Слез поне до успоредно на пода и се изправи, като натискаш с цялото стъпало.',
      'Коленете сочат в посоката на пръстите.',
    ],
    en: [
      'Hold the kettlebell by the horns at your chest, feet shoulder-width or a bit wider.',
      'Squat by sitting the hips back and down, back straight, chest up.',
      'Go to at least parallel and stand up pushing through the whole foot.',
      'Knees point the same way as the toes.',
    ],
    sources: [
      { text: 'ExRx.net – Kettlebell Goblet Squat', url: 'https://exrx.net/WeightExercises/Kettlebell/KBGobletSquat' },
    ],
  },
  kb_sumo_squat: {
    bg: [
      'Широк разкрач, пръстите сочат навън, пудовката виси с изпънати ръце между краката.',
      'Клекни право надолу, като избутваш коленете навън, гърбът остава изправен.',
      'Изправи се и стегни седалището горе.',
    ],
    en: [
      'Take a wide stance with toes out, the kettlebell hanging between your legs with straight arms.',
      'Squat straight down pushing the knees out, back upright.',
      'Stand up and squeeze the glutes at the top.',
    ],
  },
  walking_lunge: {
    bg: [
      'Направи голяма крачка напред и спусни задното коляно към пода.',
      'Предното коляно е над стъпалото, торсът е изправен, коремът – стегнат.',
      'Оттласни се и изнеси задния крак напред в следващия напад.',
      'С тежест: пудовка в ръцете отстрани или пред гърдите.',
    ],
    en: [
      'Take a big step forward and lower the back knee towards the floor.',
      'Front knee over the foot, torso tall, core braced.',
      'Push off and bring the back leg forward into the next lunge.',
      'With weight: kettlebells at your sides or one at the chest.',
    ],
    sources: [
      {
        text: 'ACE – 5 Lunge Variations (Walking Lunge)',
        url: 'https://www.acefitness.org/resources/everyone/blog/6971/5-lunge-variations-for-leaner-legs/',
      },
    ],
  },
  lateral_lunge: {
    bg: [
      'Застани с крака на ширина на таза и направи широка крачка встрани.',
      'Избутай таза назад и свий коляното на стъпващия крак – другият крак остава изпънат.',
      'Оттласни се обратно в изходна позиция.',
      'Стъпалата остават успоредни, пръстите – напред.',
    ],
    en: [
      'Stand hip-width and take a wide step to the side.',
      'Push the hips back and bend the stepping knee – the other leg stays straight.',
      'Push back to the start.',
      'Keep both feet parallel, toes forward.',
    ],
    sources: [
      {
        text: 'ACE Exercise Library – Lateral Lunge',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/364/lateral-lunge/',
      },
    ],
  },
  curtsy_lunge: {
    bg: [
      'Стъпи с единия крак назад и диагонално зад другия – като при реверанс.',
      'Спусни се, докато предното бедро стане почти успоредно на пода.',
      'Тазът и раменете остават обърнати напред, предното коляно е над стъпалото.',
      'Оттласни се с предния крак обратно в изходна позиция.',
    ],
    en: [
      'Step one leg back and diagonally behind the other – like a curtsy.',
      'Lower until the front thigh is almost parallel to the floor.',
      'Keep the hips and shoulders facing forward, front knee over the foot.',
      'Push through the front leg back to the start.',
    ],
  },
  step_up: {
    bg: [
      'Стъпи с целия крак на стабилна пейка или стъпало.',
      'Изкачи се, като натискаш с горния крак – долният само помага малко.',
      'Коляното е над втория пръст, торсът е изправен.',
      'Слез контролирано назад.',
    ],
    en: [
      'Place the whole foot on a stable bench or step.',
      'Step up by driving through the top leg – the bottom leg barely helps.',
      'Knee over the second toe, torso tall.',
      'Step back down under control.',
    ],
    sources: [
      {
        text: 'ACE Exercise Library – Step-up',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/28/step-up/',
      },
      { text: 'ExRx.net – Dumbbell Step-up', url: 'https://exrx.net/WeightExercises/Quadriceps/DBStepUp' },
    ],
  },
  calf_raise: {
    bg: [
      'Застани с изправен торс и крака на ширина на таза; можеш да стъпиш с пръстите на стъпало.',
      'Повдигни петите максимално високо и задръж за момент.',
      'Спусни бавно, докато петите слязат под нивото на пръстите.',
    ],
    en: [
      'Stand tall, feet hip-width; you can stand with the balls of the feet on a step.',
      'Rise onto your toes as high as you can and hold briefly.',
      'Lower slowly until the heels drop below the toes.',
    ],
  },
  kb_gorilla_row: {
    bg: [
      'Две пудовки между стъпалата, широк разкрач, наведи се от таза с прав гръб и свити колене.',
      'Хвани двете дръжки и дърпай едната пудовка към кръста, докато другата натиска пода.',
      'Редувай страните, без да въртиш таза и раменете.',
    ],
    en: [
      'Two kettlebells between your feet, wide stance, hinge at the hips with a flat back and bent knees.',
      'Hold both handles and row one bell to your hip while the other presses into the floor.',
      'Alternate sides without twisting the hips or shoulders.',
    ],
  },
  kb_high_pull: {
    bg: [
      'Започни като при мах: наведи се от таза с прав гръб, пудовката е между краката.',
      'Изпъни рязко таза и дръпни пудовката към гърдите с лакът високо и встрани.',
      'Пудовката остава близо до тялото; върни я контролирано надолу.',
    ],
    en: [
      'Start like a swing: hinge with a flat back, the kettlebell between your legs.',
      'Snap the hips and pull the bell towards your chest, elbow high and out.',
      'Keep the bell close to the body and lower it under control.',
    ],
  },
  kb_one_arm_press: {
    bg: [
      'Пудовката е пред гърдите, отвън на предмишницата, китката е права.',
      'Стегни корема и седалището и избутай нагоре, докато ръката се изпъне.',
      'Спусни бавно обратно пред гърдите, лакътят е близо до тялото.',
    ],
    en: [
      'Hold the kettlebell at the chest, resting on the outside of the forearm, wrist straight.',
      'Brace the core and glutes and press up until the arm is straight.',
      'Lower slowly back to the chest, elbow close to the body.',
    ],
    sources: [
      { text: 'ExRx.net – Kettlebell Press', url: 'https://exrx.net/WeightExercises/Kettlebell/KBPress' },
      {
        text: 'ACE Exercise Library – Single-arm Overhead Press',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/395/single-arm-overhead-press/',
      },
    ],
  },
  kb_push_press: {
    bg: [
      'Пудовката (или две) е пред гърдите, стъпалата – на ширина на таза.',
      'Направи кратко сгъване в коленете с изправен торс.',
      'Изпъни рязко краката и с този тласък избутай пудовката над главата.',
      'Спусни контролирано обратно пред гърдите.',
    ],
    en: [
      'Hold the kettlebell (or two) at the chest, feet hip-width.',
      'Dip briefly at the knees with an upright torso.',
      'Drive the legs straight and use that drive to press the bell overhead.',
      'Lower under control back to the chest.',
    ],
    sources: [
      {
        text: 'ACE Exercise Library – Double Push Press',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/384/double-push-press/',
      },
      {
        text: 'ACE Exercise Library – Push Press',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/24/push-press/',
      },
    ],
  },
  kb_floor_press: {
    bg: [
      'Легни по гръб на пода със свити колене, пудовката е над гърдите, китката е права.',
      'Спусни, докато горната част на ръката докосне пода, лакътят е на около 45° от тялото.',
      'Избутай нагоре, докато ръката се изпъне.',
    ],
    en: [
      'Lie on your back on the floor, knees bent, the kettlebell over your chest, wrist straight.',
      'Lower until the upper arm touches the floor, elbow at about 45° from the body.',
      'Press up until the arm is straight.',
    ],
  },
  kb_floor_pullover: {
    bg: [
      'Легни по гръб, хвани пудовката с две ръце над гърдите, лактите са леко свити.',
      'Спусни я бавно зад главата, докато ръцете се изпънат назад, без да извиваш кръста.',
      'Върни я над гърдите със стягане на гърба и корема.',
    ],
    en: [
      'Lie on your back and hold the kettlebell with both hands over your chest, elbows slightly bent.',
      'Lower it slowly behind your head without arching the lower back.',
      'Bring it back over the chest by tightening the back and core.',
    ],
    sources: [
      { text: 'ExRx.net – Dumbbell Pullover', url: 'https://exrx.net/WeightExercises/PectoralSternal/DBPullover' },
    ],
  },
  kb_halo: {
    bg: [
      'Дръж пудовката за рогата пред гърдите, дъното е нагоре.',
      'Обиколи бавно главата с нея – покрай едното рамо, зад тила и обратно пред гърдите.',
      'Коремът и седалището са стегнати, тялото не се люлее; смени посоката.',
    ],
    en: [
      'Hold the kettlebell by the horns at your chest, bottom up.',
      'Slowly circle it around your head – past one shoulder, behind the head and back to the chest.',
      "Keep the core and glutes tight so the body doesn't sway; switch direction.",
    ],
    sources: [
      {
        text: 'ACE Exercise Library – Halo',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/394/halo/',
      },
    ],
  },
  russian_twist: {
    bg: [
      'Седни, свий коленете и наклони торса назад с прав гръб.',
      'Завърти раменете и ръцете (или пудовката) към едната страна, после към другата.',
      'Движението идва от торса, не само от ръцете; за по-трудно повдигни стъпалата.',
    ],
    en: [
      'Sit, bend your knees and lean back with a straight back.',
      'Rotate the shoulders and hands (or the kettlebell) to one side, then the other.',
      'The movement comes from the trunk, not just the arms; lift the feet to make it harder.',
    ],
  },
  kb_windmill: {
    bg: [
      'Вдигни пудовката над главата с изпъната ръка, стъпалата са широко и леко обърнати.',
      'Погледът е към пудовката; избутай таза настрани и се наведи към другия крак.',
      'Плъзни свободната ръка по крака надолу, ръката с пудовката остава вертикална.',
      'Изправи се бавно и смени страната.',
    ],
    en: [
      'Press the kettlebell overhead with a straight arm, feet wide and slightly turned.',
      'Eyes on the bell; push the hips out to the side and bend towards the other foot.',
      'Slide the free hand down the leg while the bell arm stays vertical.',
      'Stand up slowly and switch sides.',
    ],
    sources: [
      { text: 'ExRx.net – Kettlebell Windmill', url: 'https://exrx.net/WeightExercises/Kettlebell/KBWindmill' },
      {
        text: 'ACE Exercise Library – High Windmill',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/386/high-windmill/',
      },
    ],
  },
  kb_plank_pull_through: {
    bg: [
      'Застани в планк на изпънати ръце, пудовката е до едната ти ръка, малко зад нея.',
      'С другата ръка издърпай пудовката под тялото на другата страна.',
      'Тазът не се върти и не се повдига – тялото остава в права линия.',
      'Редувай страните.',
    ],
    en: [
      'Get into a high plank with the kettlebell just beside and behind one hand.',
      'Reach under with the other hand and drag the bell to the other side.',
      'Keep the hips from rotating or rising – the body stays in a straight line.',
      'Alternate sides.',
    ],
  },
  kb_suitcase_carry: {
    bg: [
      'Вдигни пудовката с една ръка, като при мъртва тяга, с прав гръб.',
      'Ходи бавно с изправен торс – не се накланяй към тежестта.',
      'Раменете са назад и надолу, коремът – стегнат; смени ръката.',
    ],
    en: [
      'Pick the kettlebell up in one hand like a deadlift, back flat.',
      "Walk slowly standing tall – don't lean towards the weight.",
      'Shoulders back and down, core braced; switch hands.',
    ],
    sources: [
      {
        text: 'ACE Exercise Library – Suitcase Carry',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/389/suitcase-carry/',
      },
    ],
  },
  kb_farmer_walk: {
    bg: [
      'Вдигни по една пудовка във всяка ръка с прав гръб.',
      'Ходи с къси, стабилни крачки, торсът е изправен.',
      'Раменете са назад и надолу, хватът е здрав, коремът – стегнат.',
    ],
    en: [
      'Pick up a kettlebell in each hand with a flat back.',
      'Walk with short, steady steps, torso tall.',
      'Shoulders back and down, firm grip, core braced.',
    ],
    sources: [
      { text: "ExRx.net – Kettlebell Farmer's Walk", url: 'https://exrx.net/WeightExercises/Kettlebell/KBFarmersWalk' },
      {
        text: "ACE Exercise Library – Farmer's Carry",
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/359/farmer-s-carry/',
      },
    ],
  },
  kb_turkish_get_up: {
    bg: [
      'Легни по гръб, избутай пудовката нагоре с една ръка; кракът от същата страна е свит.',
      'Погледът е към пудовката; надигни се на лакът, после на дланта.',
      'Повдигни таза, прибери другия крак под себе си на коляно и се изправи от напад.',
      'Върни се надолу по същия път, бавно; ръката с пудовката остава изпъната.',
    ],
    en: [
      'Lie on your back and press the kettlebell up with one arm; the same-side leg is bent.',
      'Eyes on the bell; come up onto the elbow, then the hand.',
      'Lift the hips, sweep the other leg under onto the knee and stand up from the lunge.',
      'Reverse the steps slowly; the bell arm stays straight.',
    ],
    sources: [
      {
        text: 'ExRx.net – Kettlebell Turkish Get-up',
        url: 'https://exrx.net/WeightExercises/Kettlebell/KBTurkishGetup',
      },
      {
        text: 'ACE Exercise Library – Turkish Get-up',
        url: 'https://www.acefitness.org/resources/everyone/exercise-library/388/turkish-get-up/',
      },
    ],
  },
  kb_clean: {
    bg: [
      'Започни като при мах с една ръка: пудовката е между краката, гърбът е прав.',
      'Изпъни рязко таза и дръпни пудовката близо до тялото.',
      'Завърти ръката под нея и я „хвани“ пред гърдите, отвън на предмишницата, без да удря китката.',
      'Върни я надолу между краката и повтори.',
    ],
    en: [
      'Start like a one-arm swing: the bell between your legs, back flat.',
      'Snap the hips and pull the bell up close to the body.',
      'Rotate the hand under it and catch it at the chest on the outside of the forearm, without it banging the wrist.',
      'Drop it back between the legs and repeat.',
    ],
    sources: [{ text: 'ExRx.net – Kettlebell Clean', url: 'https://exrx.net/WeightExercises/Kettlebell/KBClean' }],
  },
  kb_thruster: {
    bg: [
      'Дръж пудовката (или две) пред гърдите, стъпалата са на ширина на раменете.',
      'Клекни с прав гръб и гърди нагоре.',
      'Изправи се рязко и с този тласък избутай пудовката над главата в едно движение.',
      'Спусни я пред гърдите и започни следващия клек.',
    ],
    en: [
      'Hold the kettlebell (or two) at the chest, feet shoulder-width.',
      'Squat with a flat back and chest up.',
      'Stand up explosively and use that drive to press the bell overhead in one movement.',
      'Lower it to the chest and go straight into the next squat.',
    ],
  },
  kb_snatch: {
    bg: [
      'Започни като при мах с една ръка, гърбът е прав.',
      'Изпъни рязко таза и дръпни пудовката нагоре близо до тялото.',
      'Пъхни ръката под нея и я завърши над главата с изпъната ръка – без удар в предмишницата.',
      'Свали я контролирано между краката; учи го с лека тежест.',
    ],
    en: [
      'Start like a one-arm swing with a flat back.',
      'Snap the hips and pull the bell up close to the body.',
      'Punch the hand through and finish overhead with a straight arm – no bang on the forearm.',
      'Bring it back down between the legs under control; learn it with a light bell.',
    ],
    sources: [{ text: 'ExRx.net – Kettlebell Snatch', url: 'https://exrx.net/WeightExercises/Kettlebell/KBSnatch' }],
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
