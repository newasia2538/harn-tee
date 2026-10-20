# Browser receipt OCR accuracy improvements

Approved in conversation: improve the existing free browser OCR, without a cloud provider or uploading receipt images.

## Acceptance

1. Consume Tesseract.js v7 `blocks` with word geometry/confidence; missing confidence cannot silently mark an unverified row ready.
2. Group physical receipt rows, separate quantities/unit prices/line amounts, and exclude dates, phones, payment, discounts, fees and totals from imported products. Ambiguity stays visible for review.
3. Preserve useful text resolution on long receipts through bounded sequential overlapping segments, conservative crop/deskew, and explicit image cleanup.
4. Re-read a bounded number of uncertain price crops. Contradictory prices require user confirmation, never silent replacement.
5. Review UI shows receipt snippets and reasons for review, supports explicit row confirmation/price suggestions, and compares product subtotal only when an unambiguous receipt subtotal exists.
6. Existing participant assignment, manual entry, monetary calculations, bill API and privacy remain intact. Receipt images/snippets stay ephemeral in browser memory and never enter persisted bill items.

## Tasks and ownership

- Parser: `receipt-parser.ts` plus its tests; expose `analyzeReceiptLines` returning `{items, ignoredLines, subtotalSatang}` and retain `parseReceiptLines` wrapper.
- Image preparation: new `receipt-image.ts` plus tests; source canvas, bounded segments, crop helpers and cleanup.
- Integration: official Tesseract types, structured output, coordinate normalization, retry budget and snippet generation in `receipt-ocr.ts`; review UI and interaction tests.
- Verification: focused regressions, full suite, type check, production build and actual browser OCR smoke test on desktop/mobile. Real Thai-receipt accuracy percentage remains unmeasured without labelled real receipts.
- Publish through existing Sites project and push matching source to the existing GitHub remote after checks.

## Non-goals

No new OCR engine, paid endpoint, automatic fee application, price adjustment to force totals to match, image persistence, account/login changes or database migration.
