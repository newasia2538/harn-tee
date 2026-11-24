# Receipt gallery import and accuracy follow-up

Date: 2026-11-25 (Asia/Bangkok). Branch: `codex/receipt-gallery-input`, based on merged main `599ceeb`.

The user selected both gallery import and accuracy improvements. Gallery support was already part of the approved 2026-10-02 receipt spec; this change makes its device picker explicit. Accuracy fixes extend the existing approved free, browser-local OCR approach without changing the engine, fees, bill API, storage schema or dependencies.

## Changes

- Separate `ถ่ายรูปใบเสร็จ` and `เลือกรูปจากแกลเลอรี` actions with distinct image inputs. Only the camera input requests `capture="environment"`; the gallery input has no capture attribute. Both use the existing read/review/explicit-import lifecycle and reset their selection.
- Stack the controls on narrow screens and use two columns at wider widths, preserving the current theme and persistent total bar.
- Classify known Thai/English receipt titles and explicit document references as non-product lines. Before the fix, `Receipt No. 000123` became a ready product priced123.00; it now appears among the ignored text. Genuine priced products containing receipt words remain products.
- Recognize positive whole-baht `50.-`, currency/Thai-digit forms and OCR-separated `50 .-` as50.00 for review. Show a specific explanation and require explicit row confirmation before import. Negative/malformed notation remains invalid; this notation is not trusted as an automatic receipt subtotal.
- Receipt images/snippets continue to stay temporary in browser memory. Existing items are preserved and confirmed scan rows append to them. Existing uncertain/unknown lines still require review rather than guessing.

## Automated proof

- Baseline receipt tests:181/181 in5 files.
- Gallery regression run:3 failures before the implementation, then182/182 receipt tests green.
- Parser reproduction: known receipt titles became extra review rows, `Receipt No. 000123` became a ready123.00 charge, and `50.-`/`20 .-` had no usable price.14 new assertions failed before the parser fix; focused receipt suite then208/208 passed.
- One fresh read-only reviewer found an Important boundary regression: `Receipt notebook50`/`Invoice numbered50` were incorrectly dropped as references. Both reproductions failed first, then passed after bounding `no`/`number` markers while retaining explicit numeric/alphanumeric references. No Critical or Minor findings; no repeat review.
- Final entire suite: **529 passing /57 files** (`npm test`).
- `npx tsc --noEmit --incremental false`, `npm run lint` and `npm run build`: passed. Lint:0 errors,6 existing warnings. Existing Vinext classification notice remains nonblocking.
- `git diff --check`: passed. Unrelated `tsconfig.tsbuildinfo` retains SHA256 `2d11d2fa43f0e9303cc8957a0dcdacee87a4d8f530235f249d1d5496b38682d5` and is excluded from the change.

## Native browser proof

Used a built immutable artifact and disposable local D1/R2 at loopback port8792; no production records were used.

1. A manual10.00 item plus a gallery image containing Rice50.00 and Water20.00 produced80.00 after review/import, preserving the manual row. Camera action also opened the desktop file picker and read the same image; cancelling retained80.00. This is desktop fallback proof, not physical mobile-camera proof.
2. At320/640/1280px, page scrollWidth equalled clientWidth (305/625/1265 respectively). Both source buttons were visible/reachable; the camera input had `environment`, the gallery input had no capture attribute.
3. After the parser/review fix, a real image selection contained `RECEIPT`, `Receipt No. 000123`, Rice50.-, Water20.00, SUBTOTAL70.00 and TOTAL70.00. Native OCR produced exactly2 product rows. The4 document/total lines appeared in ignored text, Rice prefilled50.00 with the whole-baht warning, and import stayed disabled until its explicit confirmation.
4. Confirming and importing appended the2 rows: item count3→5 and live total80.00→150.00. Final320px width remained305/305. Viewport overrides were reset and the owned preview server stopped.

One intermediate file-picker tool call stalled and lost its continuation; it was not counted as a pass. After inspecting actual state and recovering the picker, the final selected image completed and its visible OCR/review/import result was verified. This tool delay is not a measured OCR processing time.

## Limits and review dispositions

General Thai-receipt OCR accuracy has not been quantified: no labelled real-receipt corpus was supplied. These changes prove specific classification/notation regressions and gallery integration; unknown merchant headings can still appear for review. Physical iOS/Android gallery/camera selection and a second browser engine remain device checks. Browser-native input selection details are platform-controlled: [MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture), [MDN file input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file).

The reviewer's reserved judgments on a real Thai corpus and physical mobile capture remain these explicit limits. The reserved final-artifact check was completed as above. No deferred minor findings. No push, merge or deployment was performed for this follow-up.
