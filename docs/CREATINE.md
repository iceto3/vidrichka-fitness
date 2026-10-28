# Креатин в храните (1.4.2)

Видричка показва дневния креатин в **Храна** (денят): сумата от вградените меса и риби, за
които има данни, плюс **Добавка креатин** (по подразбиране 3 г, може да се промени).
Всяка друга храна – собствени храни, продукти от баркод/Open Food Facts, записи с глас,
колбаси и ястия – се брои като **0 (неизвестно)**. Нищо не е измислено: стойностите идват
от публикувани измервания и едно правило за всички редове.

Кодът: `src/data/creatine.js` (данни и правило), `src/features/food/creatine.js` (сума за деня),
тестове в `tests/unit/v142.test.js`.

## Правило

```
мг/100 г = референция за вида (сурово) × (протеин на реда / протеин на референцията) × запазване
запазване: сурово 1 · готвено (скара, варено, пържено, панирано) 0,75 · консерва 0,70
```

- Креатинът е в мускулната тъкан, затова се мащабира по протеина на реда: по-тлъстата кайма
  има по-малко, а готвеното месо (загубило вода) – повече на 100 г; панировката разрежда.
- При готвене част от креатина изтича в соковете и част се превръща в креатинин:
  треска губи 22–32 % (Larsen 2007), говеждо – по-малко креатин след готвене (Purchas 2004),
  затова 0,75. При стерилизация на консерви (115 °C) около една четвърт става креатинин
  (Hughes 1960) → 0,70.

## Референции (сурово, мг/100 г)

| Вид                       | мг/100 г        | Протеин г/100 г | Източници                                                                                                                       |
| ------------------------- | --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| говеждо (beef)            | 420             | 21              | Harris 1997: ≈ 30 mmol/kg ≈ 393 мг/100 г; Balsom 1994: 4,5 г/кг                                                                 |
| свинско (pork)            | 500             | 21              | Balsom 1994: 5 г/кг; Balestrino & Adriano 2019 (обзор)                                                                          |
| пилешко (chicken)         | 400             | 22,5            | Harris 1997: ≈ 393 мг/100 г; Balestrino & Adriano 2019                                                                          |
| пуешко (turkey)           | 400             | 23,7            | **оценка**: като пилешко (няма отделно измерване за пуешко)                                                                     |
| сьомга (salmon)           | 450             | 20              | Balsom 1994: 4,5 г/кг; Wuertz & Reiser (Rev Aquacult)                                                                           |
| риба тон (tuna)           | 400             | 24,4            | Balsom 1994: 4 г/кг; Wuertz & Reiser: 2,7–6,5 г/кг                                                                              |
| треска / бяла риба (cod)  | 300             | 18              | Balsom 1994: 3 г/кг; Wuertz & Reiser: 3–4,4 г/кг                                                                                |
| херинга (herring)         | 650             | 18              | Balsom 1994: 6,5–10 г/кг (долната граница); **Hughes 1960 дава 3,5–4,2 г/кг**                                                   |
| скариди (shrimp)          | 70              | 20,1            | Wuertz & Reiser: ≈ 0,7 г/кг                                                                                                     |
| дроб (liver)              | 30              | 20,4            | Harris 1997: телешки дроб 2,3 mmol/kg (**оценка** за пилешки дроб)                                                              |
| друга риба (fish)         | 388             | 20              | NHANES метод: 3,88 г/кг за месо, птици и риба (Bakian 2020; Ostojic 2021, Nutrition) – скумрия, пъстърва, лаврак, сардини, цаца |
| кайма 60/40, 50/50, 75/25 | 468 / 460 / 480 | 21              | претеглено свинско + говеждо                                                                                                    |

Протеинът на референциите е от USDA SR (сурово).

## Стойности в приложението

