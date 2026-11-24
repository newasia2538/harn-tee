# Compact live total bar — verification

Native implementation, 2026-11-24, branch `codex/bill-history-retention-design`.

## Current evidence

- Baseline: 339 tests / 38 files passed.
- New disclosure/next-action/layout tests observed RED before the implementation; initial focused run had five missing-action failures and the absent layout hook.
- Integration regressions observed RED with the old duplicate next action and height-only clearance: expected no old button; expected 384px occupied space but received 84px.
- Final current suite: 349 tests / 39 files passed.
- `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`: passed.
- Existing Vinext route-classification notice remains; build exits successfully.

## Behavior covered automatically

Disclosure accessibility and expansion, receipt versus rounded collection labels, both VAT formulas and item fee scope, provisional/unassigned notices, real-time price updates, submission disable, one next action on step 1, validation before navigation, no draft write from a disclosure toggle, cleanup on step/recovery/completion transitions, actual resize measurement and visual-viewport keyboard inset.

The compact design uses the approved 22px total, 11px caption, 13px action label and at least 44px next button. The caller reserves the measured bar **plus keyboard occlusion**, not only its border-box height. Expanded details and notices remain within the measurement.

## Pending integrated acceptance

Native desktop/mobile layout, long-list scrolling, 320px/360×800, text zoom, OCR/participant overlay stacking and physical keyboard behavior have not been claimed as verified. Perform the available native browser scenarios with the completed history/retention application and record screenshots/limits here. Unit/jsdom viewport tests do not substitute for this gate.

No push, production deployment or production-data operation has been performed.
