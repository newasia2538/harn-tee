# Draft recovery, new bill and live totals — verification

Verified locally on 2026-11-24 (Asia/Bangkok). Application commit: `7e946b82432df124353223747717e265b2edc2d9`. Branch: `codex/draft-recovery-live-totals`.

**Release status: awaiting required browser QA. Production has not been updated.** The native browser-control service stopped responding during the second browser-context test. Rebinding the tab and opening a native browser also failed with timeouts/expired continuations. The missing UI gates below are not treated as passed.

## Automated gates

| Gate | Result |
| --- | --- |
| `npm test` | 38 files, 339 tests passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run lint` | Passed, no warnings |
| `git diff --check` | Passed |
| Active Sites `scripts/build-site.mjs` | Passed after the final application change |
| Pre-existing `tsconfig.tsbuildinfo` | Preserved; SHA256 `2d11d2fa43f0e9303cc8957a0dcdacee87a4d8f530235f249d1d5496b38682d5` |

The build emits the existing Vinext route-classification/Node experimental-glob notices; it exits successfully. No schema migration or new runtime service is needed.

## Real local D1/R2 HTTP checks

Nine checks passed against the actual Vinext development worker and its persisted Miniflare D1/R2 bindings. HTTP requests were not mocked. Only synthetic bills, payment values and a PNG fixture were used; this report excludes capabilities and complete financial payloads.

1. Create an incomplete bill with raw price `7.` and a synthetic typed national ID: the edit response preserves the raw input and excludes the ID.
2. Inspect that bill's raw SQLite `payload_json` before publication: the ID is absent from the stored payload, including the private draft envelope.
3. Missing `If-Match` returns 428; stale `If-Match` returns 409; a subsequent read has the original revision, proving no mutation.
4. A share capability cannot read the unpublished draft API or QR (404).
5. Upload a PNG to R2 with an edit capability: the authorized QR GET succeeds, and only the edit acknowledgement includes its opaque selection marker.
6. Read the same draft through a second localhost HTTP origin: raw price and the server-owned QR association are retained.
7. Publish through that origin, then replay the same confirmation after deliberately removing the national ID: the existing confirmation succeeds without another publication/revision.
8. After a peer updates the published price, an owner payment toggle using the old revision returns 409 and leaves the peer revision intact.
9. A published share response contains neither private draft metadata nor the QR upload-recovery marker.

The executable probe and localhost proxy are retained in this plan's ignored `.superpowers/sdd/2026-11-23-draft-recovery-live-totals/` workspace for continuation. This HTTP-origin check does **not** substitute for the outstanding two-browser UI check.

## Actual browser observations

Before the browser service failed, the in-app browser successfully:

- Created a bill with two synthetic participants and entered the item/payment step.
- Saved the unfinished raw price `7.`, VAT 7%, service charge 10%, a synthetic phone PromptPay value, and an uploaded PNG.
- Displayed independent local/server save status and the provisional live-total notice.
- Reloaded, offered explicit continuation, and restored the item step, raw `7.`, percentages, phone and the selected file name from native IndexedDB.

The browser-control interruption prevented final screenshots. No screenshot, 360×800 layout, physical-phone behavior or completed browser publication is claimed.

## Acceptance coverage

| Requirement | Evidence |
| --- | --- |
| No blank save before recovery; raw/step/state restore | Hook and app interaction tests; native IndexedDB reload observed |
| Local QR survives reload; upload once | Store/queue/hook tests; browser file restoration; real R2 upload |
| Browser and edit contexts isolated; local version conflicts | IndexedDB tests and session regressions |
| Cross-device draft save with conditional writes | Repository/API/queue/session tests; real D1 preconditions and second HTTP origin |
| National ID excluded from browser/server drafts | Sanitization, storage, transport, session and app tests; raw D1 inspection |
| ID warning/re-entry, type switch clears input | Payment editor and recovered-form interaction tests; final browser visual check pending |
| Published edits stay local until explicit save | Session/app interaction tests; published-share browser comparison pending |
| Lost confirmation and storage-failure recovery | Publication/session/app tests; real confirmation replay |
| Completion reload and fresh new bill | App/store tests; final browser success/reset check pending |
| Live totals, both formulas/modes, separate split rounding | Pure/component tests including 117.70/117.00, 175.45/174.50, 100.00 versus 100.02 |
| Imported OCR persists; unimported images/review excluded | Existing import/scanner tests plus form whitelisting and review notice; final browser import/reload check pending |

## Independent review and bounded fix pass

One fresh read-only whole-branch reviewer, Euler, reviewed `2691680..485d609`. No Critical or Minor issues were reported. All seven Important findings were reproduced and fixed with regressions:

1. Preserve an unrelated unfinished home draft when starting from an edit route; return to its named recovery/replacement choice.
2. Guard owner payment toggles with the editing baseline and return the mutation's own committed revision, avoiding a later read that could adopt a peer's financial changes.
3. Remove raw price/VAT/service entries along with a deleted item.
4. Explicitly load the authoritative local checkpoint/version after a browser-only conflict.
5. Recheck the server revision and recreate synchronization after recovering offline.
6. Reconcile an uncertain QR upload using its opaque selection marker and unchanged safe server content.
7. Compare equivalent sanitized forms independently of QR metadata while also checking the expected server QR association for an uncertain text save.

The seventh regression was re-run against the original comparison to observe failure, then passed with the fix; its response fixture is isolated to avoid accidental reference mutation. Complete tests, typecheck, lint and build passed after the fix pass. No second review agent was dispatched.

Reviewer exclusions were explicitly accepted: real browser/D1/R2/build/release belong to this verification task; recovery of unimported OCR images/review is excluded by the approved spec and explained in the UI.

## Recorded implementation rulings

- Draft HTTP schemas live in `draft-http.ts` to avoid the existing shared-validation import cycle. Cost: maintainers consult both validation modules; boundary tests cover the split.
- Submission context includes local ID/version and the session exposes a published-update completion method. Cost: a slightly larger internal interface; ownership and recovery tests cover it.
- A matching published receipt's edit alias can move to a separate working record while retaining the home creation receipt. Cost: one additional alias transition, guarded by bill identity and edit capability.
- Existing document fee values initialize raw fee strings so controlled inputs display their existing nonzero values. Cost: shared form initialization owns those strings.
- Publication validation reads the explicit form whitelist, excluding recovery-only metadata. Cost: validation and persistence use separate intentional projections.
- Published update completion preserves the preview step; edit-route new-bill navigation prepares the home context. An unrelated unfinished home draft is preserved for explicit recovery/replacement instead of overwritten. Cost: an extra choice in that case.
- Owner payment toggles use conditional acknowledgements; legacy share-only toggles remain compatible. QR uncertainty uses an edit-only opaque marker and conservative comparison of content/association. Cost: one private server metadata field and a conflict when concurrent changes cannot be distinguished safely.

## Required before merge/deployment

1. Restore the native browser-control service; rerun final application behavior after the review fixes.
2. Finish the two-independent-browser-context edit/publication/conflict flow and third share-only UI view.
3. Verify published financial/QR edits remain invisible in the share view until explicit confirmation.
4. Verify completion reload, fresh-bill isolation and OCR import/reload in the actual browser.
5. Verify desktop and 360×800 layouts, no horizontal overflow or obstructing totals/status panels; capture screenshots. Responsive browser verification will not claim physical keyboard/camera coverage.
6. Then integrate/push the matching final source, package through the active Sites workflow and deploy to the existing public audience. Preserve the unrelated build-info file around the helper's whole-checkout staging operation.

No production deployment, audience change, production-data deletion or migration was performed in this verification run. Task 10 remains unfinished; the ignored execution workspace is retained.
