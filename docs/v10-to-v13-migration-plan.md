# LMRTFY v10 → v13 Migration Plan

## Context

LMRTFY ("Let Me Roll That For You! — Pikipoo's extra") is a multi-system Foundry VTT module that lets the GM request ability/skill/save rolls from players. It is pinned to Foundry core v10 (`module.json:22-27`). Between v10 and v13 Foundry deprecated AppV1 (`Application`, `FormApplication`), removed jQuery from the application rendering pipeline, moved the utility functions off of `globalThis` into `foundry.utils`, changed the `getSceneControlButtons` hook payload from an array to an object, and promoted `actor.system` as the canonical data path. This plan lets a developer take the module from v10 to v13 in staged, verifiable phases without rewriting the system-switch core.

## Summary

- **Current:** AppV1 + jQuery + global utils + v10-era scene-controls array + `actor.data.data`; `minimumCoreVersion`/`compatibleCoreVersion` still set to `"10"`.
- **Target:** ApplicationV2 + `HandlebarsApplicationMixin`, native DOM, `foundry.utils.*`, object-keyed scene controls, `actor.system`, `compatibility.{minimum:"13", verified:"13"}`.
- **Scope of breakage:** Two UI classes rewrite (`LMRTFYRequestor`, `LMRTFYRoller`), one scene-controls hook shape change (`LMRTFY.getSceneControlButtons`), ~10 global-utility call-sites, 3 `actor.data.data` access sites, 1 hook name (`renderChatMessage`, likely renamed — see "Needs manual verification"). All system branches in `LMRTFY.ready` remain but each one's downstream actor-roll API must be re-verified against the target system's v13 release.
- **No build system is introduced.** Scripts are still loaded directly per `module.json` per the repo's convention (CLAUDE.md).

---

## module.json changes

Reference file: `module.json` (lines referenced below).

| Field | Current (line) | Target | Reason |
|---|---|---|---|
| `minimumCoreVersion` | `"10"` (22) | **remove** (legacy v8 field) | Superseded by `compatibility.minimum`. Cite: Foundry VTT wiki, `/development/guides/local-to-repo` (Context7: `/websites/foundryvtt_wiki_en_development`). |
| `compatibleCoreVersion` | `"10"` (23) | **remove** (legacy v8 field) | Superseded by `compatibility.verified`. Cite: wiki, `/development/guides/releases-and-history`. |
| `compatibility.minimum` | `"10"` (25) | `"13"` | v13 is the new floor. |
| `compatibility.verified` | `"10"` (26) | `"13"` (bump to the exact build tested, e.g. `"13.346"`) | Cite: wiki, `/development/guides/SD-tutorial/SD03-systemjson`. |
| `compatibility.maximum` | absent | *leave unset* unless breakage in a future build is confirmed | Cite: same source — maximum should be blank unless incompatibility is proven. |
| `relationships.systems[*].compatibility.verified` | frozen at v10-era releases (lines 98, 110, 118, 126, 138, 146, 154, 162, 170, 178, 186, 194, 202) | bump to each system's current v13-compatible release (see per-system table below) | Foundry users will see warnings if the verified system version is behind. |
| `systems` array (75–90) | 14 entries | keep; optionally drop any system that has not shipped a v13 release (see per-system table) | Preserve user compatibility expectations. |
| `scripts` (14–18) | 3 entries | unchanged | No ESModules migration is in scope. |
| `styles` (19–21) | `"/css/lmrtfy.css"` | unchanged | No CSS removal required; AppV2 retains `.window-content`/`.form-group` hooks. |
| `socket` (207) | `true` | unchanged | Socket channel `module.lmrtfy` remains. |

---

## Per-file migration

### `src/lmrtfy.js` (main entry, system switch, socket, scene controls)

