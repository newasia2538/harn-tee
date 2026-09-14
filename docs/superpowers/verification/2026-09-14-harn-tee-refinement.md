# harn-tee Refinement Verification

## Automated gates

- `npm test` — 5 files, 18 tests passed.
- `npm run lint` — passed with no warnings.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; all App Router and API routes emitted.

## Browser smoke test

Using the local production Worker:

- Created a two-person bill and opened the draft edit link.
- Selected item-level fee mode and entered VAT 7% plus Service charge 10%.
- Preview showed 58.50 THB per person and opened a participant detail dialog with item, Service, VAT, and total lines.
- Published the bill, opened Summary, saw the bank mark, and opened the same participant detail breakdown.
- Confirmed the PromptPay and bank payment fields remained visible.

## Mobile viewport checks

At explicit viewport widths 360px, 390px, and 412px, create/edit, Preview, and Summary reported no document horizontal overflow. A 360px screenshot confirmed the participant detail sheet remains readable and the primary action stays inside the viewport.
