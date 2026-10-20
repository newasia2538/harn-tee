# Receipt OCR verification

## Automated checks

- `npm test`: 22 files, 242 tests passed.
- `tsc --noEmit --incremental false`: passed without rewriting existing incremental state.
- `npm run lint`: passed.
- `git diff --check`: passed.
- Sites `build-site.mjs` / Vinext production build: passed. Only existing experimental/static-route-classification notices were printed.
- Coverage includes structured Tesseract v7 output, column/row grouping, overlapping segment deduplication, separate repeated purchases, ambiguous prices and confidence, safe retry suggestions, image bounds/cleanup/cancellation, explicit review confirmation, subtotal discrepancies, and excluding image data from imported items.
- Independent review found three parser risks: percentage-prefixed fee labels/net totals, decimal punctuation split into separate words, and widely spaced product-volume descriptions. Twelve regression cases (including preservation of shared word origins across overlapping tiles) reproduced failures before fixes; all pass after fixes. Reconstructed decimal prices always require explicit review, and a gap within one OCR line cannot alone create another charge.

## Actual browser OCR

Tested the real browser Tesseract engine on localhost, not a mocked engine. Images were synthetic, locally generated fixtures without personal information.

1. Thai receipt with quantity, unit price and line amount: product prices were correctly read as 80.00, 70.00 and 20.00 baht. The quantity-two row selected the 70.00 line amount rather than its 35.00 unit price. Subtotal, VAT, grand total, cash, date and table header were excluded from products. The unknown receipt title remained an unpriced row requiring review/removal.
2. A 1000 x 4700 pixel receipt with 20 separate identical purchases: all 20 prices were read as 25.00 baht, totalling 500.00 baht. Overlapping sections did not create extra purchases, and physically separate identical rows were retained.
3. Corrected the OCR name `น้าเปล่า` to `น้ำเปล่า` in the review UI and successfully imported the three products. Existing manual input and participant assignment remained present. OCR did not automatically apply receipt VAT to the bill.
4. At a 360 x 800 browser viewport, the review showed image snippets and editable stacked fields. `document.documentElement.scrollWidth` and viewport width were both 360; no horizontal document overflow occurred. Browser viewport override was reset after testing. This is responsive browser QA, not physical-phone camera testing.
5. Cancelled review and selected another image successfully. No warning/error console entries were observed during this smoke test.

## Privacy and limits

- Recognition and cropped previews remain in the browser. No cloud OCR endpoint or new paid service was added. The OCR engine/language assets still need an initial download.
- Image snippets and geometry are deliberately stripped before import; existing bill storage/API schemas are unchanged.
- There is no measured accuracy percentage: these fixtures are not a labelled benchmark of real Thai receipts. Thai spelling can still be wrong, even when OCR confidence is high. Users must compare names and prices before importing.
- Small-angle deskew and conservative margin cropping do not correct strong perspective distortion, crumpling, glare or unreadably small print. Uncertain/conflicting prices stay in review; no price is adjusted to force the subtotal to match.