| v10 API | v13 replacement | file:line | Risk | Notes |
|---|---|---|---|---|
| `Hooks.once('init', ...)` | same | 487 | low | API stable. |
| `Hooks.on('ready', ...)` | same | 488 | low | API stable. |
| `Hooks.on('getSceneControlButtons', buttons)` **array mutation** | `Hooks.on('getSceneControlButtons', controls)` **object keyed by name** | 416–429, 489 | **high** | v13 changed this hook's payload. Code currently does `buttons.find(b => b.name === "token")` and `tokenButton.tools.push(...)` — must become `controls.tokens.tools["request-roll"] = {...}` (property assignment) per wiki `/development/api/canvas`. |
| `Hooks.on('renderChatMessage', ...)` | **Uncertain:** likely `renderChatMessageHTML` in v13 with HTMLElement (not jQuery) | 490 | **med** | Wiki confirms jQuery removed in v13 rendering; exact hook rename must be confirmed against the v13 changelog. Handler `hideBlind` (444–454) already reads `msg.message.flags.lmrtfy` which is fine; only the argument type (HTMLElement vs jQuery) may change. See "Needs manual verification". |
| `game.socket.on('module.lmrtfy', ...)` | same | 73 | low | Socket API unchanged. |
| `game.settings.register(...)` × 4 | same | 3–43 | low | Wiki `/development/api/settings` confirms `register` signature is unchanged; `requiresReload: true` is available. |
| Handlebars.registerHelper × 3 | same | 45, 54, 62 | low | Handlebars API unchanged. |
| `duplicate(CONFIG.DL.attributes)` | `foundry.utils.duplicate(...)` or `structuredClone(...)` | 179 | low | Global `duplicate` deprecated per wiki `/development/api/helpers` ("global calls are deprecated"). |
| `isNewerVersion(mod.version, "10.0.26")` | `foundry.utils.isNewerVersion(...)` | 329 | low | Same deprecation; wiki `/development/api/helpers` shows the namespaced form. |
| `CONFIG.DND5E.abilities` iteration | re-verify keys against each system's current release | 363–369 | med | Key shapes can drift across system majors. |
| `fromUuid` custom parser using `CONFIG[docName].collection.instance` + `doc.getEmbeddedDocument(...)` | Prefer native `fromUuid(uuid)` (async) in v13 | 456–482 | med | The module rolls its own parser. Native `fromUuid` supports most shapes; keep the custom path only if a corner case needs it. |
| `canvas.tokens.releaseAll()` | same | 335 | low | Canvas API stable. |
| `game.system.id` switch (all cases 75–302) | same | 75–302 | low (core) / med–high (per system, see regression table) | Switch itself is fine; each `case` needs per-system re-verification. |

### `src/requestor.js` (GM-side FormApplication)

| v10 API | v13 replacement | file:line | Risk | Notes |
|---|---|---|---|---|
| `class LMRTFYRequestor extends FormApplication` | `class LMRTFYRequestor extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2)` | 3 | **high** | Full AppV2 rewrite — see dedicated section. |
| `static get defaultOptions()` with `id/title/template/width/height/classes` + conditional template path | `static DEFAULT_OPTIONS = { classes, tag:'form', position:{width,height}, window:{title}, form:{handler, closeOnSubmit, submitOnChange}, actions }` and `static PARTS = { form:{ template: <conditional path> } }` | 26–57 | **high** | Title resolution and per-system template choice (28–42) move into `PARTS` or a dynamic override of `_configureRenderParts`. Confirm dynamic part paths — see "Needs manual verification". |
| `async getData()` | `async _prepareContext(options)` | 59–122 | **high** | Signature change; return the same context object. Cite: wiki `/development/guides/converting-to-appv2`. |
| `activateListeners(html)` with jQuery | `_onRender(context, options)` using `this.element.querySelector(...)` | 133–147 | **high** | jQuery removed. Most click handlers should migrate to AppV2 `actions: { <dataAction>: handler }` where the markup exposes `data-action="..."`; non-click listeners stay in `_onRender`. |
| `render(force, context)` override that inspects `context.action/data` | Override `render(options)` accepting the same shape, forwarding to `super.render(options)` | 124–131 | med | AppV2 accepts `options` (object or boolean). Custom semantics should be preserved; inspect the forwarded second arg. |
| `_updateObject(event, formData)` socket emit logic | `static async #onSubmitForm(event, form, formData)` registered via `DEFAULT_OPTIONS.form.handler` | 337–477 | **high** | `formData` is `FormDataExtended`; inside the handler use `formData.object`. `this` inside a static handler is bound to the application instance. |
| `game.actors.entities \|\| game.actors.contents` fallback | `game.actors` (iterate) or `game.actors.contents` | 61, 169, 181, 188 | low | `.entities` was removed long before v13; the fallback is dead code. |
| `game.users.entities \|\| game.users.contents` | `game.users` or `.contents` | 62, 169, 181 | low | Same. |
| `a.testUserPermission(user, "OWNER")` | same | 189 | low | API stable. |
| `ui.notifications.warn/info` | same | 367, 380, 475 | low | Stable. |
| `game.socket.emit('module.lmrtfy', socketData)` | same | 462, 472 | low | Stable. |
| `Macro.create({...})` + `macro.sheet.render(true)` | `Macro.create({...})` still exists; confirm macro-sheet render call still uses v1 sheet | 463–470 | med | Core Macro sheet in v13 may be AppV2-based; `.render(true)` still works. |
| `CONFIG.Dice.rollModes` | same | 117 | low | Stable. |