| id                     | Храна                                      | Вид     | Състояние | Протеин г/100 г | Креатин мг/100 г |
| ---------------------- | ------------------------------------------ | ------- | --------- | --------------- | ---------------- |
| chicken_breast         | Пилешко филе (на скара)                    | chicken | cooked    | 31              | 413              |
| chicken_thigh          | Пилешко бутче (на скара)                   | chicken | cooked    | 26              | 347              |
| turkey_breast          | Пуешко филе (на скара)                     | turkey  | cooked    | 30              | 380              |
| beef_steak             | Телешки стек (на скара)                    | beef    | cooked    | 26              | 390              |
| minced_beef            | Телешка кайма 90/10 (сурова)               | beef    | raw       | 20              | 400              |
| minced_mixed           | Кайма смес 60/40 (свинско/телешко, сурова) | mix60   | raw       | 17.6            | 392              |
| minced_mixed_50        | Кайма смес 50/50 (свинско/телешко, сурова) | mix50   | raw       | 17.8            | 390              |
| minced_mixed_75        | Кайма смес 75/25 (свинско/телешко, сурова) | mix75   | raw       | 17.3            | 395              |
| pork_loin              | Свинско филе (на скара)                    | pork    | cooked    | 26              | 464              |
| pork_chop              | Свинска пържола (на скара)                 | pork    | cooked    | 29.2            | 521              |
| salmon                 | Сьомга (сурова)                            | salmon  | raw       | 20              | 450              |
| tuna_can               | Риба тон в собствен сос                    | tuna    | canned    | 26              | 298              |
| cod                    | Треска (сурова)                            | cod     | raw       | 18              | 300              |
| mackerel               | Скумрия (сурова)                           | fish    | raw       | 19              | 369              |
| trout                  | Пъстърва (сурова)                          | fish    | raw       | 20              | 388              |
| sea_bass               | Лаврак (суров)                             | fish    | raw       | 18              | 349              |
| shrimp                 | Скариди                                    | shrimp  | cooked    | 24              | 63               |
| sardines               | Сардини (консерва)                         | fish    | canned    | 25              | 340              |
| chicken_wings          | Пилешки крилца (на скара)                  | chicken | cooked    | 30              | 400              |
| liver_chicken          | Пилешки дробчета (сурови)                  | liver   | raw       | 17              | 25               |
| chicken_breast_raw     | Пилешко филе (сурово)                      | chicken | raw       | 22.5            | 400              |
| chicken_thigh_raw      | Пилешко бутче без кожа (сурово)            | chicken | raw       | 19.7            | 350              |
| turkey_breast_raw      | Пуешко филе (сурово)                       | turkey  | raw       | 23.7            | 400              |
| pork_loin_raw          | Свинско филе (сурово)                      | pork    | raw       | 21              | 500              |
| beef_raw               | Телешко месо, постно (сурово)              | beef    | raw       | 21              | 420              |
| minced_beef_80         | Телешка кайма 80/20 (сурова)               | beef    | raw       | 17.2            | 344              |
| salmon_grilled         | Сьомга (на скара)                          | salmon  | cooked    | 22.1            | 373              |
| chicken_breast_boiled  | Пилешко филе (варено)                      | chicken | cooked    | 29              | 387              |
| chicken_breast_breaded | Пилешко филе (панирано)                    | chicken | cooked    | 22              | 293              |
| chicken_breast_fried   | Пилешко филе (пържено)                     | chicken | cooked    | 33.4            | 445              |
| chicken_thigh_boiled   | Пилешко бутче (варено)                     | chicken | cooked    | 25              | 333              |
| chicken_thigh_breaded  | Пилешко бутче (панирано)                   | chicken | cooked    | 21.6            | 288              |
| chicken_thigh_fried    | Пилешко бутче (пържено)                    | chicken | cooked    | 28.2            | 376              |
| turkey_breast_breaded  | Пуешко филе (панирано)                     | turkey  | cooked    | 19              | 241              |
| turkey_breast_fried    | Пуешко филе (пържено)                      | turkey  | cooked    | 29              | 367              |
| pork_chop_boiled       | Свинско (варено)                           | pork    | cooked    | 29              | 518              |
| pork_chop_breaded      | Свинска пържола (панирана)                 | pork    | cooked    | 21              | 375              |
| pork_chop_fried        | Свинска пържола (пържена)                  | pork    | cooked    | 26.9            | 480              |
| beef_boiled            | Телешко (варено)                           | beef    | cooked    | 30              | 450              |
| beef_breaded           | Телешки шницел (паниран)                   | beef    | cooked    | 18              | 270              |
| beef_fried             | Телешки стек (пържен)                      | beef    | cooked    | 27              | 405              |
| fish_white_boiled      | Бяла риба (варена)                         | cod     | cooked    | 22.8            | 285              |
| fish_breaded           | Панирана риба (хек/треска)                 | cod     | cooked    | 17              | 213              |
| fish_fried             | Бяла риба (пържена)                        | cod     | cooked    | 20              | 250              |
| salmon_fried           | Сьомга (пържена)                           | salmon  | cooked    | 22              | 371              |
| mackerel_fried         | Скумрия (пържена)                          | fish    | cooked    | 21              | 306              |
| trout_fried            | Пъстърва (пържена)                         | fish    | cooked    | 22              | 320              |
| sprat_fried            | Цаца (пържена)                             | fish    | cooked    | 18              | 262              |
| herring                | Херинга (сурова)                           | herring | raw       | 18              | 650              |

