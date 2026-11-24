# Compact Live Total Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the current receipt total and next-step action visible while entering a bill, using the approved compact design.

**Architecture:** Reuse `selectLiveTotals` and replace the current in-flow `LiveBillTotals` presentation with an accessible fixed bottom bar. Keep viewport/measurement behavior in one hook and navigation/validation in `HarnTeeApp`. This UI slice can be verified independently before the history/retention plan.

**Tech Stack:** Existing React 19, TypeScript, Tailwind/CSS, Lucide, Vitest and Testing Library; no new dependencies or backend changes.

**Spec:** `docs/superpowers/specs/2026-11-24-bill-history-retention-design.md`, section “Item-entry live total bar — approved UI”.

## Global Constraints

- Selected design: `ยอดพร้อมปุ่มถัดไป`; 22px total, 11px caption, 13px action label, minimum 44px primary button.
- Main action copy: `ตรวจสอบบิล`; total toggle opens the subtotal, Service charge and VAT breakdown above the bottom row.
- Receipt total and rounded collection total remain separately labeled; money formulas, fee scopes, blank numeric hints and validation remain unchanged.
- Prompt headings, IBM Plex Sans Thai body, existing Navy & Tangerine palette; opaque high-contrast bar.
- Bar stays at the bottom of the available screen on the item-entry step only. Reserve its actual height, including expanded details/notices and safe-area padding.
- Preserve the user's Native execution method and current checkout on a `codex/` branch. Preserve the pre-existing modified `tsconfig.tsbuildinfo`; do not stage it.
- This plan is implementation/verification only; source publication and production rollout are separate release actions.

## Review Focus

- Long amounts at narrow widths or text zoom must reflow without pushing the next action off screen — Tasks 1 and 2.
- A keyboard opening, scrolling or closing must not hide the bar or the focused input — Task 2.
- Expanding details or adding a validation notice changes the reserved space immediately — Tasks 1 and 2.
- An OCR/participant dialog must stay above the bar; closing it restores reachable controls — Task 2.
- Recovery, submission, completion and other steps must not leave a duplicate/active next action or stale bottom inset — Task 2.

---

## File Structure

| File | Responsibility |
| --- | --- |
| Modify `components/harn-tee/live-bill-totals.tsx` | Compact total, accessible disclosure, existing breakdown/notices and next action |
| Create `lib/harn-tee/use-bottom-bar-layout.ts` | Measure the bar and track the visual viewport; clean up observers/listeners |
| Modify `app/harn-tee-client.tsx` | Supply existing navigation, mount only on step 1, reserve space, remove duplicate next button |
| Modify `app/globals.css` | Scoped bottom-bar positioning, responsive layout and scroll clearance |
| Modify `tests/harn-tee/live-bill-totals.test.tsx` | Disclosure, formatting, notices and action behavior |
| Create `tests/harn-tee/bottom-bar-layout.test.tsx` | Resize/viewport subscriptions and cleanup |
| Modify `tests/harn-tee/harn-tee-draft-flow.test.tsx` | Step/recovery/submission integration |
| Create `docs/superpowers/verification/2026-11-24-compact-live-total-bar.md` | Actual automated/browser evidence and limitations |

### Task 1: Build the compact total and measured layout contract

**Files:** Component, new layout hook and their tests above; scoped styles in `app/globals.css`.

**Interfaces:**
- Consumes existing `selectLiveTotals(form: DraftForm)` and `formatBaht(number)`; no parallel calculator.
- Produces `LiveBillTotals({form, onNext, disabled = false, onHeightChange}: {form: DraftForm; onNext: () => void; disabled?: boolean; onHeightChange?: (height: number) => void})`.
- Produces `useBottomBarLayout(ref: RefObject<HTMLElement | null>, active: boolean): {height: number; bottomInset: number}`. Initial `height` is 84px until measured; return zero insets when inactive. The component reports its measured height with `onHeightChange` so the caller reserves space.

- [x] **Step 1: Update/write failing component and hook tests.** Add `expands_from_total_and_preserves_receipt_vs_collection_labels`, `uses_existing_fee_calculations`, `shows_unassigned_and_provisional_notices`, `next_action_calls_owner_handler_once` and `measures_expanded_height_and_cleans_up`. Pin these assertions:

```ts
// Use draftFixture(), setNumericInput() and existing fee fixtures.
expect(receiptText).toBe("100.00 บาท");
expect(collectionText).toBe("100.02 บาท");
expect(vatAfterServiceText).toBe("117.70 บาท");
expect(separateVatText).toBe("117.00 บาท");
expect(toggle.getAttribute("aria-expanded")).toBe("false");
await user.click(toggle);
expect(toggle.getAttribute("aria-expanded")).toBe("true");
expect(onNext).toHaveBeenCalledTimes(1); // after one enabled next click
expect(disconnect).toHaveBeenCalledTimes(1); // hook unmount
```