### `src/roller.js` (player-side Application)

| v10 API | v13 replacement | file:line | Risk | Notes |
|---|---|---|---|---|
| `class LMRTFYRoller extends Application` | `class LMRTFYRoller extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2)` | 1 | **high** | Full AppV2 rewrite — see dedicated section. |
| `static get defaultOptions()` | `static DEFAULT_OPTIONS` + `static PARTS = { body: { template: "modules/lmrtfy/templates/roller.html" } }` | 85–97 | **high** | Standard conversion. |
| `async getData()` | `async _prepareContext(options)` | 133–192 | **high** | Signature change only. |
| `activateListeners(html)` with jQuery | `_onRender(context, options)` + `DEFAULT_OPTIONS.actions` | 194 (and all `_on*` handlers 588–767) | **high** | Most handlers (`_onAbilityCheck`, `_onSaveCheck`, `_onSkillCheck`, `_onFail*`, `_onInitiative`, `_onDeathSave`, `_onPerception`) correspond to buttons — remap to `actions: { abilityCheck: LMRTFYRoller.prototype._onAbilityCheck, ... }` and add matching `data-action` attributes in `templates/roller.html`. |
| `mergeObject(options, {...}, {inplace:false})` × 3 | `foundry.utils.mergeObject(...)` | 102, 113, 124, 497 | low | Namespace migration. |
| `setProperty(chatData, "flags.lmrtfy", {...})` | `foundry.utils.setProperty(...)` | 573 | low | Namespace migration. |
| `isNewerVersion(...)` | `foundry.utils.isNewerVersion(...)` | 43 | low | Namespace migration. |
| `actor.data.data.abilities[ability].value` | `actor.system.abilities[ability].value` | `src/lmrtfy.js:434` (pf2e `AbilityModifier.fromScore` call inside the switch) | med | v10→v11 data model unification. |
| `actor.data.data.attributes.initiative` | `actor.system.attributes.initiative` | 406 | med | Same. |
| `actor.data.data.skills[initiative.ability]` | `actor.system.skills[initiative.ability]` | 412 | med | Same. |
| `actor.getRollData()` | same | 489 | low | API stable. |
| `new Roll(formula, rollData).toMessage({...}, {...}, options)` | same | 490–491 | low | `Roll` API stable across 10→13 (wiki `/development/api/roll`). |
| `ChatMessage.getSpeaker`, `ChatMessage.getWhisperRecipients`, `ChatMessage.create` (batch) | same | 487, 561, 568, 514, 578 | low | Stable. |
| `candidate.updateSource({"flags.lmrtfy": {...}})` inside `preCreateChatMessage` handler | same | 427 | low | `updateSource` is the v10+ canonical API. |
| `game.tables.getName(...)`, `rollTable.draw({displayChat:false})` | same | 533, 537 | low | RollTable API stable. |
| `CONFIG.Combat.initiative.formula \|\| game.system.data.initiative` | **Uncertain:** `game.system.data` may be renamed; prefer `CONFIG.Combat.initiative.formula` with `game.system.initiative` as fallback | 689 | med | See "Needs manual verification". |
| `game.pf2e.Check.roll(...)`, `game.pf2e.StatisticModifier(...)`, `actor.saves[key].check.roll(...)`, `actor.system.skills[key].roll(...)`, `actor.perception.roll(...)`, `actor.getRollOptions(...)` | **pf2e-specific, version-bound** | 301–322, lmrtfy.js:441 | **high** | pf2e's public API churns between majors; verify against the chosen pf2e release (see per-system table). |
| demonlord `actor.rollAttributeChallenge(...)` | **demonlord-specific** | 361–367 | **high** | Verify against the target demonlord v13 release. |
| wfrp4e `actor.setupCharacteristic(key, {fields, skipTargets})` | **wfrp4e-specific** | 378 | **high** | Verify against the target wfrp4e v13 release. |

---

## AppV1 → AppV2 conversion (detailed)

Pattern source: Foundry VTT wiki — `/development/guides/converting-to-appv2`, `/development/guides/applicationV2-conversion-guide`, `/development/api/applicationv2` (Context7 library: `/websites/foundryvtt_wiki_en_development`).

### `LMRTFYRequestor` — was `FormApplication`

