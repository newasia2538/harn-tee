# Bill history and retention verification

Implementation source commit **`45bb95b`**, on `codex/bill-history-retention-design`. Product code and all five review fixes are complete; the device checks listed below remain open. No production migration, deletion, push or deployment performed.

## Automated evidence

- Final unit/component suite: **496 passing / 57 files** after the independent review fix pass.
- Nonincremental TypeScript check and production build passed. ESLint has zero errors; existing/new nonblocking warnings are recorded in the execution ledger.
- Native D1/R2 verifier: **36 assertions** passed using disposable local Wrangler storage. Covers one-time unpaid/paid/draft/zero-due grace; exact expiry boundary; real transactional rollback; stale expiry/manual snapshots; creation-key non-resurrection; late/uncertain PUT; retry after Worker restart; old untracked QR keys and minimal deletion markers.
- Built Worker HTTP verifier: **203 assertions passed with 1 bounded retry in the last gate (3 in the preceding full run) of the exact local Worker-restart503 response**. Covers real create/publish/history/maintenance/status/unmask/QR routes; 30→7→30→7 transitions; identical published confirmation; private/no-store DTOs; bounded bodies; missing/stale/delete permissions; every expired/deleting/deleted access path; uncertain-upload 202 and eventual 200; creation replay.
- Native test worker is only in `tests/integration`, listens on loopback and is never imported by the production app. Verifier rejects public destinations and storage outside `/tmp/harn-tee-retention-qa.*`.
- Native verifier command: `node scripts/verify-bill-retention.mjs --base-url http://127.0.0.1:8790 --persist-to <disposable-dir>`.
- Built Worker command: `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to <disposable-dir> --ip 127.0.0.1 --port 8788 --inspector-port 0`.
- HTTP verifier command: `node scripts/verify-bill-retention.mjs --app-base-url http://127.0.0.1:8788 --app-persist-to <same-disposable-dir>`.
- Both verifier modes apply journaled migrations twice and assert the singleton rollout time does not change.

## Observed native browser scenarios

Used only synthetic names, payment phone and public repository icon as a test QR image.

- Creator: enter long Thai names/title, item 100.00, Service 10%, VAT 7%; live total117.70, participant detail58.85 (item50.00/service5.00/VAT3.85).
- At360×800, collapsed total bar measured72px with bottom800. Expanded fee breakdown and last payment/QR fields remained reachable.
- Reload offered recovery; history resumed the same saved step/inputs. Published it, started a new bill, and both the old published bill and another meaningful draft remained in history.
- Independent storage origin (`localhost` versus `127.0.0.1`) opened the edit link and retained zero imported history. This verifies storage/provenance isolation, **not a second browser engine/device**.
- Owner uploaded a test image and explicitly published a replacement QR; paid flags reset. Marked both positive-due payers paid: creator history showed2/2 and7 days. Reverted one:1/2 and30days. Recompleted:2/2 and7days.
- Active share viewer could reveal and copy the real synthetic PromptPay phone; QR loaded only when shown.
- Delete dialog initially focused Cancel; Tab moved to confirmation. Confirmed deletion removed only that bill; another draft remained. Same-origin open viewer immediately replaced all bill/payment/QR content with the approved gone card via BroadcastChannel. Independent-origin edit reload showed the same card; heading received focus.
- At320px history cards wrapped long Thai text and amounts. A15px horizontal overflow was found because body had a320px minimum width while desktop scrollbars reduced client width to305px. Removed the minimum; final320px history/gone measurements showed scrollWidth equal to clientWidth.
- Native client navigation originally failed with Vinext `navigateClientSide is not a function`. Feature links now use normal document navigation; restarted-build click → history → draft → success → new bill was verified.
- Initial HTTP503 was Wrangler's explicit “worker restarted mid-request” during source/build edits. Stable-build verification passed. Later stable-artifact runs also observed explicit local Worker-restart503 responses. The final harness uses isolated HTTP probes, a45s bound and at most one identical-request retry only for that exact development-runtime message; all retries are counted. This does not establish uninterrupted availability.

## Final review and remaining release checks

One fresh, read-only whole-branch review found one Critical and four Important issues. All were independently reproduced RED and fixed in one pass; the full496-test suite is green. No second reviewer was dispatched and no minor findings were deferred.

1. Retain the storage-committed lifecycle in the session; an offline creation-key save cannot roll back a renewed local draft deadline or cause its early purge.
2. Preserve authoritative history ordering using the existing private monotonic server version; both stale checkpoints and genuinely delayed acknowledgements are covered, alongside opaque-revision fallbacks for old records.
3. Reset payment flags when a replacement published QR commits; preserve QR-selection idempotency through status writes so a retry cannot reset a later payment again.
4. Keep explicit edit-only provenance through publication/completion while preserving legacy creator-receipt discovery.
5. Render payment flags from the committed publication response, preserving a paid no-op save and sending the correct next reversal.

Final nonincremental TypeScript, ESLint (zero errors, six warnings), build and diff checks pass. Original unrelated tsconfig.tsbuildinfo SHA256 remains `2d11d2fa43f0e9303cc8957a0dcdacee87a4d8f530235f249d1d5496b38682d5`.

**Not claimed as proved:** a second browser engine/physical device,200% text zoom (the available shortcut did not change the reported font size/pixel ratio), physical mobile keyboard, native IndexedDB/storage-denial inspection, and uninterrupted local-runtime availability after an early body rejection. Fake IndexedDB tests cover blocked upgrade, denied/quota storage, privacy and atomic purge; these do not replace device checks.

