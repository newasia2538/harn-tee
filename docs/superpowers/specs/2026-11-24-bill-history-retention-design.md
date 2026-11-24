# Bill history, retention and deletion — approved design

Date: 2026-11-24, Asia/Bangkok. Status: approved by the user, including all recorded proposals and the compact live-total addition. Prepare and review the implementation plans next, preserving the user's Native execution choice and existing checkout/branch preference. No production rollout or deletion has been performed as part of this design work.

## Intent and confirmed decisions

Let people return to bills they created on the same browser, including unfinished drafts, see payment progress and remaining lifetime, and delete a bill and its receiving QR permanently. Keep the existing no-login experience, edit/share capability separation, money formulas, and draft privacy rules.

The user has confirmed:

- History on the same browser/device, including drafts.
- Normal lifetime: 30 days after the latest update.
- Once everyone has paid: 7 days starting when payment becomes complete.
- If a completed bill becomes unpaid/partially paid again: cancel the old 7-day deadline and start 30 days from that status change. Becoming fully paid again starts a new 7-day period.
- Delete the bill **and QR**, invalidate share/edit links, and clean up expired bills when the app is opened.
- Four history statuses: `ดราฟต์`, `รอชำระ`, `ชำระบางส่วน`, `ชำระครบแล้ว`. Show payment progress separately from expiration urgency.
- At least 24 hours remaining: days. Below 24 hours: live `HH:mm:ss` countdown and `ใกล้หมดอายุ` indication.
- Deleted-link design: `การ์ดอธิบายชัดเจน`, sad receipt mascot (latest size preference: 150px), and a bottom-of-screen home action. The explicit written choice takes precedence over later carousel-navigation events.
- Exact description: `ขออภัย ท่านไม่สามารถดูรายละเอียดหรือแก้ไขบิลนี้ได้อีก`.
- Item-entry live totals: the user selected the compact `ยอดพร้อมปุ่มถัดไป` mockup, with a 22px total, a persistent bottom bar, an expandable fee breakdown and the `ตรวจสอบบิล` action beside the total.

## Approach and constraints

Use native IndexedDB for browser history, the existing D1 database for authoritative retention/access decisions, and existing R2 for QR deletion. This follows the user's requested same-browser history and on-open cleanup. There is no new account, device-tracking service, paid integration, or scheduled background job.

Alternatives considered:

| Approach | Benefit | Tradeoff / decision |
| --- | --- | --- |
| Browser history + server deadlines + on-open cleanup | Reuses the existing architecture; works without login; matches the requested trigger | Selected from the user's explicit constraints. Physical cleanup needs an app/bill request; an expired record must never be served while waiting for cleanup. |
| Scheduled server cleanup, in addition to browser history | Can remove expired storage without another visitor | Extra scheduling and operational scope. Not selected for this version. |
| Server-side account/device history | Could support a broader history across devices | Does not match same-browser scope; needs a new ownership/collection model. Not selected. |

Opening a page, refreshing history, copying a link, tab switching and background retries must not extend a bill's lifetime. History reads do not create bills or publish edits. Countdown ticks never call an API.

If nobody opens the app or related links, physical D1/R2 cleanup may wait. Every later read/write checks expiry **before** returning bill/payment/QR data, so delayed cleanup does not allow continued use. This is on-access retention, not a promise of unattended deletion at an exact instant.

## Status and lifetime model

Use server timestamps in UTC milliseconds. One day means 24 hours; 30 days is `30 × 24 × 60 × 60 × 1000` ms, and 7 days is `7 × 24 × 60 × 60 × 1000` ms. The UI formats dates in the browser's locale; no midnight/time-zone rounding changes the deadline.