**Class**

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class LMRTFYRequestor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "lmrtfy",
    classes: ["lmrtfy", "lmrtfy-requestor"], // + 'lmrtfy-parchment' when setting enabled — add in constructor / _configureRenderOptions
    tag: "form",
    position: { width: 600, height: "auto" },
    window: { title: "LMRTFY.Title", resizable: true },
    form: {
      handler: LMRTFYRequestor.#onSubmitForm,
      closeOnSubmit: false,   // requestor can emit and stay open; current _updateObject does not force close
      submitOnChange: false,
    },
    actions: {
      // map each data-action in request-rolls.html to a method; wire from activateListeners
    },
  };

  static PARTS = {
    form: { template: LMRTFYRequestor.#resolveTemplate() },
  };

  static #resolveTemplate() {
    switch (game.system.id) {
      case "degenesis":  return "modules/lmrtfy/templates/degenesis-request-rolls.html";
      case "demonlord":  return "modules/lmrtfy/templates/demonlord-request-rolls.html";
      case "wfrp4e":     return "modules/lmrtfy/templates/wfrp4e-request-rolls.html";
      default:           return "modules/lmrtfy/templates/request-rolls.html";
    }
  }
}
```

- **`getData()` → `_prepareContext(options)`** (wiki `/development/guides/converting-to-appv2`). Body is a 1:1 port of `src/requestor.js:59-122` — just rename and return the same object.
- **`activateListeners(html)` → `_onRender(context, options)` + `DEFAULT_OPTIONS.actions`**. The jQuery handlers at 133–147 fall into two buckets:
  - Click handlers on buttons/checkboxes: give the template elements `data-action="<name>"` and put the handler name into `DEFAULT_OPTIONS.actions`. AppV2 binds them automatically.
  - Hover / change / custom DOM-mutation handlers: keep them, but rewrite with `this.element.querySelector(...)` + `addEventListener` inside `_onRender`.
- **`_updateObject(event, formData)` → `static async #onSubmitForm(event, form, formData)`**. The contents at 337–477 port directly — `this` is still the application instance. Remember `formData` is `FormDataExtended`; read fields off `formData.object`.
- **`render(force, context)` override (124–131)** — in AppV2, `render(options)` accepts either a boolean or an options object. Preserve custom semantics by inspecting `options?.action` / `options?.data` on the way in.
- **`close()`**: still async; no signature change expected.

**Template changes**

- `templates/request-rolls.html`, `templates/demonlord-request-rolls.html`, `templates/wfrp4e-request-rolls.html`, `templates/degenesis-request-rolls.html` — each currently contains a top-level `<form onsubmit="event.preventDefault()">`. With `tag: "form"` in `DEFAULT_OPTIONS`, the application's root element **is** the `<form>` — remove the outer `<form>` tag to avoid a nested form and strip `onsubmit="event.preventDefault()"` (the `form.handler` path handles this).
- Add `data-action="<name>"` attributes on every element that was previously hooked via `html.find(...).click(...)` so the `actions` map takes over.
- Handlebars helpers (`lmrtfy-controlledToken`, `lmrtfy-showTokenImage`, `lmrtfy-isdemonlord`) stay as-is — they are registered in `src/lmrtfy.js:45-68`.
- `{{localize ...}}`, `{{#each}}`, `{{#if}}` are unchanged between v10 and v13.

**Per-system template branching rework**

Dynamic `PARTS.form.template` works at class-load time (see `#resolveTemplate` above). If Foundry loads the script before `game.system` is populated, resolve lazily by overriding `_configureRenderParts(options)` — see "Needs manual verification" for exact method name.

### `LMRTFYRoller` — was `Application`

**Class**

```js
class LMRTFYRoller extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "lmrtfy-roller",
    classes: ["lmrtfy", "lmrtfy-roller"], // + 'lmrtfy-parchment' when setting enabled
    position: { width: 500, height: "auto" },
    window: { title: "LMRTFY.Title", resizable: true },
    actions: {
      abilityCheck:       LMRTFYRoller.prototype._onAbilityCheck,
      failAbilityCheck:   LMRTFYRoller.prototype._onFailAbilityCheck,
      saveCheck:          LMRTFYRoller.prototype._onSaveCheck,
      failSaveCheck:      LMRTFYRoller.prototype._onFailSaveCheck,
      skillCheck:         LMRTFYRoller.prototype._onSkillCheck,
      failSkillCheck:     LMRTFYRoller.prototype._onFailSkillCheck,
      initiative:         LMRTFYRoller.prototype._onInitiative,
      deathSave:          LMRTFYRoller.prototype._onDeathSave,
      perception:         LMRTFYRoller.prototype._onPerception,
      rollDice:           LMRTFYRoller.prototype._onDiceRoll,
      drawTable:          LMRTFYRoller.prototype._onDrawTable,
    },
  };

  static PARTS = {
    body: { template: "modules/lmrtfy/templates/roller.html" },
  };
}
```