Cloudflare has a primary upstream report of unread-body responses resetting service-binding transports: [workerd#7634](https://github.com/cloudflare/workerd/issues/7634). Our observed503/timeout behavior is consistent with that report, but its root cause in each local run was **not conclusively established**. Oversized-body acceptance runs last; a declared oversize also cancels its unread stream without buffering. No unbounded drain or weakened body limit was introduced. Release availability checks remain explicit.


## Release / rollback order

1. Keep committed `0000` and additive `0001` SQL, snapshots and migration journal unchanged. Apply pending additive migrations **before** uploading the new Worker. Persisted rollout time grants old bills one grace window; request reads/backfill must never re-grant it.
2. The installed Sites storage workflow explicitly applies hosted D1 migrations before uploading its Worker. Local and hosted databases are separate; this run applied only local disposable migrations.
3. Once deletion is enabled, rollback must retain expiry checks, revoked token markers, QR journals and pending cleanup. Use a compatible forward fix/rollback artifact; never restore deleted payloads, drop retention tables or return to the old unrestricted Worker.
4. Preserve current public hosting/audience and existing payment privacy. A future release must use the exact verified source through the existing Sites/GitHub workflow.

## Complete decision ledger

- Ruling: Reuse the existing checkout on the existing feature branch instead of creating a linked worktree — explicit user preference — no additional filesystem isolation from unrelated local work; preserve that work precisely.
- Ruling: Wire the required onNext prop in Task 1 when changing the component interface; remove the old duplicate action in Task 2 — keep the intermediate code type-correct — a small app-call-site change moves one task earlier.
- Task 2: Ruling: onHeightChange reports occupied screen space (bar height plus keyboard inset), not just border-box height — otherwise the last input cannot scroll above a keyboard that overlays the layout viewport — extra bottom whitespace exists while the keyboard is open.
- Task 2: Ruling: combine intermediate native browser proof with the final integrated browser pass — avoid duplicating preview setup while the backend/history is still absent — responsive defects may be found later; no browser gate is claimed passed before observation.
- Task 2: Ruling: supplement the lightweight existing adapter with an actual node:sqlite-backed D1-shaped adapter for schema/transaction tests — execute real SQL instead of growing a permissive string matcher — SQLite is experimental on the current Node 22 runtime and is not a substitute for the required Cloudflare D1/R2 proof.
- Task 3: Ruling: migrate the old mutable Map SQL emulator to a SQLite-backed facade preserving its row/hook seam — the old matcher cannot validate new guarded statements and would mis-handle lifecycle predicates — test runtime now depends on experimental node:sqlite, with real D1/R2 still independently required.
- Task 4: Ruling: use routine maintenance defaults of 5 legacy initializations, 10 expired revocations, 1 pending bill and up to 20 object attempts, within the plan's maximums — fit free Worker request/query budgets rather than amplify every history lookup into file cleanup — large backlogs need more app entries; access remains denied at expiry even before physical cleanup.
- Task 4: Ruling: connect DELETE's required revision and 200/202 result mapping in this task rather than Task 5 — the strengthened repository signature must not leave an unguarded or uncompilable route — a small piece of the HTTP task moves earlier.
- Task 5: Ruling: keep content-derived revisions owner-only in public summary/status DTOs — avoid exposing fingerprints of hidden payment content — public legacy status retains compatibility without an owner precondition.
- Task 5: Ruling: cache the immutable rollout singleton per DB binding — 20 legacy proofs otherwise required 60 D1 calls, exceeding the free invocation budget — policy changes require a new migration/version instead of mutating the cached singleton.
- Task 7: Ruling: for an already-revoked legacy entry without a historical revision, retain a fixed syntactically valid inert precondition solely to retry cleanup — known gone records must discard personal working data even when the old browser never stored a revision — the server still checks real revisions on every active manual deletion and never accepts this as a recovered revision.
- Task 9: Ruling: use ordinary document anchors for bill/history/gone navigation and location.assign after starting a new bill — native testing reproduced Vinext client navigation throwing instead of opening history — navigation reloads the document, so persisted recovery must remain the source of continuity; the complete path was rechecked after restarting the built Worker.
- Task 10: Ruling: serve an immutable copy of the built artifact for native acceptance — source/build edits restarted Wrangler mid-request and invalidated runs — verification requires recopy/restart after application changes; no mutable dev artifact is release evidence.
- Task 10: Ruling: explicitly mark financial GET routes force-dynamic in addition to no-store — request-time access checks must not depend on framework cache inference — these routes always incur a server read instead of framework caching.
- Final: Ruling: reviewer reserved diagnosis of the native HTTP transport hang for the executor — independently reproduce and finish that gate here; it is not waived — release evidence remains incomplete until the final native route run passes.
- Final: Ruling: carry the existing monotonic retention_version as optional private serverVersion metadata in owner acknowledgements/history/checkpoints — revisions are opaque and cannot order a delayed genuine acknowledgement against a newer history sync — additive DTOs must preserve the counter; legacy missing counters use conservative revision checks.
- Final: Ruling: reset published paid flags when the replacement QR actually commits, rather than retain a duplicate confirmation fingerprint — the QR is already live at that commit, so it is a meaningful published change — a later text-publication failure leaves the already-committed QR and reset status, matching the existing non-atomic QR/text flow.
- Final: Ruling: isolate the oversized-body probe last and retry at most once only when the local runtime returns the exact explicit Worker-restart 503 message — native service-binding transport failures are reported upstream (workerd#7634), while all requests remain identical and domain-idempotent — this is local acceptance with disclosed transport retries, not proof of uninterrupted runtime availability or a waiver of business assertions.

Deferred minor review findings: none.
