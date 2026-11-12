# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.6.3] – 2026-11-12

### Added

- **Free workout („Започни празна тренировка“)** in Тренировки (Ralitsa feedback #8): opens the usual logger with no exercises and an „Добави упражнение“ button that opens the full library picker (search + filters). Exercises can be added or removed while the workout is in progress; sets, reps and kg are logged as usual. Finishing saves it to history like any plan workout (calendar, XP, streaks). After finishing, optional „Запази като план“ (exercises / sets / reps / kg as logged; no days until she assigns them). An empty workout (no done set) is never saved. The running workout is kept in `kv active`, so it survives a reload like a plan workout. Library and picker search by Bulgarian or English name (`library.search`).
- **Four gym machines** (Ralitsa feedback #9) with equipment `machine`, kg (Profile step), coach cues, technique text and muscles; YouTube technique search (no illustrations): `leg_extension` „Разгъване за предно бедро“, `seated_ab_crunch` „Коремни преси на уред“, `hip_abductor` „Абдуктор на уред“, `hip_adductor` „Аддуктор на уред“. The „Уред“ filter lists them with the existing machines (including `lying_leg_curl`). Single-leg hip thrust was already in 1.6.0. New muscle tag `adductors` („Вътрешно бедро“) for the adductor machine.
- **Coach cues („Съвети от треньора“)** for the illustrated library exercises that had a verified technique card but no short cues – including `lying_leg_curl` „Сгъване за задно бедро“, plus hip thrust, Romanian deadlift, leg press, cable kickback, lat pulldown, seated cable row, dumbbell bench press, biceps curl, triceps pushdown, push-up, glute bridge, bodyweight squat, plank and dead bug; and text cues (the coach's video is kept) for back squat, reverse lunge, lateral raise, dumbbell shoulder press and Bulgarian split squat. Shown above the detailed technique. Every exercise in the library now has cues in bg + en.
- What's new entry for 1.6.3 (bg + en). Unit tests `tests/unit/v163.test.js`; e2e flow `tests/e2e/v163.mjs` (also `--flow v163`).

### Fixed

- **Free-workout picker filters:** leftover search or chips from the Exercises tab no longer hide rows when adding an exercise. Opening „Добави упражнение“ resets the filters, so she can pick with „Уред“ (or another chip) alone, without typing in the search.

## [1.6.2] – 2026-11-11

### Fixed (beta tester round on 1.6.1-beta)

- **Exercises header count follows the filters:** „40 от 62 упражнения“ with „Пудовка“ (was always the library total, 62); plural-aware `library.count`, new `library.countOf`.
- **Supplement streak visible from day 1:** 1.6.1 showed „🔥 N дни подред“ only for N > 1 and only on today. Each row (creatine too) now has a streak line counted up to the shown day, „🔥 0 дни подред“ before the first tick.
- **Every measurement tile opens a sheet with a field and „Запази“:** a tile tap only showed the chart and history, so a measurement with no value yet (e.g. the women's „Седалище“) opened an empty sheet. Every tile's sheet now has a quick entry for its field(s) (both sides of a pair), with the where-to-measure cue and inline errors (`body/fields.measureRow`, `body/views/body.chartHtml`). Saved values stay when the gender changes (a tile with a value stays visible).
- **Added weight in 1 kg steps:** the kg ± always used the Profile step (2.5 kg) – in 1.6.0 the 4 kg came pre-filled from the home plan, so after a session ending at 0 kg „+“ gave 2.5 / 5. Bodyweight exercises with an optional added weight now step by 1 kg (active workout, plan editor, the „Опитай +кг“ hint; `workouts/logic.kgStep`); weighted exercises keep the Profile step; typing keeps 0.25 kg resolution.
- What's new entry for 1.6.2 (bg + en). Unit tests `tests/unit/v162.test.js`; e2e checks in `tests/e2e/v160.mjs` / `v161.mjs`.

## [1.6.1] – 2026-11-11

### Added

- **Every kettlebell exercise („Пудовка“)** – 26 new exercises (stable ids): `kb_one_arm_swing`, `kb_sumo_deadlift`, `kb_good_morning`, `kb_goblet_squat`, `kb_sumo_squat`, `walking_lunge`, `lateral_lunge`, `curtsy_lunge`, `step_up`, `calf_raise`, `kb_gorilla_row`, `kb_high_pull`, `kb_one_arm_press`, `kb_push_press`, `kb_floor_press`, `kb_floor_pullover`, `kb_halo`, `russian_twist`, `kb_windmill`, `kb_plank_pull_through`, `kb_suitcase_carry`, `kb_farmer_walk`, `kb_turkish_get_up`, `kb_clean`, `kb_thruster`, `kb_snatch` (62 in the library). Library exercises that work with a kettlebell got `alt: ['kettlebell']` instead of a duplicate (Romanian deadlift, single-leg RDL, glute bridge, hip thrust, reverse lunge, Bulgarian split squat, one-arm row, biceps curl, hammer curl, lying French press, lateral raise, dead bug – dead bug also gets the optional kg); the „Пудовка“ filter lists 40 and the exercise page shows „Дъмбели / Пудовка“. No illustrations yet (user decision): coach cues in bg + en, with sources (ExRx, ACE) only where a page was checked.
- **„Хранителни добавки“ in Храна** (`src/data/supplements.js`, `features/food/supps*.js`, `food/views/supps.js`) replaces the 1.4.2 creatine card; creatine is its first row with the day's creatine total as before. Ready supplements with one tap: protein powder, vitamin D, omega-3, magnesium, vitamin C, iron, zinc, multivitamin; own supplements with a unit (г, мг, IU, капс.). Each remembers its last dose; one-tap „Взех“ ticks today with it (✎ for another dose, the day's removal with „Отмени“, a removal from the list keeps the history); a consecutive-day streak. Protein powder counts toward the day's protein (`suppP` on the day record: day totals, Храна's protein bar, the protein goal / quests) – protein only, no kcal. Optional daily reminder at a chosen time, planned by the existing on-phone reminder path (in-app, Notification Triggers, the service worker); local-only even with push on, so the push Worker is unchanged.
- **Body measurements by gender** (`MEASURE_SETS`, `features/body/fields*.js`): the profile's gender sets the default set – common тегло, талия, ханш, гърди, бедро, прасец, мишница; men add бицепс в сгъвка, рамене, врат, предмишница; women add подгръдна обиколка, седалище, горна част на бедрото. „Избери“ in Прогрес › Тяло hides / shows / adds any measurement (also from the other set; kv `measureTiles`); the own choice is kept when the gender changes; „Върни по подразбиране“. Each measurement has a short Bulgarian where-to-measure cue (text, no pictures).
- What's new entry for 1.6.1 (bg + en). Unit tests `tests/unit/v161.test.js`; e2e flow `tests/e2e/v161.mjs` at 360 px (also alone with `--flow v161`).

### Changed

- Creatine data is not moved: the day field `creatineG` and kv `creatineDose` stay the source, so history, totals and streaks continue. The creatine sheet's actions are now `suppG` / `suppSave` / `suppClear`.
- Existing users keep every measurement that already has a value visible (belly, body fat …). Labels: „Мишници Л / Д“, „Подгръдна обиколка“; the hips cue says „ханша и седалището“. No stored values change.

## [1.6.0] – 2026-11-11

### Added

- **Optional added weight** on bodyweight exercises (`optionalWeight` in `src/data/exercises.js`): Bulgarian split squat, reverse lunge, push-up, glute bridge, bodyweight squat and the new knee push-up, single-leg hip thrust and single-leg Romanian deadlift show the kg stepper in the workout and the weight field in the plan editor. 0 kg = bodyweight; no separate weighted variants (e.g. Bulgarian split squat: set 1 at 0 kg, sets 2–3 at 4 kg). The added kilos count for the volume and the records (kilos first, then reps – 4 kg beats bodyweight); the "last time" hint, the history and the Progress chart show kilos once some weight was used, else reps as before (`workouts/logic.logsKg`, `byKg`). Already weighted exercises are unchanged; plank and dead bug stay reps / seconds only.
- **Equipment `kettlebell` (Пудовка) and `band` (Ластик)** with labels (bg + en), icons, and an equipment filter row in the exercise library (all / barbell / dumbbells / kettlebell / band / machine / cable / bodyweight). New reps unit `perSide` („Повт./страна“) for one-arm / one-side work.
- **16 new exercises** (stable ids): `kb_swing`, `band_lateral_walk`, `knee_push_up`, `db_bent_over_row`, `one_arm_db_row`, `lying_db_french_press`, `cross_body_crunch`, `single_leg_hip_thrust`, `single_leg_rdl`, `band_glute_kickback`, `band_abductor_kick`, `barbell_row`, `front_raise`, `overhead_triceps_extension`, `hammer_curl`, `kb_knee_tuck_situp` (36 in the library). They have no verified technique card / illustration yet: the exercise page and the in-workout technique sheet show the coach's short cues instead (`src/data/cues.js`, bg + en, „Съвети от треньора“) and the list / workout show the equipment icon as thumbnail – a missing card or drawing never breaks a view. Where the coach's program links a video, „Виж видеото на треньора“ opens it instead of the YouTube search (each link checked against its video title; the abductor-kick link in the program pointed to the single-leg RDL video and was left out; the kettlebell swing has none). The coach's videos are also linked for back squat, reverse lunge, lateral raise, shoulder press and Bulgarian split squat. Back squat can be done at home too.
- **Two built-in home plans** „Ден 1 цяло тяло“ / „Day 1 Full Body“ and „Ден 2 цяло тяло“ / „Day 2 Full Body“ („В домашни условия“), 11 exercises each in the coach's order with the starting weights from the program; rest 90 s (back squat 120 s). Scheduled on Tuesday and Friday – free days next to the example plans, with more than 24 h of rest between them. Existing installs get them once (a deleted one is not re-added); the three example plans stay.
- What's new entry for 1.6.0 (bg + en). Unit tests `tests/unit/v160.test.js`; e2e flow `tests/e2e/v160.mjs` at 360 px (also alone with `--flow v160`).

## [1.5.1] – 2026-11-11

### Added

- **Saturated fat and sugar** (g / 100 g, keys `sat` and `sug`): optional, like fiber and salt – empty means unknown („–“), never 0. In the new-food, edit and fill-in forms (sugar after carbs, saturated fat after fat; saturated fat can't be more than the fat, sugar not more than the carbs), read from Open Food Facts (`saturated-fat_100g`, `sugars_100g`; an impossible value is dropped, the product is kept), scaled with the grams (`portion`, `scaleRow`), shown in the add and item sheets („Наситени мазнини · Захар“ under fiber / salt), in the item line („зх“ after carbs, „нм“ after fat, only when the food lists them) and its ⓘ legend, in Храна's day totals and in the day's meals card (Начало / calendar day, once something logged lists them). Old diary rows and foods are not rewritten: they simply have no value (unknown).
- **Foods sheet** (`docs/foods.csv`, `tools/export-foods.mjs`): new columns `sat_fat` and `sugar` at the end (`creatine_mg` stays where it was). Herring (Херинга, сурова, since 1.4.2 with creatine 650 mg) gets saturated fat 2 g and sugar 0 g from its source (USDA SR 15039, FDC 175116); every other food is left empty – no sourced value yet (`SAT_SUGAR` in `src/data/foods.js`). Changes vs 1.5.0 in `docs/foods-changes-1.5.1.csv`.
- **Начало shows everything tracked except body measurements:** the mood / energy card and the water card (the calendar day view's cards and sheets) between „Сън снощи“ and „Хранене днес“.
- **Прогрес › Сън „Часове сън“ (last 14 nights):** every bar is a button that opens that night's sleep editor (`openSleepSheet`), so a bedtime / wake-up can be entered or corrected and empty nights filled in. Same rules as the day view: the 16 h cap, and on any day a wake-up after a logged breakfast is refused („Закуската е записана в … – ставането трябва да е преди това“).
- What's new entry for 1.5.1 (bg + en). Unit tests `tests/unit/v151.test.js`; e2e flow `tests/e2e/v151.mjs` at 360 px (also alone with `--flow v151`).

### Changed (beta tester round – user decision)

- **One clock per meal.** Each meal (breakfast, lunch, snacks, dinner and unplanned meals) has one clock, in its meal sheet (Храна / Начало › tap the meal): typed 24 h or ±5 min, checked like „Кога яде?“ (not in the future, not before the wake-up). A change is saved with „Запази часа“ or when the sheet is closed (not on every ±5 tap) and moves every food of the meal (`daily/api.setMealClock`; today's graded protein breakfast re-grades as before). The foods have no time of their own: the „Час“ field is gone from the item editor and the food rows show no time. The meal rows show the meal's time (`food/logic.mealHM` – the earliest entry; older data with mixed times is left as it is until the clock is changed). A new food takes the meal's time and an item moved to another meal takes that meal's time, as in 1.5.0. What's new 1.5.1 +1 item; the 1.4.4 / 1.5.0 notes no longer mention a food's own time.

### Fixed

- **Tester (1.5.1-beta-3adc2268e9):** changing one lunch item's time left the other item showing its old time – the item editor closed without re-rendering the meal sheet under it. Gone with the per-item time; the meal sheet now re-renders after every item change.
- Two 1.4.4 unit tests used a fixed date and failed from the next day on; they now use today.

## [1.5.0] – 2026-11-10

### Added

- **„Добави хранене“** (Начало › Хранения днес and Храна › Хранения): logs an unplanned meal. It gets its own meal id (`x_<base36 time>`, `food/logic.isExtra`), so several can exist in a day. The time comes from the add page's clock (default now; not in the future, not before the wake-up) and gives the name: between breakfast and lunch „Междинно сутрешно“, between lunch and dinner „Междинно следобедно“, before breakfast or after dinner „Допълнително хранене“ (the planned meals count at their logged time, else at their usual time 08:00 / 13:00 / 19:00 – `extraKind`). It is listed among the planned meals by time (`mealsWithExtras`). Unplanned meals give no XP of their own (no meal quest, not a food-streak day – `motivation/stats`); they add to the day's kcal / protein / nutrient totals and charts, and their protein counts for the daily protein goal (the goal shows the same protein as the total and can be completed by them, with the protein goal's normal 15 XP).
- **A clock on the add-food page** (24 h, ±5 min, typed like „Кога яде?“): the time of the whole meal. Default: the meal's time when it already has food, else now (a past day: the usual time). Never in the future, never before the day's wake-up (− stops there). Applied when food is added and when the page is left.
- **Steps:** a slider that snaps every 500 steps (range: twice the goal, more when the day has more) plus −100, −50, +50, +100. +1000 / +2000 are gone. Steps never go below 0 (`steps/logic.clampDelta`; `addSteps` takes negative changes).
- What's new entry for 1.5.0 (bg + en). Unit tests `tests/unit/v150.test.js`; e2e flow `tests/e2e/v150.mjs` at 360 px (also alone with `--flow v150`).

### Changed

- **One time per meal** (breakfast, lunch, snacks, dinner, unplanned): a new entry takes the meal's time (`food/logic.mealTimeOf` – the earliest entry; older data with several times keeps them until a time is changed), an entry moved into another meal takes that meal's time, and „Час“ in the item editor moves every entry of the meal (`daily/api.setMealClock`). Today's graded protein breakfast still goes through the „Кога яде?“ save (re-graded, one result toast, no double XP).
- **„Кога яде?“ and the clock:** a breakfast saved with an earlier time on the clock is graded by that time (like a time typed from the pill) and „Кога яде?“ is not asked; left at „now“ and late, „Кога яде?“ is asked as in 1.4.4.
- **Current meal without breakfast:** from 04:00 until the first enabled meal starts, the current meal is the next one (e.g. lunch at 09:00), not the afternoon snack. The small hours (before 04:00) are unchanged.
- **Live kcal:** the add and edit sheets update kcal and the macros while the amount is typed (not only on blur); the field keeps what is typed.

### Fixed

- **„Въведи“** (and „От снимка“) on the steps card never wrap their text at 360 px.

## [1.4.4] – 2026-11-10

### Added

- **Favorites (☆):** every food row in the add screen (search results, category sheets) has a star. Starred foods are kept on the device (`kv('foodFav')`, manual only – never from usage). The new first tile **Любими** opens one list with the saved combinations (tap = add the combination to the meal) and the starred foods.
- **Most used by points:** each time a food is added it gets 1 point (no 30-day window). After 14 days without being added its points halve, then halve again every further 2 weeks; adding it again continues from what is left. Ties go to the most recently added. Old `foodUse` entries (`{n, ts}`) start with their count as points – no migration. Food lists are shown as favorites → faint divider → the 5 most used → faint divider → the rest (`food/usage.js`, pure). The category tiles and Бърз избор follow the same points.
- **Ръчно добавени храни:** a category tile (shown once there is one) with the user's own foods, newest first, in the same grouped order. ✎ edits a food: name, kcal, protein, carbs, fat, fiber, salt, usual portion and (new) creatine in g / 100 g. Diary rows are copies, so past days keep the values they were logged with; changing the grams of an old row scales it from the row itself when the food was edited since (`logic.matchesFood`). Built-in foods can't be edited or deleted. A new manual food is saved right away (it is in the list even if it is never added to the diary).
- **Delete foods:** „Изтрий храни“ in that sheet switches to check boxes and „Изтрий (N)“ → a confirmation → Recently deleted with the usual Undo pill (one pill for the batch, kind `customFood`, 7 days). The edit form has a single „Изтрий храната“ too. Undo brings back the foods and their ☆.
- **Package photo:** „Снимай опаковката отпред“ in the new-food and edit forms (camera or gallery). It is shrunk to ≤ 320 px JPEG (≈20–40 KB) and stored with the food on the device only – never sent (the anonymous food sharing still sends name and per-100 g values only), and it does not use the label-reading limit. Shown as a small thumbnail in food lists; change or remove it in the edit form. Only our own image data URLs are ever rendered.
- **„Кога яде?“ after a late breakfast:** when the protein breakfast is logged after its 30-minute window (and no time was typed from the pill / banner), a sheet asks once a day: „Сега (HH:MM)“ keeps the logged time; „По-рано“ opens a 24-hour picker (±5 min; not later than now, not before the countdown started) with a live preview – „Навреме ✓ · +15 XP“, „+N мин · +8 XP“ or „+N мин · пропуснато“. „Готово“ stores the actual time in `mealTimes.breakfast.actual` (planned stays), moves that logging's breakfast rows to the time, and Хранене навреме and the graded protein quest XP follow; rewards re-grade the quest entry (no double pay). Closing the sheet = „Сега“. Works for any way the breakfast is logged (search, category, combination, voice).
- What's new entry for 1.4.4 (bg + en). Unit tests in `tests/unit/v144.test.js` and `tests/unit/v144-whenate.test.js`; e2e flow `tests/e2e/v144.mjs` (also runnable alone with `--flow v144`).

### Fixed (beta tester)

- **The protein-breakfast toast waits for „Кога яде?“** and shows the final grade: on time „Протеинова закуска ✓ · До 30 минути – перфектно начало!“, late „Протеинова закуска ✓ · +N мин след прозореца · +8 XP“, missed (no ✓) „Закуската е записана · Този път след прозореца – утре пак ще успееш!“. Without the question (on time, a time typed from the pill, a breakfast saved before the wake-up) it comes at once, by the same grade – so a meal far past the window never says „пак се брои“. The `protein:done` event (push: stops the server reminders) is still sent when the breakfast is saved; the toast listens to the new `protein:graded`.
- **No green „готова“ banner for a missed window:** Home shows a grey „Протеиновата закуска е записана · пропуснат прозорец“ (`proteinBar` mode `missed`); late within the limit (8 XP) stays green. The morning screen's card does the same and shows the time she ate (not when it was logged).

### Changed (beta tester, option A)

- **„Час“ in the item editor:** the subtitle „HH:MM · Промени“ is now an editable 24-hour time field (typed like „Кога яде?“, ±5 min), checked once changed: not later than now and not before that day's wake-up (otherwise „Храненето не може да е преди ставането…“ and Запази is disabled). A breakfast moves as one meal – every breakfast entry of that day gets the time. For today's graded protein breakfast the change goes through the „Кога яде?“ save (`setMealActual`, all entries), so Хранене навреме, the Home / morning banner (green / grey), the quest XP (re-graded, no double pay) and the result toast follow; the toast comes after the change, by the final grade. Other meals move only that entry (`daily/api.setFoodTime`).
- **A meal can never be before the wake-up:** the „Кога яде?“ / „Изядох в…“ pickers start at the wake-up (− stops there). A wake-up later than an already logged breakfast is refused – in the sleep editor inline (Готово disabled) and on the morning tap as a toast: „Закуската е записана в HH:MM – ставането трябва да е преди това“ (en: „Breakfast is logged at HH:MM – the wake-up has to be before that“). The old „a breakfast before the wake-up counts as on time“ rule is gone; a breakfast logged before the wake-up was entered still counts normally once the (earlier or same-minute) wake-up is entered. The wake-up already stored for a day is never refused, so older data with a breakfast before the wake-up stays editable and is graded as on time (clamped to the start, as before) – nothing is rewritten.
- Removed the unused „Малко късно, но пак се брои!“ string. What's new has a 1.4.4 item for the time field. Unit tests in `tests/unit/v144-time.test.js`.

## [1.4.3] – 2026-11-04

### Added

- **Meal-reminder pill:** while the breakfast countdown runs (the brown Начало banner), a small pill in the banner's colours floats just above the bottom nav on every tab except Начало. It shows the meal and the same countdown (`pendingMeal` reuses `proteinBar`, no second timer logic) and turns dark red when the time is up. Tapping it opens a bottom sheet with **Изядох** / **Пропуснах**, which run the banner's own actions (`daily/views/mealsheet.js`, shared by both). Scrolling down shrinks it to a clock circle; scrolling up (or back at the top) expands it. It is hidden when nothing is pending, once the meal is answered, during a workout, on pages without the nav and on the breakfast logger itself. It sits left (the „Отмени“ pill is right), respects the safe-area insets, and while it shows the page gets extra room at the bottom so it never covers content or the nav.
- **Meal timing:** **Изядох** after the 30-minute window (banner or pill) first asks **Кога яде?** with a time picker (default now; future times and times before the countdown are refused inline). Saving the breakfast stores `mealTimes.breakfast = {planned, actual}` on the day (planned = end of the window). Backward compatible: no migration, older days are read from `proteinStart` / `proteinAt` / `proteinSkip`; the streak's on-time rule uses the entered time.
- **Прогрес › Графики › Хранене навреме:** a per-day chart of the last 7 days drawn as plain SVG (green on time, orange late with „+N мин“, grey missed, dashed while today's is still pending) with a summary such as „навреме 5/7 · средно закъснение 12 мин“ (average over the late meals).
- **Meal item rows** (Закуска and the other meal lists): line 1 time and grams, line 2 „пр · вх · мз · кр · фб · сл“ (protein, carbs, fat, creatine only when the food has some, fiber, salt; grams, „–“ when unknown). A small ⓘ next to the meal title opens the legend with the full names.
- What's new entry for 1.4.3. Unit tests in `tests/unit/v143.test.js`; e2e for the pill, its sheet, the time entry, the chart and the nutrient rows.

### Fixed (tester round)

- **A wake-up recorded by hand starts the protein countdown:** a wake-up for today (the morning tap, or **Ставане** typed in the sleep editor) starts the breakfast countdown at that time when protein is on and nothing is answered yet. If the window is already over, it is shown as overdue, so **Изядох** (with the time) and **Пропуснах** work as usual. Past days are never touched. A wake-up corrected in the editor moves an unanswered countdown with it. It is also checked at start-up and when protein is switched on.
- **Wording follows the profile's gender:** „кога си яла/ял“, „щом и ти си готова/готов“ and „Въведи я сама/сам“ (this one was masculine only). The otter stays „тя“. The night card reads „Лека нощ!“ / „Лягаш ли си? Докосни и {otter} ще се завие 🌙“.
- **Home install card:** the text gets the full width and **Инсталирай приложението** sits below it (390 and 360 px).
- **Добави храна:** the title stays on one line. **Готово с храненето** is a full-width button under it.
- **Sleep times** (and the meal time) are a typed 24-hour field (e.g. „0640“ or „6:40“) with −/+ steps (15 min for sleep, 5 min for meals) instead of the 12-hour AM/PM wheel. Text that isn't a time shows a hint and blocks **Готово**. The „до 16 ч“ rule is unchanged.
- The **accessibility labels** („Към съдържанието“, „Основно меню“) are translated.

### Fixed (tester round 2)

- **The protein countdown follows the data:** deleting today's breakfast that recorded the protein meal (or moving it to another meal or day) clears it when no other breakfast is left: the countdown, the pill and the Начало bar come back (overdue if the window has passed), „Протеиновата закуска е готова“ and the quest **Протеин до 30 мин след ставане** are un-ticked and their XP is taken back (other quests and XP untouched). **Отмени** restores it all. Deleting today's sleep entry clears a countdown that its wake-up started (when the meal isn't answered yet); its **Отмени** brings it back.
- **−/+ on time fields step exactly** (5 min for sleep and meals, no snapping to a grid: 06:42 + 5 = 06:47, 06:45 − 5 = 06:40) and wrap at midnight.
- **Sleep editor:** saves only with **Готово** (closing discards), the sheet no longer jumps when a field is tapped, typing keeps the focus, and tapping a field selects it so typing replaces the whole value. The protein countdown moves on **Готово**.
- **360 px:** the Вода card puts the glasses on their own row („0/8 чаши · 0 л“ on one line), „Креатин 0 г“ stays on one line with the button below, the Начало **Седмична цел** card is no longer clipped (ring and title on top), and the protein / fibre / salt line in **Хранения днес** has the card's padding.
- **Food search** matches words, not one exact substring: case-insensitive, Bulgarian word forms (пилешки / пилешко / пилешките), „гърди“ = breast (so „пилешки гърди“ finds **Пилешко филе**) and „бут“ = „бедро“. Built-in foods come first, then your own products, then Open Food Facts. Nutrition data unchanged.
- **A late breakfast's row time** is the time from **Кога яде?**, not the save time.

### Fixed (tester round 3)

- **„Отмени“ always undoes** (food, sleep and every other delete with the undo pill). Cause: the pill can be swiped away, and a press that moved more than 8 px (|dx| + dy) counted as a swipe, so the click was swallowed and nothing came back, while the pill stayed. A finger, or the mouse in Chrome's device mode, easily moves that much during a tap. Now only a real swipe dismisses (more than 40 px sideways or 30 px down), anything under 24 px is a tap and undoes on release, without waiting for the click; the pill no longer moves while it is pressed, and a click after the touch cannot fall through to what is under it.
- **XP follows the quests:** a quest of today that is no longer done (e.g. its breakfast deleted) gives its XP back – „Запиши закуската“ too, not only the protein quest – and Undo grants it once more. Earlier days and quests that are still done are never touched.
- **Кога яде?** shows only the app's own messages, in the ти form: „Избери час след старта на таймера.“ (and „Този час още не е дошъл – избери по-ранен.“). The time fields have no browser constraints (no min/max/pattern), and the barcode form is `novalidate`, so no browser popup can appear.
- **Open tabs stay in sync:** after a change is saved, the other open tabs of the app re-read just those rows (BroadcastChannel per channel/database) and re-render. A re-read never writes or re-announces (no loops), and a row with a local write still on its way is not overwritten (no lost writes). A restore / „Изтрий всичко“ in one tab reloads everything in the others; a language/theme change follows too.
- **A late meal shows how late it is** instead of a frozen 00:00: the pill „Закуска +41 мин“ (from 60 min: „+1 ч 05 мин“), the sheet „Времето изтече · +41 мин“ and the Начало banner „Времето изтече · +41 мин · изяж 30 г протеин“, counted up from the end of the 30-minute window.

### Part A (beta)

- **Protein breakfast switch** (Profile › **Протеинова закуска**, on by default; existing users keep it on, no migration). Off: no countdown, meal pill, Home banner, protein reminders (local and push), protein quest, protein card on the morning page, and no **Хранене навреме** card. A breakfast saved while it is off is just a breakfast. The stored **Напомняния за протеин** choice is kept (its row is hidden while the switch is off) and comes back when it is switched on again; a wake-up already recorded today then starts the countdown.
- **The meal pill always stays full size** (no shrinking to a clock circle while scrolling).
- **Grams steppers** (add sheet and diary-row edit): **−10 −5 [grams] +5 +10**, typed values still allowed, 0…5000 g, one row at 360 and 390 px (`gramStepper` / `nextGrams`, shared by both sheets).
- **Храна › Хранения:** under each meal's foods a totals line „● пр 42 · ● вх 1 · ● мз 44“ (whole grams, macro colours).
- **Protein quest graded:** eaten within 30 min of waking = ticked, 15 XP; up to 30 min after the window = ticked with „+N мин“, 8 XP; later, skipped or not eaten by then = greyed „пропуснато“ (not struck through), no XP. The old 15-min grace is gone. Quests can now carry a `state` (done / XP / missed / late minutes); the reward engine corrects the ledger when the grade changes.
- **Хранене навреме:** each eaten breakfast shows its protein in grams under the day; under 30 g it is hatched (title „малко протеин · N г“); missed = grey „пропусната“; delay in orange „+N мин“. Summary „навреме 5/7 · протеинови 6/7 · средно закъснение 14 мин“. Days whose breakfast rows are gone count as unknown protein (never „low“).
- What's new: two 1.4.3 items. Unit tests `tests/unit/v143-parta.test.js`; e2e `v143a` (switch off/on, steppers at 360/390, totals line, chart, late/missed quest).

### Part B (beta)

- **B1 – Meals per day** (Profile › **Хранения**): five meals – Закуска, **Сутрешно междинно** (new, off by default), Обяд, **Следобедно междинно** (the old „Междинно“: existing `snack` entries stay there), Вечеря – each with a switch; the last one can't be switched off. A meal that is off disappears from the diary, Day view, „move to“ and the logger's choices, but a day that already has entries in it still shows them. The meal picked by the time of day and by voice entry is always one that is on (a disabled snack goes to the other snack, else to the current meal). Breakfast off also turns the protein breakfast off (its row is hidden while breakfast is off). No data migration needed: users without the setting get the four meals they had.
- **B2 – Partial workouts**: XP = round(done sets / planned sets × 50) + 2 per set + 20 per record (before: per-set XP only). The daily workout goal is ticked with **„непълна“** and the same share of its 50 XP. **„Довърши тренировката с Видричка“** on the summary, history, calendar, Day view and Home (only the same day, while no other workout runs) reopens it at its first unfinished set; finishing it replaces the saved workout (it becomes full once enough sets are done) and both its XP entry and the goal's are corrected to the full amount – never counted twice. The next day it stays partial and the button is gone. A full workout today: Home shows **„Тренировката е готова“** (no Тренирай button) and **„Следващата ти тренировка е в [ден]: [план]“**. Streak and weekly goal still count full workouts only.
- **B3 – Goals**: Home **„Дневни цели“** (reset every day): one goal per meal that is on (5 XP each; replaces „Запиши закуската“ 10 and „3 хранения“ 15), protein within 30 min (only with the protein breakfast on; 15 on time / 8 late, part A), **Протеин за деня** with a bar filled from the food diary (e.g. 82/120 г, ticks at the Profile goal; 15 XP), workout 50 (partial: its share), water 10, steps 20. New **„Месечни цели“** section: **Месечни мерки** (30 XP, any day of the month; the 7-day measurement prompt is gone – measurements can still be entered any time) and **Месечни снимки на прогреса** (25 XP + the 100 XP photo-set bonus), shown all month and ticked when done. Goals are keyed by their section's period (`quest:<day|month>:<id>`); an older id already paid in the same period („breakfast“ today, „measure“/„photos4“ of this month) counts as paid, so updating never pays twice. A „Седмични цели“ section needs only an entry in `QUEST_SECTIONS` and goals with `section: 'weekly'`.

### Fixed (Part A/B beta round)

- **A breakfast saved before the sleep entry counts for „Протеин до 30 мин след ставане“:** when the wake-up is entered later (sleep sheet or the morning tap), today's latest breakfast is graded by when it was eaten – 15 XP on time, 8 XP with „+N мин“ up to 60 min after the 30-minute window, 0 / „пропуснато“ later (same rules as Part A).
- **Home / Day „Хранения днес“** shows the same „● пр · ● вх · ● мз“ line as Храна under every meal that has food (shared `food/views/totals.js`).
- **A switched-off meal's add page** (an old link, history back, the protein deep link) opens the meal of this time instead; a hidden meal that already has entries that day still opens.
- **XP follows settings at once:** changing the water or protein goal or a meal switch re-checks the goals right away (hidden goals untouched, no double pay), so Profile and Home never show different XP.
- **Same kcal in the add and the edit sheet:** editing grams uses the food's per-100 g values (e.g. 160 g chicken = 264 kcal in both); rows without a known food (voice, custom) scale as before.
- **Дневни цели in the order of the day:** Закуска, Протеин до 30 мин, Сутрешно междинно, Обяд, Следобедно междинно, Вечеря, Протеин за деня, Тренировка, Вода, Крачки (switched-off items skipped). XP unchanged.

## [1.4.2] – 2026-10-28

### Added

- **Creatine** in **Храна** (the day): a card with the day's total in grams in BG format („1,2 г“), split into food and supplement. Values (mg per 100 g) exist only for the built-in meat and fish (49 foods, `src/data/creatine.js`). They come from a species reference (Harris 1997, Balsom 1994, Balestrino & Adriano 2019, Wuertz & Reiser, the NHANES 3.88 g/kg method) scaled by the row's protein, with cooking/canning retention of 0.75/0.70 (Larsen 2007, Purchas 2004, Hughes 1960). Every other food counts as 0 (unknown), nothing is invented. Sources and the full table are in `docs/CREATINE.md`. New built-in food: **Херинга (сурова)** (USDA SR 15039).
- **Добавка креатин**: a quick log on the card (default 3 g, the last dose is remembered, max 50 g), stored per day (`days.creatineG`) and counted in the total.
- **Снимай етикета** in the new-food form (camera or gallery, when the voice server is set). The photo goes to the voice Worker `/vision?kind=label` (Workers AI first, xAI fallback) and is never stored. The reply fills name, kcal, protein, fat, carbs, fiber and salt per 100 g for the user to check (filled fields are marked). kJ is converted to kcal, sodium to salt and per-serving values to per 100 g. Implausible results are rejected. Bulgarian errors for offline, daily limit, unreadable label and server problems.
- A **per-phone daily AI limit** (20 photo reads a day, shared by screenshots and labels, `features/voice/limit.js`).
- Voice Worker 1.4.2: `/vision` accepts `kind=label` (`src/label.js`, `today` optional for labels); `/health` reports `label`. Backward-compatible with 1.4.1 clients.

### Changed

- **Sleep editing**: the ± hours stepper is replaced by **Лягане** and **Ставане** time pickers. The hours are computed across midnight. Bedtime 12:00–23:59 means the evening before the day, 00:00–11:59 means after midnight (the day itself). Wake is the next time after bedtime. Each time shows its date in small text, with a tiny **ден назад / ден напред** override. The record keeps `sleepH` (streaks and charts unchanged) plus `sleepBed`/`sleepWake`. Old hours-only entries open with the wake time (or 07:00) and bedtime = wake − hours. Nothing is rewritten until saved.
- Durations are shown as „X ч MM мин“ everywhere (e.g. „8 ч 00 мин“).
- What's new entry for 1.4.2.

### Fixed (beta tester round)

- **Label wording:** the implausible-label message reads „…Провери етикета и ги въведи ръчно.“ (it was already right in 1.4.2-beta-eef52b30bc; a unit test now guards it and that no string contains „Проверя“). A spell check of all Bulgarian strings found nothing else.
- **Future wake-up in the sleep editor:** checked live (`checkNight` in `daily/sleeptimes.js`, the same rule the save uses): „Часът на ставане още не е дошъл.“ shows inline right away and **Готово** is disabled until the time is valid (also for 0 h / more than 16 h). Invalid values are never saved.
- **Dates never move silently:** when the night is not "evening before → this morning" (bedtime after midnight, ден назад / ден напред), a short note shows the resulting dates, e.g. „Лягане вт, 27.10 → ставане ср, 28.10“.
- **ден назад / ден напред** are now real buttons with a 44×44 px touch target (still small text).
- **Label photo:** a failed or blocked reading (implausible values, unreadable, error, offline, limit) clears every value the previous photo filled that was not changed since (`applyScan` in `food/label.js`); values typed by hand stay. The error then says „Стойностите от предишната снимка са изчистени.“ A new good photo also clears old-scan values it does not have.
- **Removing the creatine supplement** shows the app's „Отмени“ pill (same as other deletions); tapping it puts the grams back.

## [1.4.1] – 2026-10-28

### Changed

- **Verified exercise technique** for all 20 exercises (ids unchanged). The old placeholder stick figures (`features/library/figures.js`) and the unverified `steps`/`tips` texts are removed. Each exercise now has a two-frame illustration (start/end position) with numbered markers and a legend, and Bulgarian sections: **Изходна позиция**, **Изпълнение**, **Дишане**, **Ключови точки**, **Чести грешки → как да ги избегнеш** (each mistake with its fix), **Подробно за мускулите** (collapsible) and small **Източници** links (NSCA, ACE, ExRx). Shown on the exercise page and in the technique sheet during a workout; the library list and the workout rows use thumbnails of the new drawings.
- The content is generated from the verified set in `exercise-styles/final` by `tools/make-technique.mjs`: `src/data/technique.js` (texts), `src/data/figures/<id>.js` (two svgo-optimised inline SVG frames per exercise, ids prefixed per exercise, one lazy chunk each and precached by the service worker, so they work offline), `src/data/figure-thumbs.js` and `src/features/library/figure.css` (light and `.dark` palette, app font).
- Technique texts are Bulgarian only; in English the sections show a short note.
- What's new entry for 1.4.1.

### Fixed (beta tester round)

- **Update bar** („Има нова версия. Обнови“) no longer covers **Край** or any top button: it sits in its own strip under the notch, and while it is shown `--updh` pushes every header, Край and close button down (`--sat` = safe area + `--updh`). New SW e2e: during a workout, Край is hit-testable and a normal click opens its dialog (412×860, 390×844, 360×740).
- **Bottom nav** stays pinned to the bottom of the screen on every page. It is centred with `left/right + margin` instead of a transform, and `ui/nav-pin.js` keeps it on the visible part of the screen while the page is pinch-zoomed (before, with zoom it stayed at the bottom of the unzoomed page and scrolled away with the content, on Android and iPhone). New e2e: exercise page, food and progress scrolled to the end on Android and iPhone, plus pinch-zoom on Android.
- **Sources** show only the title and the link; the notes about the drawings moved to the verification notes. Клек с щанга cites ACE **Back Squat** (not Bodyweight Squat).
- **Bulgarian only:** no English/Latin words left in the technique texts (bracing, butt wink, V-дръжка, cm …), source titles and brands aside; the rest time on the exercise page reads „45 сек“.
- **One muscle glossary** (`src/data/muscle-glossary.js`): every muscle is written in one form in all 20 exercises; the section is now the collapsible **Подробно за мускулите** (collapsed by default; a tapped-open section stays open on re-render).
- **Drawings:** Клек с щанга bottom position redrawn (bar over mid-foot, torso 37° forward, shins 27°, thighs just below parallel, heels down; plus a 3rd marker for the bar); Мъртва буболечка frame 2 shows the opposite arm extended back over the head toward the floor. Smoother wording in several texts and legends.
- **Sources listed once:** Хоризонтален скрипец showed „ACE Exercise Library – Seated Row“ twice (two ACE pages with the same title); the duplicate (machine row, ACE 168) is removed from the source card, and `tools/make-technique.mjs` now drops any repeated source (same title or same link) for every exercise. New unit test: no exercise has duplicate sources.
- **Build id** (e.g. `1.4.1-beta-<hash>`) in the Profile footer, at the top of Какво ново and in the What's new popup.

## [1.4.0] – 2026-10-28

### Added

- **Day history:** dates in **Прогрес › Календар** open that day (steps, sleep, mood/energy, water, food and the workouts with exercises, sets and volume; zeros when empty). Past days are editable; future days are not. One date-keyed data layer (`src/features/day/`) serves Home and the day view, and streaks, charts, insights and the recap are derived from the stored rows.
- **Steps and sleep from a screenshot** (voice Worker `POST /vision`: Workers AI vision first, xAI as the fallback). Multi-day views give one row per day; nothing is saved before you confirm; the image is never stored.
- **Barcode scanning** straight from the phone with the Open Food Facts API (BarcodeDetector on Android, the bundled ZXing fallback on iPhone), manual barcode entry and manual food when nothing is found.
- **Weight trend chart**, a **monthly recap** reachable from the calendar (also for the month so far), and a **Какво ново** page in Profile with every release and the build hash.
- **Foods:** fiber and salt for every built-in food, 13 multi-source corrections, boiled/grilled, breaded and fried meat and fish, cottage cheese, mixed mince 50/50, 60/40 and 75/25, and a **Ястия и други** tile.
- **Water:** a **−** button on the left of the glasses (never below 0); the glass size is unchanged.
- **Feedback:** a thank-you screen, a „3/3 снимки“ counter, 10 messages a day per phone; optional invisible Turnstile (off until a widget exists).
- **Push:** a **Изпрати пробно известие** button (push server 1.2.0 `POST /test`) and a switch for the loud wake-up alarm (`loudOn`).
- **Beta channel:** `npm run build:beta` builds a separate app (own IndexedDB, storage keys, caches, `-beta` Workers and a БЕТА marker).

### Changed / fixed

- The anonymous-food notice appears once, on the first food entered by hand and before anything is sent, with the Profile wording and a **Не изпращай** button (no dialog at start-up).
- Sleep: night streak counts manual entries, 7,5 h default, labelled quality faces, delete an entry. Steps: **Задай общо** vs **Добави** explained.
- Charts: empty-state text, Bulgarian weekday labels, the workouts title shows the number, the correlations banner says what will appear; heatmap weekday labels and legend; locked badges say how to earn them.
- Home: tapping the otter answers, the streak card explains how weeks count, no backup card on day 1, no check-in right after onboarding, no wake-up prompt over a workout summary, „Готово за днес ✓“.
- Food: online search gives up after 6 s (both endpoints in parallel), a protein over-goal cue, concrete portions instead of „малко“, „паста с пиле“ split into parts, „Храна“ everywhere, „ккал“ in Bulgarian.
- Technique opens as a sheet inside the workout; the Profile footer clears the nav; accessible names on the nav and icon buttons; a longer post-voice tour.
- **Tester round (beta 3):**
  - Service worker – the real cause of `ERR_FAILED`: Cloudflare Pages answers `/index.html` with a 308 redirect to `/`, so the precached `index.html` was a _redirected_ response, which Chrome refuses for a page navigation (offline opens, cache fallbacks and every open under the older worker failed). The shell is now cached only as `./`, every cached/served response is a clean (non-redirected) copy, and an older cache's redirected entry is cleaned when read. A new worker takes over at once (`skipWaiting` + `clients.claim`), the open page shows the „Има нова версия · Обнови“ bar, and the previous version's files stay cached until the next update so an open old page keeps working. The repair script never runs offline.
  - **/repair** is a real static page (`repair.html`) that the worker never intercepts: it unregisters the worker, clears the app's file caches (data stays) and reopens the app. Profile › **Поправи приложението** links to it.
  - Offline: reload, new tabs and hash routes load the cached app; a slow network gets the cached app after 4 s.
  - Profile › Какво ново shows the full build id again (e.g. `Билд: 1.4.0-beta-<hash>`, written into `index.html` by the build).
  - Weight step „1 / 2,5 / 5“ in Bulgarian number format (also the template editor's weight).
  - Online food search goes through the beta voice Worker's new `GET /off-search` (Open Food Facts' search endpoints have no usable CORS from a browser): one request per (debounced) search, answers cached a day at the edge and in memory, 20 per minute per IP. No more console CORS errors.
  - Progress › Sleep › Нощи: no „– → –“ for nights without bed/wake times.
  - Nutella (3017620422003): Open Food Facts reports `fiber_100g: 0`, so „Фибри 0 г“ is the product data, not a missing value (missing values show „–“).
- **Tester round (beta 2):**
  - Service worker: navigations are network-first with the cached app as the offline fallback, every request falls back to the network, it never answers `ERR_FAILED`; a new worker takes over at once when no tab is open and removes only this app's old caches. A small inline script in `index.html` repairs a stuck install (unregister, clear the app caches, reload; at most every 5 minutes), also when a lazy chunk fails to load.
  - Sleep is stored to the minute (it was rounded to ½ h; the vision Worker asks for hours + minutes) and shown as „7 ч 20 мин“ everywhere; the screenshot sheet has hours/minutes fields, an optional 1–5 quality and a full-width date field.
  - Barcode/online foods: the brand is not repeated („Nutella“, not „Nutella · Nutella“); a nutrient the product does not list shows „–“ (and a day without any fibre/salt data shows „–“ instead of 0). Online search runs both endpoints and takes the first answer, local results show at once, and the online part always ends with results, „няма“ or „не е достъпно“ + **Опитай пак**.
  - Food added to a past day gets the meal's usual time (08:00 / 13:00 / 16:00 / 19:00). Manual food: a live hint when kcal differs from 4·П + 4·В + 9·М by more than 20 % and 30 kcal; saving is never blocked. Fibre and salt in the food list rows.
  - Foods: separate извара (Bulgarian whey curd) and котидж values; raw chicken/turkey/pork/lean beef, beef mince 80/20 and grilled salmon; the plain cooked rows are labelled „(на скара)“, raw ones „(сурово/сурова)“, mince as „Кайма смес 60/40 (свинско/телешко, сурова)“ with a note that fat varies. `node tools/export-foods.mjs --since main` writes `docs/foods.csv` and `docs/foods-changes.csv` for the shared sheet.
  - П/В/М and Bulgarian number formats („2 145“, „2,5“) everywhere; sleep chart dates; bigger fibre/salt charts; „Без тренировка този ден.“; the 1.3.3 note names the current „Кажи какво хапна“ screen.
- **Final fixes (go-live):**
  - Barcode / online products that do not list a value (kcal, protein, carbs, fat, fibre or salt) still count it as 0, but the grams sheet and the diary item now say so – „Липсва стойност за въглехидрати – брои се като 0. Попълни я.“ – with a **Попълни** button that opens the food form with the known values filled in, the missing fields marked and the first one focused. The corrected values are saved with that food (the next scan of the barcode uses them) and with its diary rows (`api.saveFoodFix`, `logic.applyFix`, `logic.missingValues`, `views/notice.js`).
  - Open Food Facts products with impossible values (e.g. „Nutella 5 kcal / 100 g“) are filtered out, not shown: one reusable check, `logic.implausible()` – a negative value, kcal over 900, a value or П+В+М over 100 g, or kcal more than 30 % AND 30 kcal away from 4·П + 4·В + 9·М (+ 7 kcal/g alcohol; a missing macro may only explain extra kcal). When nothing reliable remains, search shows „Няма надежден резултат за тази храна. Въведи я сам.“ with a button to an empty food form (the searched name prefilled); a scanned implausible product is treated as not found the same way (its name prefilled).
  - Confirmed: built-in извара salt 0,1 г / 100 г; every „(на скара)“ meat is a cooked-meat entry (category Месо и риба, cooked-weight values) – both unit-tested.
  - Voice Worker live config: the `OFF_LIMITER` rate limit (20 / min per IP) for `/off-search`, as on beta.
- Data version 5: fiber and salt back-filled on diary rows of built-in foods (add-only, tested).

## [1.3.4] – 2026-10-27

### Added

- **Home meals:** a **Хранения днес** card on Home. A meal with food opens the same meal sheet as the Food tab (edit grams, move, delete, **+ Добави към …**, **Запази като комбинация**); an empty meal opens Add food. The breakfast quest opens the same sheet once breakfast is logged.
- **After „Кажи“ saves, the app shows where things landed.** One thing: it goes there and animates it (water glasses fill one by one, the meal row pops, the steps bar grows), then a small celebration. Two or three: a ~1 s stop at each, then one celebration. More: „Записах 5 неща“ and one celebration. Any tap skips; the toast and **Отмени** pill stay; reduced motion gets short static highlights.
- **Daily steps challenge:** a Home card with a progress bar, **+1000 / +2000** and **Въведи** (add or set the day's total); a goal in Profile (default 8000, 1000–30000 in 500s); a daily quest with XP and one celebration a day when the goal is met. By voice: „запиши 5000 крачки“ (adds) or „общо 9000 крачки“ (sets). Manual entry only – no step counter access.
- **Sleep card:** last night's hours (½ h steps) and quality 1–5 on Home; by voice „спах 7 часа“. Stored in the day record, so it is in the backup.
- **Progress › Графики** (week / month / 3 months, light SVG): steps with the goal line, goal days and best streak; mood and energy; sleep; water vs goal; kcal and protein vs goal plus fiber (25 g reference) and salt (≤5 g); workouts per week vs the weekly goal and volume. Weight, measurements and photos are unchanged.
- **Insight cards** once there are 14+ days of data, at least 5 days in each compared group and a meaningful difference: sleep ≥7 h vs energy, workout days vs mood, step-goal days vs water. Gender-aware Bulgarian.
- **Anonymous manual-food collection (on by default):** when you save a food you typed in by hand, only its name, per-100 g kcal, protein, carbs, fat, fiber, salt and the app language go to the push Worker's `POST /foods`. No IP, device id, grams, dates, photos or cookies. A one-time notice explains it; **Профил › Помогни да подобрим приложението** turns it off at once. Offline it fails silently.
- **Обратна връзка (Profile only):** dictate (the **Запиши** flow, text lands in the box for review) or type what to change or add, attach up to 3 screenshots (resized to 1080 px JPEG, ≤300 KB each) and send. Thank-you toast.
- Voice server 1.2.0: steps, sleep, weight, mood and energy entries („сода“ is still sparkling water, 0 kcal).
- Push server 1.1.0: `POST /foods` and `POST /feedback` (D1 tables `foods_shared`, `feedback`, `feedback_images`; migration `0002_collect.sql`, additive only), with the origin allowlist, size limits and per-minute/day rate limits. `server/tools/read-feedback.mjs` downloads feedback with its images.
- A **Какво ново в 1.3.4** note.

## [1.3.3] – 2026-10-27

### Added

- **Dictation right in the app.** Where the browser's own speech recognition does not work well (everywhere except Chrome on Android, so also Safari and the home-screen app on iPhone), **Кажи** has a **Запиши** button: tap to start, tap again to stop (automatic stop at 30 s), with a timer, a sound level meter and **Разпознаване…** while the text is recognised. The text lands in the box for review; **Разчети** then logs it as before.
- Recording uses MediaRecorder at 32 kbps mono (audio/mp4, else webm/opus) and releases the microphone as soon as it stops. Clear Bulgarian messages for a blocked microphone, no sound and no connection.
- Voice server 1.1.0: `POST /transcribe` (Workers AI `@cf/openai/whisper-large-v3-turbo`, Bulgarian or English, VAD on) returning `{text, duration}`. Same allowed origins, `audio/*` only, at most 1 MB and 35 s, 6 a minute per IP. Audio is never stored or logged.
- A **Какво ново в 1.3.3** note.

### Fixed

- The **Отмени** pill disappears when you switch tabs and does not come back when you return to Food (it only follows the one navigation made by the deleting tap itself, e.g. deleting a plan in its editor).
- The suggested combination name agrees with the meal: „Обичайната ти закуска“, „Обичайният ти обяд“, „Обичайната ти вечеря“, „Обичайното ти междинно хранене“.
- Shorter validation text: „Най-много 100 г на 100 г продукт.“

## [1.3.2] – 2026-10-25

### Changed

- **Undo is a small „Отмени“ pill**, only after a deletion. It sits bottom-right above the nav (or above an open sheet), moves up so it never covers a button, shows a 4-second countdown ring and can be swiped away. Adds and edits (food, moves, combinations, voice logging) now show only a short toast with no button.
- Toasts and the pill are cleared when you go to another page.
- **Combinations need a name** (an empty name is no longer silently replaced) and names must be unique (case and spaces ignored). Combinations can be **renamed** in **Редовни хранения**.
- **Units are consistent** in the Bulgarian UI: г, кг, см, т everywhere (food lists, steppers, workouts, progress, charts), with Bulgarian number formatting.
- Wording: „Докосни пак, за да добавиш към междинното хранене“ (and закуската / обяда / вечерята), „Стойността не може да е над 100 г в 100 г продукт.“
- The voice server tells the AI to use correct standard Bulgarian food names (e.g. „сьомга“, never „салмона“).
- A **Какво ново в 1.3.2** note (in the app language).

### Fixed

- After an edit, a deletion, Undo or a restore, every view (the page behind an open sheet included) re-renders at once; no reload needed.
- **Наскоро изтрити** opened from the Food diary keeps the Food tab highlighted.
- Set weight is limited to 0–500 kg, for typed values and the **+** button.
- „спрямо преди 4 седмици“ compares with the newest entry that is at least 28 days older, not with an earlier entry from the same day.
- Progress › Body lists every photo session (newest first) with the session count, not only the latest one.

## [1.3.1] – 2026-10-25

### Added

- **Fiber and salt.**
  - The manual food sheet has **Фибри / 100 г** and **Сол / 100 г** below Мазнини. Both are optional; empty means unknown.
  - Open Food Facts fills them from `fiber_100g` and `salt_100g` (or `sodium_100g` × 2.5).
  - Voice logging fills them too.
  - They are shown per item (grams sheet, meal sheet) and as daily totals under the macros (— while nothing logged that day has them).
- **Edit a meal item.** Tapping an item in the meal sheet opens an editor: change the grams (kcal and macros follow) and/or move it to another meal, or delete it. **+ Add to _meal_** stays.
- **Undo everywhere.** Every delete and edit shows an **Отмени** snackbar for 8 seconds:
  - food (add, delete, edit, move), water decreases, voice logging, combinations (save, add, delete);
  - workouts, measurements, photos and plans (after their existing confirm).
- **Наскоро изтрити** (Recently deleted), reachable from Profile and the Food diary.
  - Deleted foods, photos, workouts, measurements, combinations and plans are kept for 7 days and can be restored (or deleted forever); after that they are purged at startup.
  - A restored workout recomputes PRs and XP. A restored photo whose slot was filled moves to a free slot or a new session.
  - The bin is not part of backups.
- **Saved combinations as quick chips** in Add food: the first tap selects (and shows what is in it), the second tap adds it to the meal, with Undo.
- **Запази като комбинация** in the meal sheet. The combination name dialog opens with its default name selected, so typing replaces it.
- A **What's new in 1.3.1** note.

### Changed

- **Voice logging saves at once.** There is no separate confirm/**Запази** step any more: the entries are saved, the sheet closes, and an Undo snackbar lists what was added (e.g. _"Добавено в Закуска: кебапчета 120 г, лютеница 130 г, +1 чаша вода"_).
- **The meal named in the sentence wins.** _"запиши в закуска две кебапчета, половин буркан лютеница и една сода"_ goes to Breakfast from any screen and at any time. With no meal named, a said time or a past day keeps the meal inferred from it; otherwise the screen's meal (Food › Add _meal_) or the current meal by time of day is used.
- **Voice server** (redeployed):
  - The schema adds `meal_named`, `fiber` and `salt` per entry.
  - The prompt asks for names in the app language (Bulgarian for bg, English names translated), always an estimate in grams, typical portions for vague amounts (e.g. half a jar of лютеница ≈ 130 g), splitting clearly separate parts of mixed dishes, and no invented time. In Bulgarian "сода" is sparkling water, so it counts as water.
  - The reply cap is 1,200 tokens (was 700) because each entry now has more fields. A call costs about $0.0025.

### Data

- IndexedDB schema 3 adds the `trash` store; data version 4 adds an empty bin. Existing rows are not rewritten: old foods simply have no fiber/salt (unknown).

## [1.3.0] – 2026-10-25

### Added

- **"Say it" voice logging** for food and water (**Кажи** in Bulgarian).
  - A **Say it** button on Home and a mic button in Food › Add open a sheet with a text box. You dictate with the phone keyboard's mic (iOS and Android) or type, for example _"изядох купа овесени ядки с банан и изпих две чаши вода"_. On Android Chrome a **Dictate** button (the browser's speech recognition) is offered too; on iPhone the keyboard mic is used.
  - The text, plus the phone's local date, time, time zone and app language, goes to a small Cloudflare Worker (`voice/`). The Worker asks xAI (`grok-4.20-0309-non-reasoning`, strict JSON schema, temperature 0) to turn it into food entries (name, meal, amount, grams, kcal, protein, carbs, fat, optional time and date) and water entries (ml). It understands Bulgarian and English, vague amounts ("a bowl", "две чаши") and relative times ("yesterday evening", "сутринта").
  - A **confirm sheet** lists everything. You can change the grams (nutrition scales) or glasses, change the meal, or remove an item. **Nothing is saved until Save.** Saved foods go through the normal food API (quests, XP, the micro animation), and water is added to that day's glasses.
  - Opened from Food › Add _meal_, today's foods go to that meal.
  - The buttons stay hidden while the voice server isn't configured or reachable (like the push switch).
- **Voice server** (`voice/`, the stateless Cloudflare Worker `vidrichka-voice`, free tier, no D1 or KV):
  - It only accepts `POST /parse` from `https://iceto3.github.io` (and localhost for dev), with CORS for that origin only.
  - It caps the text at 500 characters, the body at 4 KB and the reply at 700 tokens.
  - It rate-limits each IP to 8 requests a minute with the free Workers Rate Limiting binding, plus a per-isolate fallback.
  - It never logs the text or the key. The xAI key is a Worker secret (`wrangler secret put`) and is never in the app or the repo.
  - A call costs about $0.0018 (around 1,050 input and 200 output tokens).
- A **What's new in 1.3.0** note. Its voice items appear once the voice server is configured.

### Deployed

- **Push server live:** `https://vidrichka-push.vidrichka.workers.dev`. Its D1 database `vidrichka-push-db` has migration 0001 applied, and the VAPID private key is a Worker secret. **Profile › Reminders › Reminders on this phone** is now shown, and the push items of the 1.2 "What's new" appear for people coming from 1.1.
- **Voice server live:** `https://vidrichka-voice.vidrichka.workers.dev`. The xAI key is a Worker secret, set with `wrangler secret put` from the environment.
- The account's workers.dev subdomain is `vidrichka`.

## [1.2.1] – 2026-10-25

### Added

- **Progress photo sessions** (Progress › Body).
  - Every upload is a dated session with four pose slots: **Front**, **Back**, **Left** and **Right**. A session can have 1–4 photos, and all four slots are always offered.
  - Each slot has **Camera** and **Gallery**. **Add several** fills the empty slots in order, and a photo can be moved to another slot (it swaps) or deleted (asks first).
  - The Body tab shows the latest session's four slots with the date the photos were taken and when they were added.
  - A **Timeline** lists all sessions in chronological order, and each one opens for editing.
- **Photo dates.** The default is the EXIF capture date (`DateTimeOriginal`, read on the phone by a tiny built-in JPEG reader, which reads nothing else). Without EXIF, the file date is used when it is from an earlier day, and otherwise the upload time. A session takes the earliest date of its photos. The date can always be changed, for example for photos taken yesterday and uploaded today. An edited date re-sorts the timeline and the before/after, and counts for the monthly set and streak.
- **Pose-to-pose Before/After.** For each pose, the oldest photo is shown as **Before** and the newest as **Now**, and either side can be picked again. It never shows the same photo on both sides. With only one photo of a pose, that photo is **Now** and **Before** stays empty.
- **Monthly 4-pose set**, from the 1st of each month:
  - a "Monthly progress photos" quest (n/4) until all four poses are done that month (across sessions)
  - 100 bonus XP for each complete month and a monthly streak
  - a reminder at 10:00 on the 1st (Profile › Reminders), which always comes from the phone itself
- **Photo celebrations:**
  - Each session ends with a small celebration: the otter's bounce, wave, wink and sparkles with the Warm hello sound, plus new hop, spin and flash variants and random titles, never the same twice in a row.
  - Completing the monthly set brings the big celebration.
  - The **First photo** badge and any level-up from a session now come after the small celebration as tap-away toasts and no longer block the screen.
- A **What's new in 1.2.1** note. People coming straight from 1.1 also get the 1.2 items and the gender choice.

### Changed

- **Ate it** / **Да, ядох!** (on #morning, the Home protein bar, the in-app prompt and the Android notification button) now only opens the Breakfast logger. The protein quest, its XP and the protein record are counted only once a breakfast entry is actually saved, with the existing 30-minute rules. The reminders keep coming until breakfast is logged or **Skipped**. This changes item 12 of 1.2.0.
- Data version 3: the 2 → 3 migration turns every existing photo into its own session, with the photo in the **Front** slot and its original date and image kept. Nothing else changes and no data is removed. Backups from older versions still restore.
- "What's new" now uses the full version, so a patch release can have its own note.
- Tests: new unit tests (EXIF parsing with JPEG fixtures, date fallbacks, edited dates, before/after, monthly set and streak, migration) and e2e photo flows on Android (Chromium) and iPhone (WebKit). The iPhone e2e now uses a persistent WebKit profile, because private (ephemeral) WebKit contexts cannot store photo Blobs in IndexedDB. The Profile page also no longer fails if the install date is missing from the data.

### Fixed

1. Two weigh-ins on the same day: the weight card showed the older one until a reload. The Body tab now updates as soon as a measurement is saved.
2. A partial workout said "<Workout> complete" on the summary and share card and counted as a workout in the Calendar. Partial workouts are now labelled **Partial**, the share card shows done/planned sets, and the Calendar counts only complete workouts. Partial ones show as "+N partial" and partial-only days get an outlined mark.
3. Workout volume was formatted differently in different places ("3960 kg" next to "5,8 t"). One shared formatter is now used everywhere (summary, share card, history, calendar, recap, partner card). It shows kg with a thousands separator below 10 t ("3 960 kg") and tonnes with one decimal from 10 t ("12,4 t"). The partner share text keeps its own "kg" word, so it uses the separator only.
4. The weight card with no data opened an empty chart. It now shows an empty state with **Add weight**.
5. **Reset all data** showed the welcome only after a reload. It now shows right away.

## [1.2.0] – 2026-10-25

### Added

- **Reminders that arrive when the app is closed (Web Push).** A small push server (`server/`, a Cloudflare Worker with D1 and a once-a-minute cron) sends each daily-rhythm reminder at the right local minute. This is the only way the 7:30 nudge can reach an iPhone. Turn it on once in **Profile › Reminders › Reminders on this phone**; **Turn off** unsubscribes. The server tracks each device's day: the 8:15 alarm is skipped once she is up, protein reminders stop after **Yes, I ate** or **Skipped**, and check-ins and the goodnight nudge stop once done. Daylight-saving changes are handled. Each reminder goes out once per day per device.
- Notification taps and buttons (**+1 glass**, **Yes, I ate**) and in-app answers report to the server, so the follow-ups stop. Offline, they are queued and sent on the next open.
- **Protein breakfast bar on Home:** a live `mm:ss` countdown ("Eat 30 g of protein · 23:41 left") with **Ate it** and **Skipped** buttons. Only the timer text updates each second, so there is no re-render and no flicker. After 30 minutes without an answer, the bar turns dark red and the `00:00` blinks (shown boxed, without blinking, with reduced motion). It stays red, also after a reload, until she answers. **Skipped** stops the reminders with no celebration or quest credit.
- **Log the protein breakfast:** **Ate it** or **Yes, I ate** (on the bar, the morning page or the Android notification button) marks protein done, then opens the Food logger on today's **Breakfast** with the hint "What did you have for your 30 g protein breakfast?". Logging there completes the **Log breakfast** quest. Closing it without adding anything still counts protein as done.
- **Micro animations** on every log: each water **+** drops into a glass with a ripple while mini Vidrichka takes a sip, and each food item pops with a bounce and sparkles by its meal. Each one is shorter than a second, with the soft "Warm hello" sound. It plays in its own click-through layer (no overlay, no re-render, so the + flicker fix stays). Rapid taps restart it instead of queueing. It follows reduced motion and the **Celebration sounds** switch.
- **Grammatical gender for Bulgarian texts.** Onboarding asks "You are: Female / Male", and it can be changed any time in **Profile › Address me as**. People updating from 1.1 get the same choice once in the What's new note, with Female preselected. The setting is stored as `gender` in the settings (missing means female, so no migration is needed). Gendered strings are `{ f, m }` variants that `t()` and `L()` resolve, so the code has no gender checks. An audit of every Bulgarian string found the forms that address the user: the water celebration ("Хидратирана/Хидратиран и щастлива/щастлив"), the level-up line ("Вие двете/двамата"), the 8:15 alarm hint ("докоснала/докоснал") and two exercise steps ("Изправена/Изправен"). Everything else is already neutral, or refers to Vidrichka, who stays feminine. Push notification texts are rendered on the phone and re-sent to the server when the gender changes, so server-sent reminders match too. English is unchanged.
- A one-time **What's new in 1.2** note. The push items only appear once the push server is configured.

### Changed

- While push is on, the phone no longer plans the daily reminders itself (no doubles). With push off, or before the server is set up, the 1.1 local scheduling still works as before.
- iPhone hints: push needs the Home Screen app on iOS 16.4 or newer, and iOS always plays the notification sound.
- The small water toast now only appears when the daily goal is reached. Every other glass gets the micro animation.
- No data or schema changes. The push state is a small `kv` entry, and the new `proteinSkip` day field is optional. The service worker cache is bumped to the 1.2.0 build.
- Privacy: only a random device id, the push subscription, the time zone, the reminder times or switches and the notification texts are sent to the server. No health data is sent.

### Fixed (tester findings on 1.1.0)

1. The workout celebration showed `[object Object]` instead of the plan name. It now shows the plan name in the current language.
2. The celebration, summary, calendar, plans and recap rounded the workout time differently. All of them now use one shared calculation (`durationMin`), and totals add up the per-workout minutes.
3. Opening a past workout from the calendar replayed the summary and celebration. It now opens a read-only detail in **Progress** with the sets of every exercise and a **Delete workout** button (asks first). Deleting recalculates XP, the streak and PRs. Badges stay earned.
4. Daily prompts could pop up during a workout, on the summary or over a celebration. They now wait until she is done. The morning check-in is only offered in the morning (4:00–12:00) and not after a workout today.
5. The reminder time fields were clipped and mixed 12 h and 24 h. They now show one style per language: 24 h in Bulgarian, and the phone's style in English (24 h for en-GB). The Profile row no longer says "Off" while daily reminders are on.
6. Manual food entry silently accepted impossible values. It now shows inline errors for negative numbers and non-numbers, for more than 100 g of a macro or of P + C + F per 100 g, and for kcal above 900. If the kcal don't match the macros, it warns once and offers **Save anyway**. Body measurements outside a sane range (weight 20–300 kg, sizes 10–250 cm, body fat 1–75 %) show an error instead of saving.
7. The "Set done" toast lagged a set behind on fast taps. Its count is now read when it is shown, and repeated toasts update in place.
8. A workout could be finished after a single set for the full XP. A workout now needs at least half of its planned sets (at least 3, or all of them for plans with fewer than 3 sets). Otherwise it is saved as **Partial** and earns only the per-set XP. A partial workout does not count for the weekly streak or goal. Its sets, volume and PRs still count.
9. Charts showed the same date more than once when there were several entries on one day. Entries are now grouped per day: the best lift, or the last body measurement.
10. The outfit picker listed a non-existent "Dumbbell 3" unlock. The unlock list now only names real outfits.
11. Sheets could not be closed with Esc, and the outfit sheet stayed open after a pick. Esc, a tap on the backdrop and the Android back gesture now close every sheet, and picking an outfit closes it.
12. **Ate it** in the morning prompt now ticks the **Protein within 30 min** quest and opens the breakfast logger, like the Home bar does.

## [1.1.0] – 2026-10-24

### Added

- **Morning flow:** a silent 7:30 nudge and a loud 8:15 alarm, which is skipped once the first one was tapped or the morning page opened. The full-screen **Good morning** page records the wake-up time and starts a 30-minute protein countdown that survives reloads.
- **Protein reminders** at +10, +20 and +30 minutes. **Yes, I ate** works from the notification on Android and from a big button on the morning page. It stops the reminders and completes the new daily quest **Protein within 30 min** (+15 XP).
- **Water reminders** at 11:00, 14:00, 17:00 and 20:00, each one editable and switchable, with **+1 glass** right in the notification on Android. Tapping one opens the water log.
- **Check-ins:** 11:00 for how you feel and how you slept (two taps, plus a one-tap fix for last night's bedtime), and 19:30 for energy (one tap).
- **Goodnight ritual:** a moon button on Home in the evening and a silent 22:30 nudge. Vidrichka yawns and curls up under a blanket, bedtime is recorded, and you get a sleep streak and +10 XP. A forgotten bedtime is estimated from your last evening app use and marked "estimated".
- **Progress › Sleep:** hours slept, average sleep, mood and energy, and a list of nights.
- **Celebrations:** small, medium and big animations with sounds, ported from the approved mockup. They are queued so they never stack, follow reduced motion, and have a **Celebration sounds** switch in Profile.
- All daily times are in **Profile › Reminders › Daily rhythm**.
- A one-time **What's new in 1.1** note.

### Fixed

- **Screen flicker when tapping + buttons:** every tap re-created the whole page or sheet, which restarted the sheet's open animation and rebuilt every node. Re-renders now update the existing DOM in place. Nodes, scroll position and focus are kept, and generated SVG ids are deterministic.

### Changed

- Data version 2 adds the `days` store. The migration only adds the store; all existing data is kept.
- The service worker cache is bumped to the 1.1.0 build, and the sounds are precached for offline use.

## [1.0.0] – 2026-10-24

First release.

### Added

- **Home:** greeting, Vidrichka the otter with context-aware messages, weekly streak with freezes, weekly goal ring, today's workout card, daily quests, XP level bar, monthly challenge and a Wrapped prompt.
- **Workouts:** three example plans (Leg Day, Upper Body, Home Full Body) and a plan editor. Active workout with steppers, Done locks a set and starts the rest timer (+15 s, Skip, sound and vibration where supported), skipped sets stay unfinished, an elapsed timer, "last time" hints and progression nudges.
- **Summary:** time, sets, reps, volume, MET calorie estimate, PRs, XP, confetti and a share-card PNG (Web Share with files, or a download).
- **Library:** 20 exercises with three step illustrations, a muscle map, tips, rest time, a YouTube technique search link, and gym/home and muscle filters.
- **Food:** a date picker, calorie ring, macros, water, meals with timestamps, 8 category tiles, quick picks, a BG/EN food database, Open Food Facts search, barcode scanning (BarcodeDetector, a lazy zxing fallback, and manual entry), a grams sheet in 10 g steps, a "Save this as a regular meal?" prompt, saved meals and recents.
- **Progress:** lifts (chart, PRs, badges), body (weight, measurements, progress photos with compare) and a calendar.
- **Motivation:** XP and levels, badges, a monthly challenge, quests, nudges, a monthly Wrapped recap and mascot gear by level.
- **Partner mode:** share a stats card; `?cheer=Name` links show a cheer pop-up.
- **Profile:** language (English/Bulgarian), theme (light/dark/auto), reminders, weekly goal, nutrition goals, rest-timer alerts, weight step, outfit, backup export/import (photos included) and reset.
- **PWA:** manifest with regular and maskable icons, iOS apple-touch icon and splash screens, an offline service worker (cache-versioned, with an update prompt), install help (Android prompt; iPhone Share → Add to Home Screen) and `navigator.storage.persist()` with backup reminders.
- **Tooling:** esbuild code-split build, ESLint, Prettier, tsc JSDoc type checking, node:test unit tests, Playwright smoke tests (Chromium Android and WebKit iPhone), a Lighthouse script and a GitHub Actions workflow.