- **`getData()` → `_prepareContext`** — rename only.
- **`activateListeners` → `_onRender` + `actions`** — every `_on*` method in `src/roller.js:588-767` becomes an entry in the `actions` map; add `data-action="<name>"` on the corresponding button in `templates/roller.html`. Non-button listeners (e.g. the disable-opposite-button logic in `_disableButtons`, lines 227–259) stay in `_onRender` and use `this.element.querySelector`/`.querySelectorAll`.
- **Static request entrypoints `requestAbilityChecks` / `requestSkillChecks` / `requestSavingThrows`** (99–131): keep as-is; just swap `mergeObject` → `foundry.utils.mergeObject`.
- **Constructor Handlebars helpers** (`canFailAbilityChecks`, `canFailSaveChecks`, `canFailSkillChecks`, 45–82): these are fine to keep but note that registering helpers from a constructor runs once per instance; prefer registering once at module init to avoid re-registrations if the roller is opened repeatedly.
- **`close()`/`render()`**: same as Requestor — preserve `_checkClose` semantics (221–225) by calling `this.close()` inside the action handlers.

**Template changes**

- `templates/roller.html` — no outer `<form>` is needed. Add `data-action="..."` to the buttons that previously used `.click()` bindings.
- Custom helpers `lmrtfy-controlledToken`, `lmrtfy-isdemonlord` unchanged.

---

## Per-system regression risk

For each system declared in `module.json`, I mark the most likely break point. **Cells marked *needs manual verification* must be confirmed by loading the target system in a v13 world before shipping.**

| System id | Has v13 release? | Highest-risk call | File:line | Notes |
|---|---|---|---|---|
| `dnd5e` | *needs manual verification* — dnd5e maintainers ship regular v13-compatible updates; confirm the exact minor | `actor.rollAbilitySave/rollAbilityTest/rollSkill` + the overridden event structure `{ fastForward, advantage, disadvantage }` | lmrtfy.js:76–93, 305–309 | The event-shape override was a dnd5e-specific workaround; verify its current signature. |
| `dnd5eJP` | *needs manual verification* (translation fork) | same as dnd5e | 76–93 | Will track dnd5e's v13 support. |
| `sw5e` | *needs manual verification* | same as dnd5e | 76–93 | sw5e historically tracks dnd5e tightly. |
| `pf1` | *needs manual verification* | `rollSavingThrow/rollAbility/rollSkill` | 95–110 | pf1 has been active; verify the target major. |
| `pf2e` | *needs manual verification* — **high churn** | `game.pf2e.Check.roll`, `StatisticModifier` constructor, `actor.saves[key].check.roll`, `actor.system.skills[key].roll`, `actor.perception.roll`, `actor.getRollOptions` | roller.js:301–322, lmrtfy.js:441 | pf2e rewrote its roll pipeline multiple times between v10 and v13. Expect most remediation effort to land here. |
| `D35E` | *needs manual verification* | `rollSave/rollAbility/rollSkill`; CSS includes D35E-specific rules (css/lmrtfy.css:279–429) | lmrtfy.js:129–144 | D35E update cadence is irregular. |
| `cof` | *needs manual verification* | `rollStat` (used for abilities, skills, and saves) | 146–160 | Niche system; verify release channel. |
| `coc` | *needs manual verification* | `rollStat` | 162–176 | Same. |
| `demonlord` | *needs manual verification* — **high risk** | `actor.rollAttributeChallenge`, custom roll template, `duplicate(CONFIG.DL.attributes)` | lmrtfy.js:178–195; roller.js:357–373 | Dedicated template (`demonlord-request-rolls.html`) + bespoke call signature. |
| `ose` | *needs manual verification* | `rollSave/rollCheck/rollExploration` | 197–214 | OSE has been actively maintained; verify. |
| `foundry-chromatic-dungeons` | *needs manual verification* — **likely stale** | Custom `actor.attributeRoll/saveRoll` + `actor.system.data` access | lmrtfy.js:216–226; roller.js:329–348 | Low-traffic system; may not have a v13 release. The `actor.system.data` path is suspicious — the "data.data" era is over in v13. |
| `degenesis` | *needs manual verification* — **likely stale** | `game.actors.contents[0].skills` dynamic introspection; dedicated template | lmrtfy.js:228–240; roller.js:351–355 | Degenesis at 0.5.x was verified two years ago; may be unmaintained. |
| `ffd20` | *needs manual verification* | same shape as pf1 | 242–255 | Tracks pf1; verify. |
| `dcc` | *needs manual verification* | `rollSavingThrow/rollAbilityCheck/rollSkillCheck` | 257–279 | `dcc` is in `LMRTFY.ready` switch and `relationships.systems` (module.json:190) but absent from the `systems` array (75–90) — add it there if DCC support is intended to be visible to the installer. |
| `wfrp4e` | *needs manual verification* — **high churn** | `actor.setupCharacteristic` with bespoke options shape | lmrtfy.js:281–297; roller.js:376–386 | wfrp4e has an unusual roll pipeline; verify. |