| State | Trigger / deadline | Presentation |
| --- | --- | --- |
| Draft | Meaningful work exists; 30 days after the last meaningful edit | Grey `ดราฟต์`, action `ทำต่อ`; provisional total when input is incomplete |
| Unpaid | Published, zero relevant payers marked paid; 30 days after last meaningful edit/status change | Light blue `รอชำระ`, `ชำระแล้ว 0/N คน` |
| Partially paid | Published, some relevant payers paid; 30 days after last meaningful edit/status change | Light orange `ชำระบางส่วน`, `ชำระแล้ว M/N คน` |
| Fully paid | Positive payer count and all relevant payers paid; 7 days after transition into this state | Light green `ชำระครบแล้ว`, `ชำระแล้ว N/N คน` |

Builder proposal: a relevant payer has a positive amount due according to the existing calculator. Participants with no purchases/zero due do not prevent completion; a draft or zero-positive-payer record never becomes complete through an empty/all-true calculation. Displayed counts use this same denominator everywhere.

Persist `lastActivityAt`, `allPaidAt` (nullable) and `expiresAt` independently of generic response/storage timestamps. Do not infer retention from browser visits or the current `updatedAt`, which also changes during transport/retry operations.

Meaningful edits are committed changes to bill title, participants, items, payers, prices, fees, payment-recipient fields, QR selection or payment status. Changed raw input in an unfinished draft counts as work even if its normalized amount is still zero. Step navigation alone does not count. Repeating an identical save, payment flag, QR selection or confirmation ID is a no-op for retention.

Lifecycle rules:

1. Creation/first meaningful local draft starts 30 days.
2. A successful meaningful change while not fully paid sets `lastActivityAt = serverNow`, clears `allPaidAt`, and sets `expiresAt = serverNow + 30 days`.
3. A transition to fully paid sets `allPaidAt = serverNow` and `expiresAt = serverNow + 7 days`.
4. A change that leaves a bill fully paid preserves the original `allPaidAt`/7-day deadline; repeated actions cannot keep restarting it.
5. A transition out of fully paid clears `allPaidAt` and starts 30 days from that committed change, as explicitly approved.
6. Existing payment-reset behavior remains for a **meaningfully changed** published form: when an edit resets payment flags, the resulting state is unpaid and the 30-day rule applies. An unchanged published form, including a new confirmation ID with identical normalized business content, preserves paid flags, `allPaidAt`, `lastActivityAt` and the deadline. This narrowly fixes the current unconditional-publication reset for no-op saves; it does not change the calculator or payment-reset behavior for real edits. Validate the live payment/form normally; matching an already-applied confirmation retains the existing lost-response recovery exception. Recording a new confirmation marker may change transport revision without extending retention.
7. At `serverNow >= expiresAt`, all ordinary bill reads/writes and payment/QR actions are denied. Expired bills cannot be renewed or resurrected by a stale tab, pending autosave or retry.

For a remote bill, an offline browser cannot extend the server deadline by changing its local clock or unsynced form. Keep the prior deadline and show `มีข้อมูลที่ยังไม่บันทึก`; reconcile before claiming an extension. A local-only draft uses its saved browser timestamp until it becomes a server bill.

## Browser history and navigation

Add a `บิลของฉัน` entry from the home page and the successful-share screen. Keep creation/resume and history navigation separate so returning home does not silently replace a draft. Starting a fresh bill retains previous history entries.

History uses cards, sorted by last meaningful activity descending. Each card contains:

- Bill title, with `บิลที่ยังไม่ตั้งชื่อ` fallback.
- Total to two decimals; draft provisional wording when needed.
- One payment/draft status badge and, for published bills, `ชำระแล้ว M/N คน`.
- Last activity and remaining lifetime/deadline.
- Draft action `ทำต่อ`; published actions `ดูสรุป`, `แก้ไข`, `คัดลอกลิงก์`; owner action `ลบบิล`.

Use Prompt headings, IBM Plex Sans Thai body text, and the existing Navy & Tangerine palette. Badge text remains dark against soft fills, and icons/words supplement color. Expiry urgency is an additional label, never a replacement for payment status.

An initial empty form does not create a history entry. Add local drafts after meaningful work, upsert the same entry when a server ID/capability is acquired, and update it on publication or an acknowledged change. The same bill must not appear as both a draft and a published bill.

