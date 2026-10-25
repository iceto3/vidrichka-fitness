/**
 * Exercise library seed data — the ONE place to add or edit exercises.
 *
 * Fields:
 *  id         unique, stable id (never rename: workout history refers to it)
 *  name       { en, bg }
 *  equipment  barbell | dumbbell | machine | cable | bodyweight
 *  place      where it can be done: ['gym'] / ['home'] / ['gym','home']
 *  weighted   true = log weight (kg) + reps; false = reps only
 *  unit       'reps' (default) | 'perLeg' | 'sec' — what the reps counter means
 *  primary / secondary  muscle ids: glutes quads hamstrings calves back chest shoulders biceps triceps core
 *  rest       default rest in seconds
 *  met        MET value used for the calorie estimate
 *  fig        step-illustration type: thrust squat hinge lunge press pushup row pull raise curl plank bridge kick legcurl
 *  steps      three short captions for the step pictures
 *  tips       technique tips
 */

/** A Bulgarian text may be a `{ f, m }` gender variant (see core/i18n). @typedef {{en: string, bg: string | {f: string, m: string}}} Text */
/**
 * @typedef {object} Exercise
 * @property {string} id
 * @property {Text} name
 * @property {string} equipment
 * @property {string[]} place
 * @property {boolean} weighted
 * @property {'reps'|'perLeg'|'sec'} [unit]
 * @property {string[]} primary
 * @property {string[]} secondary
 * @property {number} rest
 * @property {number} met
 * @property {string} fig
 * @property {Text[]} steps
 * @property {Text[]} tips
 */