**Recommendation:** Before shipping, gate each system case behind a `game.system.version` check using `foundry.utils.isNewerVersion` and log a clear console warning when an unverified version is loaded — this turns silent breakage into actionable feedback.

---

## Staged execution plan

### Phase 1 — Compatibility metadata and global-util/data-path shims

Scope:
- Edit `module.json`: remove `minimumCoreVersion`/`compatibleCoreVersion`, bump `compatibility.{minimum,verified}` to `"13"`, refresh `relationships.systems[*].compatibility.verified` to each system's currently shipped version (or remove unmaintained ones — defer deletion decisions to a human review after loading them in v13).
- Replace global utilities with `foundry.utils.*`:
  - `duplicate(...)` → `foundry.utils.duplicate(...)` (lmrtfy.js:179)
  - `isNewerVersion(...)` → `foundry.utils.isNewerVersion(...)` (lmrtfy.js:329, roller.js:43)
  - `mergeObject(...)` → `foundry.utils.mergeObject(...)` (roller.js:102, 113, 124, 497)
  - `setProperty(...)` → `foundry.utils.setProperty(...)` (roller.js:573)
- Fix `actor.data.data` → `actor.system`:
  - lmrtfy.js:434 (pf2e `AbilityModifier.fromScore` call)
  - roller.js:406 and :412 (pf2e initiative)
- Drop the `.entities || .contents` fallback in `src/requestor.js:61, 62, 169, 181, 188` — simplify to direct `.contents` or direct iteration.
- Fix `getSceneControlButtons` hook shape (lmrtfy.js:416–429): switch from array-push to object-property assignment on `controls.tokens.tools`.
- **Uncertain:** rename `renderChatMessage` → `renderChatMessageHTML` (lmrtfy.js:490) **if** v13 renamed it; keep both registrations during the transition with a feature-detect (`CONFIG.Hooks?.renderChatMessageHTML`) if unsure.

**Done when:** the module loads in a Foundry v13 world without deprecation warnings at boot; the scene-controls button appears; no runtime errors in the console during `init`/`ready`/`renderChatMessage`.

### Phase 2 — Convert `LMRTFYRoller` to AppV2

Scope: full rewrite of `src/roller.js` class header, `DEFAULT_OPTIONS`, `PARTS`, `_prepareContext`, `_onRender`, `actions`, and rewire every `_on*` handler. Update `templates/roller.html` with `data-action="..."` attributes and remove any jQuery-assumed markup (the template has no `<form>`, so nothing to strip there).

**Done when:** a player receives a roll request from a v10→v13 ported GM (use the un-migrated Requestor temporarily during this phase, or stub the socket payload in the console) and can roll **ability + skill + save** in dnd5e and one non-dnd5e system (pf2e recommended since it exercises the richest code path). No console errors on open, roll, or close. Dice appear in chat via `roll.toMessage`.

### Phase 3 — Convert `LMRTFYRequestor` to AppV2

Scope: full rewrite of `src/requestor.js` class header, `DEFAULT_OPTIONS`, `PARTS` (with dynamic per-system template resolution), `_prepareContext`, `_onRender`, `actions`, `form.handler`. Strip outer `<form>` tags in all four request templates; add `data-action="..."` attributes.

**Done when:** the GM can open the Requestor from the scene-controls button, select actors, select abilities/skills/saves, and click *Request Roll*. Socket message reaches the player's Roller (Phase-2 converted). GM can also *Save as Macro* (exercises `Macro.create` path).

### Phase 3a — Fix `LMRTFY.onThemeChange` for AppV2

Scope: rewrite `LMRTFY.onThemeChange` (`src/lmrtfy.js:404-414`) to work with AppV2 elements. This method is the settings callback for `LMRTFY.enableParchmentTheme` and must toggle the `lmrtfy-parchment` CSS class on all open LMRTFY application windows (both requestor and roller). Three breaking issues:

