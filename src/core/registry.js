/**
 * Central registries. Features *register* their tabs, routes, badges, quests and
 * progress sub-tabs here, so adding a feature never requires editing another one.
 * @module core/registry
 */

/**
 * @typedef {object} Tab
 * @property {string} id
 * @property {string} icon     Icon name from ui/icons.
 * @property {string} label    i18n key.
 * @property {string} path     Route path the tab opens.
 * @property {number} order    Sort order in the bottom nav.
 */

/**
 * @typedef {object} View
 * @property {() => string|import('../ui/dom.js').Safe} render Returns the HTML for the view.
 * @property {Record<string, (el: HTMLElement, ev: Event) => any>} [actions] `data-act` handlers.
 * @property {(root: HTMLElement) => void} [mount]   Called after first render.
 * @property {() => void} [unmount]                  Called when leaving.
 * @property {string} [tab]                          Highlighted bottom-nav tab id.
 * @property {boolean} [hideNav]                     Hide the bottom nav.
 */

/**
 * @typedef {object} Route
 * @property {string} pattern  e.g. `workouts/plan/:id`.
 * @property {(params: Record<string,string>) => Promise<View>|View} load Lazy view factory.
 */

/**
 * @typedef {object} Badge
 * @property {string} id
 * @property {string} label   i18n key.
 * @property {string} icon    Icon name or short text (e.g. "10").
 * @property {string} color   CSS background.
 * @property {(ctx: any) => boolean} earned Pure predicate on the stats context.
 */

/**
 * @typedef {object} Quest
 * @property {string} id
 * @property {string} label  i18n key.
 * @property {number} xp
 * @property {(ctx: any) => boolean} [show]     Whether to offer the quest today.
 * @property {(ctx: any) => boolean} done       Completed today?
 * @property {(ctx: any) => string} [detail]    Optional progress text.
 * @property {string} [go]                      Route to open when tapped.
 * @property {(ctx: any) => QuestState} [state] 1.4.3: graded quest – overrides `done`/`xp` for today
 * @property {'daily'|'weekly'|'monthly'} [section] 1.4.3 (part B): Home section and reset period (default daily).
 * @property {string[]} [was]   1.4.3 (part B): older ids of this quest (their XP this period counts).
 * @property {boolean} [bar]    1.4.3 (part B): show `detail` as a progress bar.
 * @property {string} [unit]    1.4.3 (part B): i18n key of the unit after n/goal.
 * @property {number} [order]   Sort order.
 */

/**
 * @typedef {object} QuestState
 * @property {boolean} done    Ticked.
 * @property {number} xp       XP it gives in this state (0 when missed).
 * @property {boolean} [missed] Can no longer be done today (greyed „пропуснато“, no XP).
 * @property {number} [lateMin] Ticked late: shown as „+N мин“.
 * @property {string} [note]  1.4.3 (part B): i18n key of a short note next to the label (e.g. „непълна“).
 */

/** @type {{tabs: Tab[], routes: Route[], badges: Badge[], quests: Quest[], progressTabs: any[], settings: any[]}} */
export const registry = { tabs: [], routes: [], badges: [], quests: [], progressTabs: [], settings: [] };

/**
 * Register items into a named registry; arrays are kept sorted by `order` when present.
 * @template T
 * @param {keyof typeof registry} kind
 * @param {...T} items
 */
export function register(kind, ...items) {
  const list = /** @type {any[]} */ (registry[kind]);
  list.push(...items);
  list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