Scope proposal: new history automatically indexes bills created by this browser and local drafts started here. Opening somebody else's **share** link never adds a bill. Opening an **edit** link updates a matching existing history entry; it does not silently import an unrelated bill into history. An explicit cross-device import feature is outside this slice.

Share-link availability is separate from bill availability. Validate the locally saved share capability when synchronizing owner history. If it is missing or stale (for example, another device issued the final draft share capability), disable public-summary/copy-share actions and say `ลิงก์แชร์ในเครื่องนี้ไม่พร้อมใช้งาน`; keep the authorized edit/open action available, including its existing bill preview. Never copy an edit capability as a view-only link, return a nonexistent share link, or rotate a published share capability automatically. Recovering unknown raw published tokens would require new server token storage and is outside this slice. A synchronization request may carry the already-known share proof to return only a `shareUsable` result, not a recovered token.

The history ledger stores only identifiers/capabilities needed to reopen/manage the bill, title, total, counts/status, revision and lifecycle timestamps. It does not duplicate item details, account numbers, phone values, national IDs or QR contents. Existing working drafts may continue storing their approved safe fields/selected QR; typed PromptPay national IDs remain excluded and require re-entry after recovery.

Capabilities remain private to this browser and are never included in analytics, logs, unrelated app calls or history display text. The page keeps the existing shared-device privacy notice. Clearing browser storage removes the local history index; a retained edit link still permits access to a non-deleted bill, but there is no global history discovery without login.

## Item-entry live total bar — approved UI

The user selected `ยอดพร้อมปุ่มถัดไป` after reviewing three interactive alternatives and requested smaller type and a shorter bar. The selected compact revision uses a 22px total, an 11px caption, a 13px action label and a minimum 44px primary button. It combines the latest total and `ตรวจสอบบิล` in one bottom row; tapping the total toggles the item subtotal, Service charge and VAT breakdown above that row. The other alternatives were a floating total with the next action in page flow, and a permanently expanded breakdown with a full-width next action.

Keep this bar visible at the bottom of the available screen throughout the item-entry step. Reserve space for its actual height, including expanded details and validation notices, so it never covers the last field, fee/payment controls or other actions. Allow long amounts, narrow screens and enlarged text to reflow rather than enforcing a fixed height. Keep touch targets usable, retain safe-area spacing, and ensure focused inputs remain reachable when the mobile keyboard is open. Exact positioning and keyboard handling are builder choices to verify on mobile; the contained mockup is a visual reference, not proof of physical-device behavior.

Reuse the current live-total calculator and provisional/unassigned-item notices. The main amount is the receipt total; any collection total after rounding remains separately labeled. Preserve both supported fee scopes and VAT calculation formulas. This layout change must not change money calculations, fee settings, draft persistence or the established navigation/validation rules. Keep the breakdown toggle keyboard accessible and expose its expanded state to assistive technology.

Reference mockup (conversation-owned, not a production asset): `/Users/11356979/.codex/visualizations/2026/09/14/01a09f29-e267-7b11-87a8-a6ce1f8f1c1a/harn-tee-bottom-total-options.html`, variant `ยอดพร้อมปุ่มถัดไป`. The user approved this UI explicitly, then approved the complete design on 2026-11-24.

## Countdown and refresh behavior

- Use `expiresAt` plus a `serverNow` response to estimate server time; use elapsed time, not a decrementing counter that drifts when a tab sleeps.
- Remaining time `>= 24 hours`: `เหลือ X วัน`, where X is the ceiling of remaining milliseconds divided by one day. Show an exact date/time as supporting detail.
- Remaining time `< 24 hours`: `หมดอายุใน HH:mm:ss`, with padded hours/minutes/seconds and an `ใกล้หมดอายุ` badge.
- At zero: no negative time and no local assertion of server deletion. Show `กำลังตรวจสอบวันหมดอายุ` while reconciling; offline shows `รอตรวจสอบเมื่อเชื่อมต่อ`.
- Check deadlines and known bill states on app entry, relevant route entry, returning to a visible tab and reconnecting. Coalesce requests; throttle repeated foreground syncs. Do not poll the backend once per second or announce every countdown second to screen readers.
- A bill updated from another device adopts its current server deadline after synchronization. Unknown remote changes are not merged into an unsaved form.
- Broadcast confirmed deletions/updates to other tabs on the same origin. Other devices revoke cached views on their next request/foreground check; data already downloaded cannot be retroactively removed from a closed/offline device.