| # | v10 code | Issue | v13 fix |
|---|----------|-------|---------|
| ① | `$(".lmrtfy.lmrtfy-requestor,.lmrtfy.lmrtfy-roller").toggleClass("lmrtfy-parchment", enabled)` | jQuery `$()` undefined in v13 — runtime crash | `document.querySelectorAll(".lmrtfy.lmrtfy-requestor, .lmrtfy.lmrtfy-roller").forEach(el => el.classList.toggle("lmrtfy-parchment", enabled))` |
| ② | `LMRTFY.requestor.options.classes.push("lmrtfy-parchment")` / `.filter(...)` reassign | AppV2 DOM element manages its own classes; mutating `options.classes` alone does not update the live element | Keep `options.classes` mutation for future re-renders (guarded with `.includes()` check), but the live DOM is already handled by fix ① |
| ③ | `LMRTFY.requestor.element.length` | AppV2 `element` is `HTMLElement` (no `.length`) — evaluates to `undefined`, silently skipping `setPosition` | Replace with `LMRTFY.requestor.rendered` |

**Done when:** toggling the `LMRTFY.enableParchmentTheme` setting adds/removes the `lmrtfy-parchment` class on open requestor and roller windows without console errors. The class persists across re-renders. `setPosition` fires correctly when the requestor is open.

### Phase 4 — Per-system verification pass

Scope: load each listed system individually in a fresh v13 world with a test actor and execute one roll of each enabled type.

**Done when:** for each system in `module.json:75-90` (or a reduced set if unmaintained systems are dropped), the testing checklist below passes. Systems that fail are either fixed under the per-system branch, de-scoped from `systems` (and `relationships.systems`), or guarded with a `foundry.utils.isNewerVersion` gate plus an `ui.notifications.warn` message.

### Phase 5 — Release packaging

Scope: bump `version` in `module.json`, update the `changelog`, trigger the `.github/workflows/main.yml` release flow. **No new files in the packaged zip** — the workflow packages `module.json css/ src/ lang/ images/ templates/` (per CLAUDE.md).

**Done when:** the Foundry package registry shows the new release pinned to v13.

---

## Testing checklist (run in a live v13 world)

- [ ] Module loads in a fresh v13 world with no deprecation warnings in the console at `ready`.
- [ ] Scene-controls token tool shows the *Request Roll* button (LMRTFY icon).
- [ ] GM opens the Requestor from the scene-controls button; dialog renders; actor list populates.
- [ ] GM selects one player-owned actor + one ability → clicks *Request Roll*; no error.
- [ ] A second (player) client receives the Roller; dialog renders; ability button is clickable; roll posts to chat.
- [ ] Same for skill rolls.
- [ ] Same for saving throws.
- [ ] Same for initiative (dnd5e path + pf2e path + demonlord path).
- [ ] Same for death save (dnd5e path + pf2e recovery path + generic path).
- [ ] GM opens Requestor, selects *Save as Macro* → macro is created and opens its sheet.
- [ ] Each of the following systems rolls one check successfully: **dnd5e, pf2e, pf1, demonlord, wfrp4e, ose, D35E** (core systems). Flag any other system in the compatibility matrix as *skipped — system not verified v13*.
- [ ] Blind roll: GM requests a blind ability check; chat message hides for non-GM (exercises `hideBlind` + `flags.lmrtfy`).
- [ ] `LMRTFY.showFailButtons` setting enabled: fail buttons render on the Roller for a supported system; clicking one produces the expected low roll.
- [ ] `LMRTFY.enableParchmentTheme` toggle flips the parchment CSS class on both dialogs.
- [ ] `globalThis.LMRTFYRequestRoll` remains callable (public API contract per CLAUDE.md).
- [ ] No jQuery errors (`$ is not a function`, `.find is not a function`) anywhere.

---

## Open questions / needs manual verification