/** @type {Exercise[]} */
export const EXERCISES = [
  {
    id: 'hip_thrust',
    name: { en: 'Hip Thrust', bg: 'Хип тръст' },
    equipment: 'barbell',
    place: ['gym'],
    weighted: true,
    primary: ['glutes'],
    secondary: ['hamstrings', 'core'],
    rest: 90,
    met: 5,
    fig: 'thrust',
    steps: [
      { en: 'Set up on bench', bg: 'Гръб на пейката' },
      { en: 'Drive through heels', bg: 'Избутай с пети' },
      { en: 'Squeeze at top', bg: 'Стегни горе' },
    ],
    tips: [
      {
        en: 'Upper back on the bench edge, feet flat, shins vertical at the top.',
        bg: 'Горната част на гърба е на ръба на пейката, стъпалата са плътно на пода, а подбедриците – вертикални в горната позиция.',
      },
      {
        en: 'Tuck your chin and keep ribs down – move from the hips, not the lower back.',
        bg: 'Прибери брадичката и дръж ребрата долу – движението е от таза, не от кръста.',
      },
      {
        en: 'Pause 1 s at the top and squeeze your glutes hard.',
        bg: 'Задръж 1 секунда горе и стегни силно седалището.',
      },
    ],
  },
  {
    id: 'back_squat',
    name: { en: 'Back Squat', bg: 'Клек с щанга' },
    equipment: 'barbell',
    place: ['gym'],
    weighted: true,
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'core'],
    rest: 120,
    met: 6,
    fig: 'squat',
    steps: [
      { en: 'Bar on upper back', bg: 'Щангата на гърба' },
      { en: 'Sit down and back', bg: 'Седни назад' },
      { en: 'Stand up tall', bg: 'Изправи се' },
    ],
    tips: [
      {
        en: 'Feet shoulder-width, toes slightly out, brace your core before each rep.',
        bg: 'Стъпала на ширината на раменете, леко навън; стегни корема преди всяко повторение.',
      },
      {
        en: 'Knees track over toes; keep the whole foot on the floor.',
        bg: 'Коленете следват посоката на пръстите; цялото стъпало остава на пода.',
      },
      {
        en: 'Go as deep as you can with a neutral back.',
        bg: 'Слизай толкова дълбоко, колкото можеш с неутрален гръб.',
      },
    ],
  },
  {
    id: 'romanian_deadlift',
    name: { en: 'Romanian Deadlift', bg: 'Румънска тяга' },
    equipment: 'barbell',
    place: ['gym'],
    weighted: true,
    primary: ['hamstrings', 'glutes'],
    secondary: ['back', 'core'],
    rest: 90,
    met: 6,
    fig: 'hinge',
    steps: [
      { en: 'Stand tall, soft knees', bg: { f: 'Изправена, меки колене', m: 'Изправен, меки колене' } },
      { en: 'Hinge, bar close', bg: 'Наклон, щанга до краката' },
      { en: 'Hips forward', bg: 'Таза напред' },
    ],
    tips: [
      {
        en: 'Push your hips back like closing a door with your bum.',
        bg: 'Избутай таза назад, сякаш затваряш врата с дупето си.',
      },
      {
        en: 'Keep the bar touching your legs and your back flat.',
        bg: 'Щангата се плъзга по краката, а гърбът остава прав.',
      },
      {
        en: 'Stop when you feel a strong hamstring stretch.',
        bg: 'Спри, когато усетиш силно разтягане в задното бедро.',
      },
    ],
  },
  {
    id: 'bulgarian_split_squat',
    name: { en: 'Bulgarian Split Squat', bg: 'Български клек' },
    equipment: 'bodyweight',
    place: ['gym', 'home'],
    weighted: false,
    unit: 'perLeg',
    primary: ['glutes', 'quads'],
    secondary: ['hamstrings', 'core'],
    rest: 75,
    met: 5,
    fig: 'lunge',
    steps: [
      { en: 'Rear foot on bench', bg: 'Задният крак на пейка' },
      { en: 'Lower straight down', bg: 'Спусни се надолу' },
      { en: 'Drive up', bg: 'Избутай нагоре' },
    ],
    tips: [
      {
        en: 'Front foot far enough forward that the heel stays down.',
        bg: 'Предният крак е достатъчно напред, така че петата да не се отлепя.',
      },
      { en: 'A slight forward lean targets the glutes more.', bg: 'Лекият наклон напред натоварва повече седалището.' },
      { en: 'Hold dumbbells once 12 reps feel easy.', bg: 'Вземи дъмбели, когато 12 повторения станат лесни.' },
    ],
  },
  {
    id: 'leg_press',
    name: { en: 'Leg Press', bg: 'Лег преса' },
    equipment: 'machine',
    place: ['gym'],
    weighted: true,
    primary: ['quads'],
    secondary: ['glutes', 'hamstrings'],
    rest: 90,
    met: 5,
    fig: 'squat',
    steps: [
      { en: 'Feet mid-platform', bg: 'Стъпала в средата' },
      { en: 'Lower with control', bg: 'Спусни контролирано' },
      { en: 'Press, soft knees', bg: 'Избутай без заключване' },
    ],
    tips: [
      {
        en: 'Keep your lower back pressed into the pad the whole time.',
        bg: 'Кръстът остава долепен до облегалката през цялото време.',
      },
      {
        en: 'Higher foot position = more glutes, lower = more quads.',
        bg: 'По-високо стъпване = повече седалище, по-ниско = повече предно бедро.',
      },
      { en: 'Do not lock your knees at the top.', bg: 'Не заключвай коленете в горната позиция.' },
    ],
  },
  {
    id: 'lying_leg_curl',
    name: { en: 'Lying Leg Curl', bg: 'Сгъване за задно бедро' },
    equipment: 'machine',
    place: ['gym'],
    weighted: true,
    primary: ['hamstrings'],
    secondary: ['calves'],
    rest: 60,
    met: 4,
    fig: 'legcurl',
    steps: [
      { en: 'Pad above heels', bg: 'Валякът над петите' },
      { en: 'Curl up', bg: 'Сгъни нагоре' },
      { en: 'Lower slowly', bg: 'Спусни бавно' },
    ],
    tips: [
      { en: 'Keep hips pressed into the bench.', bg: 'Тазът остава притиснат към пейката.' },
      { en: 'Take 3 seconds on the way down.', bg: 'Спускай за около 3 секунди.' },
      { en: 'Point toes up for a stronger contraction.', bg: 'Насочи пръстите към себе си за по-силно свиване.' },
    ],
  },
  {
    id: 'cable_kickback',
    name: { en: 'Cable Glute Kickback', bg: 'Кикбек на скрипец' },
    equipment: 'cable',
    place: ['gym'],
    weighted: true,
    primary: ['glutes'],
    secondary: ['hamstrings'],
    rest: 60,
    met: 4,
    fig: 'kick',
    steps: [
      { en: 'Strap on ankle', bg: 'Маншет на глезена' },
      { en: 'Kick back and up', bg: 'Изрита назад' },
      { en: 'Return slowly', bg: 'Върни бавно' },
    ],
    tips: [
      {
        en: 'Hinge slightly forward and hold the machine for balance.',
        bg: 'Наведи се леко напред и се хвани за уреда за баланс.',
      },
      {
        en: 'Move only the hip – no arching of the lower back.',
        bg: 'Движи само тазобедрената става – без извиване в кръста.',
      },
      { en: 'Squeeze the glute at the end of every rep.', bg: 'Стегни седалището в края на всяко повторение.' },
    ],
  },
  {
    id: 'lat_pulldown',
    name: { en: 'Lat Pulldown', bg: 'Вертикален скрипец' },
    equipment: 'machine',
    place: ['gym'],
    weighted: true,
    primary: ['back'],
    secondary: ['biceps', 'shoulders'],
    rest: 90,
    met: 4.5,
    fig: 'pull',
    steps: [
      { en: 'Wide grip, chest up', bg: 'Широк хват, гърди напред' },
      { en: 'Pull to upper chest', bg: 'Дръпни към гърдите' },
      { en: 'Arms long again', bg: 'Изпъни ръцете' },
    ],
    tips: [
      {
        en: 'Lead with your elbows, pulling them down to your sides.',
        bg: 'Води с лактите – дърпай ги надолу към тялото.',
      },
      { en: 'Lean back only slightly, do not swing.', bg: 'Наклони се съвсем леко назад, без залюляване.' },
      {
        en: 'Let the shoulders rise at the top for a full stretch.',
        bg: 'Горе остави раменете да се повдигнат за пълно разтягане.',
      },
    ],
  },
  {
    id: 'seated_cable_row',
    name: { en: 'Seated Cable Row', bg: 'Хоризонтален скрипец' },
    equipment: 'cable',
    place: ['gym'],
    weighted: true,
    primary: ['back'],
    secondary: ['biceps', 'shoulders'],
    rest: 90,
    met: 4.5,
    fig: 'row',
    steps: [
      { en: 'Sit tall, arms long', bg: 'Изправен гръб' },
      { en: 'Row to belly', bg: 'Дръпни към корема' },
      { en: 'Squeeze shoulder blades', bg: 'Събери лопатките' },
    ],
    tips: [
      {
        en: 'Keep your torso still – the arms and back do the work.',
        bg: 'Торсът остава неподвижен – работят ръцете и гърбът.',
      },
      { en: 'Pull your shoulder blades together at the end.', bg: 'В края събери лопатките една към друга.' },
      { en: 'Control the weight on the way back.', bg: 'Контролирай тежестта при връщането.' },
    ],
  },
  {
    id: 'db_bench_press',
    name: { en: 'Dumbbell Bench Press', bg: 'Избутване с дъмбели от лег' },
    equipment: 'dumbbell',
    place: ['gym'],
    weighted: true,
    primary: ['chest'],
    secondary: ['triceps', 'shoulders'],
    rest: 90,
    met: 5,
    fig: 'press',
    steps: [
      { en: 'Lie, dumbbells up', bg: 'Легни, дъмбели горе' },
      { en: 'Lower to chest', bg: 'Спусни до гърдите' },
      { en: 'Press up', bg: 'Избутай нагоре' },
    ],
    tips: [
      {
        en: 'Feet planted, shoulder blades squeezed into the bench.',
        bg: 'Стъпалата са стабилно на пода, лопатките – прибрани към пейката.',
      },
      { en: 'Elbows about 45° from your body.', bg: 'Лактите са на около 45° от тялото.' },
      { en: 'Lower slowly, press up powerfully.', bg: 'Спускай бавно, избутвай мощно.' },
    ],
  },
  {
    id: 'db_shoulder_press',
    name: { en: 'Dumbbell Shoulder Press', bg: 'Раменна преса с дъмбели' },
    equipment: 'dumbbell',
    place: ['gym', 'home'],
    weighted: true,
    primary: ['shoulders'],
    secondary: ['triceps', 'core'],
    rest: 90,
    met: 5,
    fig: 'overhead',
    steps: [
      { en: 'Dumbbells at shoulders', bg: 'Дъмбели при раменете' },
      { en: 'Press overhead', bg: 'Избутай над глава' },
      { en: 'Lower with control', bg: 'Спусни контролирано' },
    ],
    tips: [
      { en: 'Brace your core and avoid leaning back.', bg: 'Стегни корема и не се накланяй назад.' },
      { en: 'Press up and slightly inward.', bg: 'Избутвай нагоре и леко навътре.' },
      { en: 'Stop just before locking out the elbows.', bg: 'Спри малко преди пълното изпъване на лактите.' },
    ],
  },
  {
    id: 'lateral_raise',
    name: { en: 'Lateral Raise', bg: 'Странично раменно повдигане' },
    equipment: 'dumbbell',
    place: ['gym', 'home'],
    weighted: true,
    primary: ['shoulders'],
    secondary: [],
    rest: 60,
    met: 3.5,
    fig: 'raise',
    steps: [
      { en: 'Arms by sides', bg: 'Ръце до тялото' },
      { en: 'Raise to shoulder height', bg: 'Вдигни до раменете' },
      { en: 'Lower slowly', bg: 'Спусни бавно' },
    ],
    tips: [
      { en: 'Light weights and a slight bend in the elbows.', bg: 'Леки тежести и леко свити лакти.' },
      { en: 'Lead with the elbows, not the hands.', bg: 'Води с лактите, не с китките.' },
      { en: 'No shrugging – keep the neck relaxed.', bg: 'Не повдигай рамене – вратът е отпуснат.' },
    ],
  },
  {
    id: 'biceps_curl',
    name: { en: 'Dumbbell Biceps Curl', bg: 'Бицепсово сгъване с дъмбели' },
    equipment: 'dumbbell',
    place: ['gym', 'home'],
    weighted: true,
    primary: ['biceps'],
    secondary: [],
    rest: 60,
    met: 3.5,
    fig: 'curl',
    steps: [
      { en: 'Arms straight', bg: 'Изпънати ръце' },
      { en: 'Curl up', bg: 'Сгъни нагоре' },
      { en: 'Lower slowly', bg: 'Спусни бавно' },
    ],
    tips: [
      { en: 'Elbows stay pinned to your sides.', bg: 'Лактите остават прилепнали до тялото.' },
      { en: 'No swinging – use a weight you can control.', bg: 'Без залюляване – избери тежест, която контролираш.' },
      { en: 'Turn the palms up as you lift.', bg: 'Завъртай дланите нагоре при повдигането.' },
    ],
  },
  {
    id: 'triceps_pushdown',
    name: { en: 'Triceps Pushdown', bg: 'Разгъване за трицепс на скрипец' },
    equipment: 'cable',
    place: ['gym'],
    weighted: true,
    primary: ['triceps'],
    secondary: [],
    rest: 60,
    met: 3.5,
    fig: 'curl',
    steps: [
      { en: 'Elbows at sides', bg: 'Лакти до тялото' },
      { en: 'Push down', bg: 'Избутай надолу' },
      { en: 'Let it rise slowly', bg: 'Върни бавно' },
    ],
    tips: [
      { en: 'Keep elbows fixed; only the forearms move.', bg: 'Лактите са фиксирани; движат се само предмишниците.' },
      { en: 'Fully straighten the arms at the bottom.', bg: 'Изпъни напълно ръцете долу.' },
      {
        en: 'Stand tall with a slight forward lean.',
        bg: { f: 'Стой изправена с лек наклон напред.', m: 'Стой изправен с лек наклон напред.' },
      },
    ],
  },
  {
    id: 'push_up',
    name: { en: 'Push-up', bg: 'Лицеви опори' },
    equipment: 'bodyweight',
    place: ['gym', 'home'],
    weighted: false,
    primary: ['chest'],
    secondary: ['triceps', 'shoulders', 'core'],
    rest: 60,
    met: 4,
    fig: 'pushup',
    steps: [
      { en: 'Plank position', bg: 'Позиция планк' },
      { en: 'Lower chest', bg: 'Спусни гърдите' },
      { en: 'Push away', bg: 'Избутай се' },
    ],
    tips: [
      { en: 'Body in one straight line from head to heels.', bg: 'Тялото е в една права линия от главата до петите.' },
      {
        en: 'Start on your knees or an elevated surface if needed.',
        bg: 'Ако е нужно, започни на колене или с ръце на повдигната повърхност.',
      },
      { en: 'Hands slightly wider than shoulders.', bg: 'Ръцете са малко по-широко от раменете.' },
    ],
  },
  {
    id: 'glute_bridge',
    name: { en: 'Glute Bridge', bg: 'Глутеус мост' },
    equipment: 'bodyweight',
    place: ['home', 'gym'],
    weighted: false,
    primary: ['glutes'],
    secondary: ['hamstrings', 'core'],
    rest: 45,
    met: 3.5,
    fig: 'bridge',
    steps: [
      { en: 'Lie, knees bent', bg: 'Легни, свити колене' },
      { en: 'Lift hips', bg: 'Повдигни таза' },
      { en: 'Squeeze and lower', bg: 'Стегни и спусни' },
    ],
    tips: [
      { en: 'Heels close to your bum, push through them.', bg: 'Петите са близо до седалището – избутвай през тях.' },
      { en: 'Stop when hips, knees and shoulders line up.', bg: 'Спри, когато таз, колене и рамене са на една линия.' },
      { en: 'Hold 2 s at the top for extra burn.', bg: 'Задръж 2 секунди горе за повече натоварване.' },
    ],
  },
  {
    id: 'bodyweight_squat',
    name: { en: 'Bodyweight Squat', bg: 'Клек със собствено тегло' },
    equipment: 'bodyweight',
    place: ['home', 'gym'],
    weighted: false,
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'core'],
    rest: 45,
    met: 5,
    fig: 'squat',
    steps: [
      { en: 'Feet shoulder-width', bg: 'Стъпала на ширина на раменете' },
      { en: 'Sit back and down', bg: 'Седни назад' },
      { en: 'Stand up', bg: 'Изправи се' },
    ],
    tips: [
      { en: 'Arms forward for balance, chest up.', bg: 'Ръцете напред за баланс, гърдите – изправени.' },
      { en: 'Knees follow your toes.', bg: 'Коленете следват пръстите на краката.' },
      { en: 'Control the descent – about 2 seconds down.', bg: 'Контролирай спускането – около 2 секунди надолу.' },
    ],
  },
  {
    id: 'reverse_lunge',
    name: { en: 'Reverse Lunge', bg: 'Обратен напад' },
    equipment: 'bodyweight',
    place: ['home', 'gym'],
    weighted: false,
    unit: 'perLeg',
    primary: ['glutes', 'quads'],
    secondary: ['hamstrings', 'core'],
    rest: 45,
    met: 5,
    fig: 'lunge',
    steps: [
      { en: 'Stand tall', bg: 'Изправена стойка' },
      { en: 'Step back, lower', bg: 'Крачка назад и надолу' },
      { en: 'Return to standing', bg: 'Върни се горе' },
    ],
    tips: [
      {
        en: 'Take a long step back and drop the back knee.',
        bg: 'Направи дълга крачка назад и спусни задното коляно.',
      },
      { en: 'Push through the front heel to stand up.', bg: 'Изправи се, като избутваш през петата на предния крак.' },
      { en: 'Keep your torso upright.', bg: 'Дръж торса изправен.' },
    ],
  },
  {
    id: 'plank',
    name: { en: 'Plank', bg: 'Планк' },
    equipment: 'bodyweight',
    place: ['home', 'gym'],
    weighted: false,
    unit: 'sec',
    primary: ['core'],
    secondary: ['shoulders', 'glutes'],
    rest: 45,
    met: 3.8,
    fig: 'plank',
    steps: [
      { en: 'Forearms down', bg: 'Опора на предмишници' },
      { en: 'Lift into a line', bg: 'Повдигни тялото' },
      { en: 'Hold and breathe', bg: 'Задръж и дишай' },
    ],
    tips: [
      { en: 'Squeeze glutes and pull belly button in.', bg: 'Стегни седалището и прибери пъпа навътре.' },
      { en: 'Do not let the hips sag or pike up.', bg: 'Не позволявай на таза да пропадне или да се вдигне.' },
      { en: 'Breathe calmly – quality over time.', bg: 'Дишай спокойно – качеството е по-важно от времето.' },
    ],
  },
  {
    id: 'dead_bug',
    name: { en: 'Dead Bug', bg: 'Мъртва буболечка' },
    equipment: 'bodyweight',
    place: ['home', 'gym'],
    weighted: false,
    unit: 'perLeg',
    primary: ['core'],
    secondary: [],
    rest: 45,
    met: 3.5,
    fig: 'bridge',
    steps: [
      { en: 'Lie, limbs up', bg: 'Легни, крайници горе' },
      { en: 'Extend opposite arm & leg', bg: 'Изпъни ръка и крак' },
      { en: 'Switch sides', bg: 'Смени страната' },
    ],
    tips: [
      {
        en: 'Press your lower back into the floor the whole time.',
        bg: 'Кръстът остава притиснат към пода през цялото време.',
      },
      { en: 'Move slowly and exhale as you extend.', bg: 'Движи се бавно и издишвай при изпъването.' },
      {
        en: 'Only go as low as you can keep your back flat.',
        bg: 'Спускай само докъдето гърбът остава плътно на пода.',
      },
    ],
  },
];

/** Muscle groups used by the library filter (group id -> muscle ids). */
export const MUSCLE_GROUPS = {
  glutes: ['glutes'],
  legs: ['quads', 'hamstrings', 'calves'],
  back: ['back'],
  chest: ['chest'],
  shoulders: ['shoulders'],
  arms: ['biceps', 'triceps'],
  core: ['core'],
};