## Permanent deletion and access responses

Manual deletion requires the edit capability and a confirmation naming the bill: `ลบบิลและ QR Code` with a clear statement that share/edit links will stop working and the operation cannot be undone. Include the current server revision. If another device changes the bill before deletion, return conflict and let the owner inspect the new version before retrying.

An expired bill can be deleted by the server's retention policy without a client-supplied owner override. Cleanup must use the **current server deadline**, not a stale deadline submitted by the browser.

Deletion must do all of the following:

1. Atomically revoke access, erase the active bill/draft/payment payload, and durably record QR cleanup work using conditional D1 statements. A concurrent successful edit/deadline extension must not be deleted by an older expiry snapshot.
2. Remove the QR from R2 and any pending/replaced QR objects belonging to the deleted bill. Retry cleanup safely after a lost response or storage failure.
3. Remove this browser's corresponding history entry, working/completion checkpoints, aliases and owned QR blobs; do not clear unrelated drafts or history. Remove in-memory details, revealed payment values and QR object URLs when the app learns of deletion.
4. Prevent stale sessions, create-once retries and in-flight QR uploads from restoring the active bill or leaving an untracked QR after deletion. Upload/deletion coordination must durably track cleanup intent before a possible orphan is created; uncertain/in-flight cleanup is not reported as complete.

D1 and R2 are separate stores. Use transactional D1 changes and durable cleanup work, not a claim that one SQL transaction also deletes R2. D1's batch API supplies SQL transaction behavior; R2 deletion is acknowledged separately. [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

**Proposed minimal deletion marker:** retain only non-reversible token digests, an internal identifier, deletion time/reason and deletion state; retain an object key only while cleanup needs it. No bill title, participants, amounts, account/PromptPay values, QR bytes, raw capabilities or creation key survive as bill data. Keep the minimal digests after deletion so an old valid link can be distinguished from a random invalid link and creation-key retries cannot recreate it. The marker is not a restorable bill or a recycle bin.

All bill, draft, publish, share-capability, payment-status, payment-details, QR and legacy routes must use the same lifecycle access decision:

| Result | HTTP / UI behavior |
| --- | --- |
| Active and authorized | Existing response plus allowed lifecycle metadata; no new personal data |
| Unknown/invalid capability | 404, generic not-found state; do not assert it was deleted |
| Deleted and QR cleanup complete | 410 with safe `bill-deleted` code, no payload; approved deleted-bill card |
| Access revoked, cleanup not complete | 410 with safe `bill-deleting` code; show a pending-deletion explanation without claiming QR removal is complete |
| Concurrent change | 409; preserve local work and offer explicit reload/retry |

If the request is offline or QR cleanup fails, a remote bill is not silently removed from history as if everything succeeded. Preserve a minimal pending-delete intent, stop editing/publication, and retry on reconnect/app entry. Confirmation remains bound to its revision; a newer server version conflicts rather than being erased silently. A local-only draft can be deleted entirely in IndexedDB while offline.

## Deleted-link screen

Use the selected `การ์ดอธิบายชัดเจน` layout for both share and edit links after deletion completes:

- Sad receipt mascot, proposed production size 150px with responsive sizing.
- Heading: `บิลนี้ได้ถูกลบออกจากระบบแล้ว`.
- Description, exactly: `ขออภัย ท่านไม่สามารถดูรายละเอียดหรือแก้ไขบิลนี้ได้อีก`.
- Supporting line: `ข้อมูลบิลและ QR Code สำหรับรับชำระเงินถูกลบออกจากระบบแล้ว`.
- Bottom action: `กลับสู่หน้าแรก`, pointing to `/`.
- Never display the deleted bill's title, participants, amounts or payment data.

