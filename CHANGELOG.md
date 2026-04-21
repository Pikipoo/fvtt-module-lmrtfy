# Changelog

## 3.2.0 — 2026-04-21

- Migrated LMRTFYRequestor and LMRTFYRoller from AppV1 (FormApplication/Application) to ApplicationV2 with HandlebarsApplicationMixin
- Replaced all bare global utility calls (`duplicate`, `mergeObject`, `setProperty`, `isNewerVersion`) with `foundry.utils.*` namespace
- Fixed `actor.data.data` references to use `actor.system` data path
- Updated `getSceneControlButtons` hook handler for v13 object-keyed payload (was array-based)
- Converted all template event bindings from jQuery `.click()` to `data-action` attributes with AppV2 action handlers
- Fixed `LMRTFY.onThemeChange` for AppV2 compatibility — replaced jQuery selector, guarded `.includes()` check, and used `.rendered` instead of `.element.length`
- Completed per-system verification pass for all 15 supported game systems
- Bumped `compatibility.minimum` and `compatibility.verified` to v13
- Removed legacy `minimumCoreVersion`/`compatibleCoreVersion` fields from module.json

## 3.2.0-rc1

- Pre-release candidate for v13 migration testing