1. **`renderChatMessage` hook rename.** The v13 jQuery removal is confirmed (Context7: `/development/guides/applicationV2-conversion-guide`). Context7 did not return an explicit rename for the `renderChatMessage` hook to `renderChatMessageHTML`. Before Phase 1 lands, verify against `https://foundryvtt.com/api/v13/` (search for `renderChatMessage`) or the v13 migration notes. **Handler at `src/lmrtfy.js:490` may need to be re-registered under a new name.**
2. **AppV2 dynamic `PARTS`.** The per-system template branch in `LMRTFYRequestor.defaultOptions` (requestor.js:28–42) relies on `game.system.id` at class-definition time, which happens before `game` is fully populated. Confirm whether overriding `_configureRenderParts(options)` is the right hook for lazy template selection in v13, or whether re-assigning `this.options.parts` in `_prepareContext` is supported.
3. **Per-system v13 compatibility versions** for: dnd5e, dnd5eJP, sw5e, pf1, pf2e, D35E, cof, coc, demonlord, ose, foundry-chromatic-dungeons, degenesis, ffd20, dcc, wfrp4e. Context7's Foundry-wiki index does not track system-release matrices. Check each system's release channel (Foundry package registry + system GitHub) for the latest v13-verified release and paste the exact version into `module.json:relationships.systems[*].compatibility.verified`.
4. **Macro sheet rendering.** `macro.sheet.render(true)` (requestor.js:470) — verify that Macro's configuration sheet in v13 still accepts boolean-force on render. Likely yes (AppV2 `render` accepts boolean or options).
5. **`game.system.data.initiative` fallback** (roller.js:689). `game.system.data` namespacing may have been flattened in v12/v13 to `game.system.initiative`. Confirm and pick the right fallback chain.
6. **`fromUuid` custom parser.** `src/lmrtfy.js:456–482` rolls its own UUID resolution using `CONFIG[docName].collection.instance` and `doc.getEmbeddedDocument(...)`. Native `fromUuid(uuid)` is async and handles most shapes in v13. Decide whether to delete the custom parser or keep it as a fallback.
7. **`dcc` absence from `systems` array** (module.json:75–90) despite being in `relationships.systems` (190) and in the `LMRTFY.ready` switch (lmrtfy.js:257–279). Confirm with the user whether DCC should be re-added to the public `systems` list.

---

## Verification — end-to-end

1. **Developer workstation setup.** Symlink the repo into `Data/modules/lmrtfy-pextra` (per CLAUDE.md), install a current Foundry v13 build, create a fresh world with dnd5e (latest v13-verified release), enable the module, and work through the testing checklist above in order.
2. **Cross-client test.** Host the v13 world, connect a second browser profile as a player user with an owned actor, and repeat the request/receive/roll cycle from a real second client — not just a second tab impersonating a player, since impersonation can mask socket filtering bugs (the requestor/onMessage path filters by `data.user`, and the GM-drop-player-owned-actor rule in `LMRTFY.onMessage` matters here).
3. **Deprecation console scrub.** Open DevTools, filter on `DeprecationWarning` and `foundry.utils`; the log should be clean after Phase 1.
4. **Rollback.** Each phase lands as a separate commit on `feature/003-v10-to-v13-migration` so a failing phase can be reverted without losing earlier work.

---

## Critical files to modify

- `module.json` — Phase 1.
- `src/lmrtfy.js` — Phases 1 (utilities, scene controls, data paths, hook names), 3a (`onThemeChange` AppV2 fix), and 4 (per-system validation).
- `src/roller.js` — Phase 2 (AppV2 rewrite), plus Phase 1 utility/data-path fixes.
- `src/requestor.js` — Phase 3 (AppV2 rewrite), plus Phase 1 utility fixes.
- `templates/roller.html` — Phase 2 (add `data-action` attributes).
- `templates/request-rolls.html`, `templates/demonlord-request-rolls.html`, `templates/wfrp4e-request-rolls.html`, `templates/degenesis-request-rolls.html` — Phase 3 (strip outer `<form>`, add `data-action` attributes).
- `css/lmrtfy.css` — *no changes expected* in the common case; revisit only if AppV2's frame differs enough that `.window-content` / `.form-group` rules misalign.

## References

- Foundry VTT Community Wiki (Context7 library id: `/websites/foundryvtt_wiki_en_development`) — pages cited: `/development/api/applicationv2`, `/development/guides/converting-to-appv2`, `/development/guides/applicationV2-conversion-guide`, `/development/api/canvas` (scene-controls v13 shape), `/development/api/settings`, `/development/api/helpers` (foundry.utils deprecation), `/development/api/application` (header buttons migration), `/development/api/game` (init/ready/setup hooks), `/development/guides/local-to-repo` (module.json compatibility schema), `/development/guides/releases-and-history` (legacy `compatibleCoreVersion`).
- Foundry VTT v13 API: `https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html`, `.../DialogV2.html`, `.../modules/foundry.utils.html` — fetched live during planning. DialogV2 confirmed as the Dialog v1 replacement; ApplicationV2 lifecycle methods (`_prepareContext`, `_onRender`, `_preClose`, `render`, `close`, `submit`, form handler signature) confirmed.
- Repository: `CLAUDE.md` (module architecture and packaging contract), `CONTRIBUTING.md` (system-add procedure).