Keep the bottom action in normal page flow using a full-height page layout and safe-area spacing, so short screens and zoom do not overlap content. Focus the error heading after navigation and keep the button keyboard accessible.

Reference mockup (conversation-owned, not a production asset): `/Users/11356979/.codex/visualizations/2026/09/14/01a09f29-e267-7b11-87a8-a6ce1f8f1c1a/harn-tee-deleted-bill-options.html`. For pending cleanup, reuse the shell but say the system is processing deletion and omit the completed-QR-removal claim.

## Integration and storage changes

Keep domain decisions in a shared bill lifecycle module and keep history persistence separate from recovery-session ownership. Do not spread expiration formulas across UI/routes. Derive summaries with the existing calculator and provide one authoritative status/counts/deadline result.

- Add indexed retention fields to the existing `bills` schema, minimal deletion markers and durable QR cleanup records. Follow the existing Drizzle migration convention.
- Upgrade IndexedDB additively from v1, introducing a history store while preserving existing records/aliases/QR assets. Include a schema version, stable bill/local identity, local-version checks and deduplication.
- Add a bounded history synchronization API using only edit capabilities already known to the caller. Do not add a public bill-list/search API. Batch a bounded number of capability lookups, return safe summaries and `serverNow`, and never log the request body.
- On app entry, trigger a bounded opportunistic maintenance operation over indexed server deadlines and pending cleanup work. It can only affect server-selected expired records, exposes no record list/capabilities, and must not block first paint or scan the entire database on every request. Known expired bills are checked directly regardless of a background batch limit.
- Enforce per-request work/body limits, conditional writes, no-store responses and existing token protections. Aggregate writes/cleanup work and coalesce browser refreshes rather than adding per-card per-second API traffic.
- Treat lifecycle fields as part of the authoritative concurrency snapshot: revisions or conditional predicates must guard relevant activity/completion/deadline fields as well as the existing bill payload/share digest. A deadline-only migration or another device's change must not be overwritten by an older checkpoint or expiry snapshot.
- Extend save/status/publication acknowledgements with lifecycle metadata so the owning client adopts the exact revision/deadline from its committed write, not an unguarded subsequent peer read.
- Preserve published-edit isolation, idempotent publication, safe local checkpoints and the existing national-ID exclusion.

The detailed implementation plan will name exact interfaces, endpoints, transaction predicates, migration/backfill commands and regression fixtures after this design is approved. SQL/R2 concurrency proofs must use the real local bindings as well as unit tests.

## Existing bills and rollout

Do not retroactively erase old production bills immediately when this feature ships. At one deployment migration timestamp, grant existing incomplete/unpaid/partially paid server bills 30 days, and existing fully paid server bills 7 days. Initialize these deadlines once; a later visit does not grant another grace period. New meaningful changes then follow the normal rules. Historical `updatedAt` still remains available for display.

On the browser's one-time v1 upgrade, preserve available historical completion receipts/creation checkpoints and their known edit links, deduplicating by bill identity. Fetch missing summary metadata only through those known capabilities. Old local-only drafts receive a one-time 30-day grace period at the upgrade. A remote record's server deadline always overrides a local grace estimate.

Bills whose links were never recorded on this browser cannot be discovered retroactively. Do not invent an ownership link or expose every server bill to fill history. Existing edit-context working records without creation provenance are not silently reclassified as bills created here.

Stage and verify the additive migration against disposable local D1/R2/IndexedDB first. Production rollout must have a source/migration compatibility plan; an application rollback must not restore deleted data or serve expired records through legacy paths. No production cleanup is part of planning/design approval itself.

## Acceptance evidence required

