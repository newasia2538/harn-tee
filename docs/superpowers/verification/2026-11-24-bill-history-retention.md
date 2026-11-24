# Bill history and retention verification

Local implementation on `codex/bill-history-retention-design`. No production migration, deletion, push or deployment performed.

## Automated evidence

- Unit/component suite: 485 passing at Task 8, followed by 48 focused passing tests including storage/offline pages and confirmation snapshot binding.
- Nonincremental TypeScript check and production build passed. ESLint has zero errors; existing/new nonblocking warnings are recorded in the execution ledger.
- Native D1/R2 verifier: 31 assertions passed using disposable local Wrangler storage. Covers one-time unpaid/paid/draft/zero-due grace; exact expiry boundary; real transactional rollback; stale expiry/manual snapshots; creation-key non-resurrection; late/uncertain PUT; retry after Worker restart; old untracked QR keys and minimal deletion markers.
- Built Worker HTTP verifier: 203 assertions passed. Covers real create/publish/history/maintenance/status/unmask/QR routes; 30→7→30→7 transitions; identical published confirmation; private/no-store DTOs; bounded bodies; missing/stale/delete permissions; every expired/deleting/deleted access path; uncertain-upload 202 and eventual 200; creation replay.
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
- At320px history cards wrapped long Thai text and amounts. A15px horizontal overflow was found because body had a320px minimum width while desktop scrollbars reduced client width to305px; fix/recheck is tracked in Task10.
- Native client navigation originally failed with Vinext `navigateClientSide is not a function`. Feature links now use normal document navigation; restarted-build click → history → draft → success → new bill was verified.
- Initial HTTP503 was Wrangler's explicit “worker restarted mid-request” during source/build edits. Stable-build verification passed. The verifier consumes responses, closes probe connections and uses bounded request timeouts.

## Remaining final gates

Task10: final complete suite/type/lint/build/diff gate, narrow-width fix and retest, available text-zoom/mobile checks, one fresh whole-branch review and justified regression fixes. Physical mobile keyboards, a second independent browser engine/device and native IndexedDB inspection are not yet proved by the available browser controls. Fake IndexedDB migration, denied/quota/blocked storage and atomic purge are covered by automated tests.

## Release / rollback order

1. Keep committed `0000` and additive `0001` SQL, snapshots and migration journal unchanged. Apply pending additive migrations **before** uploading the new Worker. Persisted rollout time grants old bills one grace window; request reads/backfill must never re-grant it.
2. The installed Sites storage workflow explicitly applies hosted D1 migrations before uploading its Worker. Local and hosted databases are separate; this run applied only local disposable migrations.
3. Once deletion is enabled, rollback must retain expiry checks, revoked token markers, QR journals and pending cleanup. Use a compatible forward fix/rollback artifact; never restore deleted payloads, drop retention tables or return to the old unrestricted Worker.
4. Preserve current public hosting/audience and existing payment privacy. A future release must use the exact verified source through the existing Sites/GitHub workflow.