Use `draftFixture()` from `tests/helpers/draft-fixtures.ts`; set three payers for the 100.02 fixture. Mock `ResizeObserver` and `visualViewport` explicitly in the hook test. Also test invalid raw `7.`, no payers, zero fees, a long formatted amount, and changing `disabled` while details are open. Native button disabling blocks the click, not a CSS-only state. Invalid/unassigned input preserves the existing next-step validation behavior: the action invokes the owner's handler so it can display the current validation error; only saving/submission disables the action.

- [x] **Step 2: Run the focused tests red.** Run `npm test -- tests/harn-tee/live-bill-totals.test.tsx tests/harn-tee/bottom-bar-layout.test.tsx`. Expect failures for the new disclosure/action/measurement contract, not missing packages or unrelated regressions.
- [x] **Step 3: Implement the component and hook contracts.** Keep local disclosure state, a keyboard-focusable toggle with `aria-expanded`/`aria-controls`, and one politely announced amount. Render `ยอดสินค้า`, `Service charge`, `VAT`, receipt total, separately labeled collection adjustment and the existing notices. Keep a 22px default amount with wrapping rather than a fixed-height/clipped panel. Hook observes its real border-box height and listens to visual-viewport resize/scroll plus window resize. Compute keyboard inset as `max(0, innerHeight - visualViewport.height - visualViewport.offsetTop)`; browsers without that API use zero. Include safe-area padding once in the measured element. Clean up every observer/listener on unmount; do not write to draft state or persist disclosure toggles.
- [x] **Step 4: Run the focused tests green.** Same command; every assertion passes. A zero-sized jsdom measurement is not browser layout evidence.
- [x] **Step 5: Commit only this task's files.** `feat: add compact live total bar`.

### Task 2: Connect the bar to creation/editing and verify responsive behavior

**Files:** `app/harn-tee-client.tsx`, `app/globals.css`, `tests/harn-tee/harn-tee-draft-flow.test.tsx`, verification document.

**Interfaces:**
- Consumes Task 1's component, `onHeightChange` and existing `nextStep()` validation.
- Produces one step-1 bottom action and dynamic main-content clearance; step 0/2, completion and recovery retain their current actions.

- [x] **Step 1: Add failing flow tests.** In `has_one_next_action_only_on_item_step`, assert exactly one `ตรวจสอบบิล` button after moving to step 1, no old `ตรวจสอบยอด` duplicate, successful navigation to step 2 and no bar on other steps. In `invalid_form_keeps_item_step_and_notices_reachable`, click the action with an incomplete item and assert existing validation fires without advancing. In `bar_unmounts_on_recovery_completion_and_submission_guards`, assert no active hidden action survives those phase changes. Spy on draft-store writes to prove expanding the disclosure alone does not create a saved edit.
- [x] **Step 2: Run red.** `npm test -- tests/harn-tee/harn-tee-draft-flow.test.tsx`.
- [x] **Step 3: Integrate using the existing handler.** Mount the component in step 1, pass `nextStep`, current saving/submitting disable state and measured height. Remove only the old step-1 next button; retain its back button and all step-0/2 behavior. Position the bar within the 896px content maximum with 16px screen gutters, bottom inset from Task 1 and safe-area padding. Reserve measured height plus 16px clearance in the main content and focused-control scroll clearance. Allow it to grow for text/amounts; no forced fixed height. Keep the bar below existing dialogs in stacking order and keep focused field/validation scrolling above it. Reset all temporary insets on step exit/unmount.
- [x] **Step 4: Verify automated gates.** Run the two focused suites, `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build` and `git diff --check`. Require zero failures and successful build. Preserve the original `tsconfig.tsbuildinfo` hash recorded in the prior verification report.
- [ ] **Step 5: Verify in a native browser and record evidence.** At desktop, 360×800 and 320px width, edit a long item list, expand/collapse details, add/remove items, switch both fee scopes/formulas and inspect OCR/participant dialogs. Check a long Thai title, large amount and 200% text zoom. With a mobile keyboard where available, focus the last price/fee/payment field, scroll, rotate/resize and dismiss the keyboard; the input, bar and next action remain reachable. Record screenshots/observations and explicitly distinguish responsive emulation from physical keyboard coverage. Browser-control failure leaves the corresponding gate open; it is not a pass.
- [x] **Step 6: Commit the integration and verification document.** `feat: pin item totals beside next action`.

## Execution Handoff

Design approved 2026-11-24. This implementation plan requires review before execution. Native was already chosen; do not ask for the execution method or a new worktree again. Continue in the existing checkout/branch. Complete this UI slice before `2026-11-24-bill-history-retention.md`; do one fresh whole-branch review at the end of the approved Native implementation, with any important findings fixed and relevant checks rerun.

## Execution status — 2026-11-24

Implementation and automated gates complete (source commit `45bb95b`). Integrated native desktop/360px/320px behavior was observed. Step2.5 remains partially open for200% text zoom, a long-list/OCR-overlay native pass and physical mobile keyboard coverage; these are not claimed as passed. See the verification report for exact observations and limits.
