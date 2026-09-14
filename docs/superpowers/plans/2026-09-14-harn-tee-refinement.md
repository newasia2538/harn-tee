# harn-tee Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve harn-tee readability and auditability while adding bill-level or item-level VAT/service-charge modes and bank logos.

**Architecture:** Keep the existing token-scoped D1/R2 application and extend the pure money contract with a backward-compatible `feeMode`. Preview and Summary consume the same calculation result and share one participant-detail component. CSS theme tokens move the app to the approved Navy & Tangerine palette, while mobile browser checks validate the fixed card layout.

**Tech Stack:** React 19, TypeScript, Vinext/Next App Router, Tailwind CSS 4, Vitest, Cloudflare D1/R2, Sites.

**Spec:** `docs/superpowers/specs/2026-09-14-harn-tee-refinement-design.md`

## Global Constraints

- Preserve no-login bearer share/edit links and existing D1/R2 routes.
- Treat missing `feeMode` on old documents as `bill` mode.
- VAT/service charge use item prices only; item mode splits each item's fee across that item's payers.
- Keep final participant amounts rounded up to satang and show the rounding disclaimer.
- Use accessible contrast, minimum 14px routine labels, and no horizontal overflow at 360px.
- Use local bank mark assets; do not depend on remote image URLs in the picker.

### Task 1: Calculation contract first

**Files:**
- Modify: `lib/harn-tee/types.ts`
- Modify: `lib/harn-tee/money.ts`
- Modify: `lib/harn-tee/validation.ts`
- Test: `tests/harn-tee/money.test.ts`
- Test: `tests/harn-tee/validation.test.ts`

- [ ] Add failing tests for item-mode fees, per-line VAT/service components, and item-mode rounding.
- [ ] Run the focused money tests and confirm the new assertions fail for the missing contract.
- [ ] Add `FeeMode`, optional item fee fields, and backward-compatible bill fee mode.
- [ ] Implement item-mode calculation and extend line item components without changing bill-mode results.
- [ ] Validate item fee percentages only in item mode and run focused tests to green.

### Task 2: Persist and normalize the new fee mode

**Files:**
- Modify: `db/document.ts`
- Modify: `app/api/bills/route.ts`
- Modify: `app/api/bills/[token]/route.ts`
- Modify: `app/harn-tee-client.tsx`
- Modify: `app/summary-client.tsx`
- Test: `tests/harn-tee/repository.test.ts`

- [ ] Add a repository/document test proving a missing fee mode reads as bill mode and new item fields survive a patch.
- [ ] Normalize old documents at calculation boundaries and persist new drafts with explicit `feeMode`.
- [ ] Include fee mode and item fee fields in create/edit payloads and Summary calculation input.
- [ ] Run the repository tests and typecheck.

### Task 3: Form, Preview detail, and Summary detail UI

**Files:**
- Modify: `components/harn-tee/item-editor.tsx`
- Modify: `components/harn-tee/fee-editor.tsx`
- Create: `components/harn-tee/participant-detail.tsx`
- Modify: `app/harn-tee-client.tsx`
- Modify: `app/summary-client.tsx`

- [ ] Add a failing calculation/UI-facing assertion for a participant line containing base, VAT, service, and total components.
- [ ] Add bill/item mode controls; item mode renders VAT/service inputs on each item and bill mode keeps the global editor.
- [ ] Make Preview participant rows open the shared participant detail dialog.
- [ ] Replace Summary’s duplicate detail markup with the shared component and show fee components per item.
- [ ] Keep controls stacked at mobile widths and run lint/typecheck.

### Task 4: Navy & Tangerine theme and bank marks

**Files:**
- Modify: `app/globals.css`
- Modify: `app/harn-tee-client.tsx`
- Modify: `app/summary-client.tsx`
- Modify: `components/harn-tee/item-editor.tsx`
- Modify: `components/harn-tee/fee-editor.tsx`
- Modify: `components/harn-tee/payment-editor.tsx`
- Add: `public/banks/*.svg`

- [ ] Replace legacy green/coral tokens in shared UI surfaces with approved high-contrast navy, teal, tangerine, and blue-gray tokens.
- [ ] Add local bank marks and an accessible custom bank picker with keyboard-friendly buttons.
- [ ] Update Summary payment cards to show the selected bank mark.
- [ ] Run a source scan for stale low-contrast theme tokens and lint.

### Task 5: Mobile QA and delivery

**Files:**
- Modify: `docs/superpowers/verification/2026-09-14-harn-tee.md`

- [ ] Start the production preview and inspect create, Preview, and Summary at 360px, 390px, and 412px.
- [ ] Fix any clipping, overflow, unreadable text, or unusable controls found in those widths.
- [ ] Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- [ ] Commit, push, package, save, and deploy the verified revision through Sites.
- [ ] Verify the deployment status and production URL.