1. History survives reload and starting another bill; meaningful local drafts and publication deduplicate correctly. Another browser/shared-link viewer does not receive the creator's history. A stale/missing share proof disables only the share-dependent actions, leaves owner opening/editing available, and never exposes an edit token as a public view link.
2. Exactly test day-30 and day-7 boundaries; last payer completes a bill, a payer reverts to unpaid, and completion occurs again. Duplicate status/save/confirmation requests do not extend a deadline. An identical published form with a new confirmation ID preserves payment flags and the original 7-day deadline; a meaningful edit follows the existing reset behavior.
3. Clock/time-zone changes, background-tab sleep and offline return do not generate negative countdowns, extend server life, trigger per-second network requests or silently lose unsaved work.
4. A peer extends a deadline while cleanup uses an old snapshot: the updated bill survives. A delete wins against an update/upload: all access paths stay denied and pending media cleanup remains durable.
5. Delete repeatedly and lose the response; delete while offline; fail R2 deletion; restart before retry. Do not report successful QR deletion early or remove unrelated local records/assets.
6. An expired/deleted bill cannot be read, edited, marked paid, unmasked, fetched as QR or recreated by old creation/publication/autosave retries. Share-only access cannot delete an active bill.
7. Inspect raw D1 and browser persistence: no deleted bill payload/payment/QR remains after completed cleanup; only approved minimal markers remain. Typed PromptPay national IDs never enter any draft/history persistence.
8. Migrating existing records does not cause immediate unannounced deletion, does not reset deadlines on future visits, and does not erase existing recovery data. Known old receipts can be indexed without guessing unknown bill links.
9. Native browser proof of creator history, another-browser edit/payment change, manual/expiry deletion and both deleted-link pages; desktop plus 360×800 without overlap/horizontal overflow, including text zoom and long Thai titles.
10. Run focused regressions, the full existing test suite, nonincremental typecheck and production build. Publish only after required checks or a new explicit release instruction with any verification limits disclosed.
11. On the item-entry step, the compact bottom total and next action stay visible while scrolling a long item list. Editing prices/fees updates the same receipt total as before; tapping the total opens/closes the breakdown. Verify narrow screens, long amounts, expanded notices, text zoom and the mobile keyboard without covered inputs/actions or horizontal overflow. Preserve separately labeled rounding totals and existing validation/navigation behavior.

## Approved proposals and remaining builder choices

Confirmed product rules above remain binding. The user's approval of the full design also accepts the recorded proposals: count only positive-due payers; no lifetime extension/payment reset for reads/no-op saves; preserve minimal non-content deletion markers; one-time 30-/7-day rollout grace; preserve only discoverable existing local history; conditional deletion and honest pending-cleanup/offline states; disable unavailable share actions while retaining owner access rather than adding token recovery/rotation. Earlier paragraphs labeled as proposals record their origin; they are now approved.

The builder may choose module/file split, exact CSS spacing around the approved layout, bounded batch sizes, retry backoff, and the internal cleanup/upload coordination mechanism, provided the stated privacy, race and success criteria are proved. No new login/cron service, undo/recycle bin, cross-device history directory, payment verification or notification system is included.

## Builder check outcome

A fresh read-only builder check on 2026-11-24 raised two planning ambiguities, resolved above as explicit proposals for user review:

- Identical publication versus the current unconditional paid-flag reset: preserve flags/deadline for a real no-op, retain resets for meaningful edits. This follows the already-stated no-op retention rule and avoids making a fully paid bill appear unpaid solely because its owner clicked save again.
- A creator's stale/missing share capability after another device publishes: expose an honest unavailable-share state with owner edit/preview still usable. Do not expand scope into server-side raw token storage or published-link rotation.

No other product questions remain from this check. The user approved the complete design on 2026-11-24. Next, write and review the implementation plans; the prior Native execution preference is preserved.

## Detailed implementation plans

Prepared for plan review after design approval, in execution order:

1. `docs/superpowers/plans/2026-11-24-compact-live-total-bar.md` — independent compact bottom-bar UI.
2. `docs/superpowers/plans/2026-11-24-bill-history-retention.md` — integrated lifecycle, deletion, QR cleanup, local history and verification.

The plans are documentation only at this stage; product implementation and production rollout have not started.