Без данни (броят се 0): шунка, бекон, луканка, наденица, кебапче, кюфте и др. колбаси и
ястия (делът месо и обработката варират твърде много), яйца, мляко и млечни, растителни храни
(креатин практически няма), собствени и онлайн продукти.

## Източници

1. Harris RC, Lowe JA, Warnes K, Orme CE. _The concentration of creatine in meat, offal and commercial dog food._ Res Vet Sci 1997;62(1):58–62. doi:10.1016/S0034-5288(97)90181-8
2. Balsom PD, Söderlund K, Ekblom B. _Creatine in humans with special reference to creatine supplementation._ Sports Med 1994;18(4):268–280. doi:10.2165/00007256-199418040-00005
3. Balestrino M, Adriano E. _Beyond sports: Efficacy and safety of creatine supplementation in pathological or paraphysiological conditions of brain and muscle._ Med Res Rev 2019;39(6):2427–2459. doi:10.1002/med.21590
4. Wuertz S, Reiser S. _Creatine: A valuable supplement in aquafeeds?_ Rev Aquacult (online 2022). doi:10.1111/raq.12717
5. Bakian AV, Huber RS, Scholl L, Renshaw PF, Kondo D. _Dietary creatine intake and depression risk among U.S. adults._ Transl Psychiatry 2020;10:52. doi:10.1038/s41398-020-0741-x
6. Ostojic SM. _Dietary creatine intake in U.S. population: NHANES 2017–2018._ Nutrition 2021;87–88:111207. doi:10.1016/j.nut.2021.111207 (3,88 г/кг за месо, птици и риба, по метода на Bakian 2020)
7. Larsen R, Stormo SK, Dragnes BT, Elvevoll EO. _Losses of taurine, creatine, glycine and alanine from cod (Gadus morhua L.) fillet during processing._ J Food Compos Anal 2007;20:396–402. doi:10.1016/j.jfca.2006.10.001
8. Purchas RW, Rutherfurd SM, Pearce PD, Vather R, Wilkinson BHP. _Cooking temperature effects on the forms of iron and levels of several other compounds in beef semitendinosus muscle._ Meat Sci 2004;68(2):201–207. doi:10.1016/j.meatsci.2004.02.018
9. Hughes RB. _Chemical studies on the herring (Clupea harengus). IV. — Creatine in herring flesh, and its behaviour during heat processing._ J Sci Food Agric 1960;11(12):700–705. doi:10.1002/jsfa.2740111204

## Несигурности

- Херинга: източниците се разминават (3,5–4,2 срещу 6,5–10 г/кг); взета е долната граница на Balsom.
- Пуешко и пилешки дроб са оценки по близък вид.
- Запазването при готвене (0,75) е средно; реалната загуба зависи от начина и времето.
