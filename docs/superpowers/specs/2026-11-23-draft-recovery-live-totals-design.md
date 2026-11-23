# harn-tee Draft Recovery and Live Totals Design

Date: 2026-11-23 (Asia/Bangkok)

Status: Approved by the user on 2026-11-23. Approach A is selected. Implementation planning is authorized; application changes wait for plan review and execution handoff.

## Intent

Prevent losing an unfinished bill when its browser tab closes, let an edit-link holder continue an unpublished draft on another device, make it easy to start the next bill after sharing, and show the current amount while entering items.

This extends the existing no-login application and its edit/share capability links. It does not introduce accounts, a bill-history dashboard, collaborative editing, or a new hosting service.

## Confirmed requirements

- Restore the latest successfully saved work in the same browser, including the current form step.
- An edit link can open the bill on another device.
- The user selected approach A: automatic browser saving, plus automatic server saving once an edit link exists.
- Remember recipient name, bank choice/account number, PromptPay phone number, visibility choice and the selected payment QR image.
- Never remember the value entered in the PromptPay national-ID field in a draft. Warn the user that it must be entered again after returning.
- Add a new-bill action to the successful-creation screen with the share/edit links.
- Show the current amount on the item-entry step.

The national-ID exception applies to draft persistence, not to the existing explicit publication of a bill that uses national-ID PromptPay. A confirmed bill retains its existing protected payment-details and masking behavior.

## Approaches considered

### A Selected

Save automatically in the browser and, after the existing draft/edit-link creation point, synchronize unpublished drafts automatically to the server. Another device sees the last server-confirmed snapshot. A local snapshot protects newer work when offline or when a request fails.

This meets the user's cross-device expectation without a manual-save prerequisite. It requires explicit save statuses, queued writes, conflict checks and separate treatment of published bills.

### B Not selected

Save automatically only in the browser; require a manual action to update the server draft. This reduces requests but an edit link can show old content when the user forgets to save.

## Current code and reuse

- `app/harn-tee-client.tsx` owns the bill, step, pending QR file and successful share/edit links in React state. It already computes `calculateBill(draft)` as input changes, but only displays the totals in the preview step.
- The same file creates an unpublished server draft when proceeding past participant entry. Later edits are currently sent only on explicit confirmation.
- `POST /api/bills` permits structurally valid unfinished drafts; `PATCH /api/bills/[token]` currently applies complete-bill/payment validation even to drafts. Autosave must not reuse that complete-only rule unchanged.
- `db/repository.ts` hides unpublished documents and their QR files from share tokens. Preserve this invariant.
- The existing QR endpoint accepts a verified PNG/JPEG/WebP up to 5 MB with an edit token. Direct JSON cannot change a QR object key. Preserve both controls.
- `components/harn-tee/link-panel.tsx` is the successful-creation surface.
- `lib/harn-tee/money.ts` is the authoritative calculator, including fee mode, calculation formula and equal round-up behavior. Do not create another calculator.

## Persistence model

### Browser checkpoint

Use a versioned browser checkpoint, including a locally generated draft identity, context identity, form data, raw unfinished numeric input, current step, last committed local-save time, server identity/revision when available, and a pending-QR blob or safe reference.

Builder decision: use native IndexedDB for checkpoints and QR blobs so QR files do not need to be base64 encoded into a small string-only store. Do not add a third-party storage service. Commit snapshot metadata and its QR association consistently; an existing `File` object alone is not a persistent representation.

Keep one current new-bill draft. Edited existing bills use separate, bill-scoped checkpoints; visiting an edit link must never overwrite or restore an unrelated new bill. This is not a draft-list/history feature.

Keep partial input, including missing names, empty rows, empty payer selection and unfinished price/percentage strings. Restoring must not invent names, select different payers, reset a typed decimal, or replace blank inputs with zero. Raw strings and normalized calculator values are separate; invalid strings do not enter arithmetic or publication.

Do not persist OCR source photographs, snippet images, an OCR worker or an in-progress scan. Items already imported into the bill are part of its checkpoint. Builder proposal for this release: OCR review that has not yet been imported is outside bill-draft recovery; warn before leaving a review when practical, and allow rescanning after return. Do not silently expand receipt-image persistence beyond the previous privacy contract.

### Server checkpoint

Once the existing edit-link creation point succeeds, save the unpublished draft and enough sanitized form metadata for another edit-link holder to continue: partial fields, calculation/fee modes and current step. Keep the same bill and edit token across saves and recovery; normal autosaves must not change the share token or create another bill. The limited pre-publication share-capability handoff below is an exception only when a publishing device lacks a usable share token.

Use a dedicated draft-saving operation or an explicitly draft-scoped branch of the existing API. The exact route/metadata shape is left to the builder. Required boundaries:

- Edit-token authorization only; share tokens cannot save or retrieve an unpublished draft.
- The target must still be unpublished at the moment the update commits. A delayed draft write cannot overwrite a published bill.
- Validate schema, lengths, finite numeric bounds, allowed formats and reference structure, while allowing temporarily incomplete business fields. Full bill and payment validation remains mandatory at publication.
- The server independently sanitizes national-ID values; client sanitization is not the security boundary.
- Raw partial-input metadata must be bounded, sanitized and removed from the published representation.
- QR files use the verified image-upload path, not arbitrary JSON object keys. Upload only when the selected QR changes, never on every text change.
- Use `no-store` responses and preserve existing private QR/payment access behavior. Do not add sensitive values, QR bytes or capability tokens to logs/analytics.
- Make creation retries idempotent or reconcile an uncertain create result. A lost response must not silently create multiple draft bills or lose the only edit capability.

Server-checkpoint metadata is private editing data, not extra fields exposed on the public summary. `BillDocument.version` is a format version, not a write-conflict counter; do not repurpose it.

## National ID and other private data

Apply the national-ID rule before every browser write, draft-create request, draft-save request, QR-associated checkpoint write and retry payload. Persist at most the selection `national-id` and a flag saying re-entry is needed; do not store the value, a masked copy, a prefix/suffix or another derivative in any checkpoint or queued job.

Keep the actual number only in the active page's live state until explicit publication/update, or until the user clears it. Background saving must not erase the number from the active input. Returning to an unpublished draft restores its PromptPay type with an empty national-ID field.

Changing PromptPay type clears its numeric input; it must not carry a national-ID value into the phone field and then autosave it as a phone number. Bounded draft validation must also prevent an overlength phone-field value from becoming a back door for that retained number.

Proposed warning:

> เพื่อความเป็นส่วนตัว เลขประชาชน PromptPay จะไม่ถูกบันทึกในดราฟต์ หากปิดหรือรีเฟรชหน้านี้ กรุณากรอกใหม่

Warn again when recovery leaves that field empty. Publication with national-ID PromptPay still requires a valid re-entered number; saving an incomplete draft does not.

An existing published bill may already contain its authorized national-ID payment details. Opening its edit link may fetch those existing published details as before; they must not be copied into browser checkpoints. The warning must distinguish recovering an unfinished draft from loading an already confirmed bill, rather than claiming that confirmed payment details have been deleted.

Existing masking/reveal/copy controls remain. Local persistence is not a new authentication boundary: anyone using that browser profile may be able to open its draft and edit links. State this clearly near draft recovery. Remembering a QR means saving the image as supplied; the national-ID exception applies to the typed field, not redaction/decoding of text or data inside a QR image.

No automatic expiry or server-record deletion is introduced by this design. Clearing browser site data/private-browser shutdown can remove local recovery; only a successful server checkpoint is available through the edit link on another device.

## Save and recovery behavior

### Saving

- Persist local input promptly while editing, rather than depending on the browser's close event. Mark a local save complete only after its storage transaction commits.
- Debounce/coalesce server writes during typing, serialize requests, and keep the newest queued snapshot. Builder proposal: about one second after a pause, with a bounded maximum delay during continuous typing. Tune the interval without changing the guarantees.
- Show distinct local and server save states and their last successful times. Never label unsent changes as saved on the server. QR saving has its own pending/failure state within the checkpoint's overall result.
- On network failure, retain local changes, show that another device may see older data, and offer retry. Retry with bounded backoff/online recovery; do not spin or issue a request per keystroke.
- If browser storage is unavailable/full, keep the current form usable but report that local recovery is not guaranteed. Do not imply that a failed local write succeeded merely because a server write did.
- A queued asynchronous result belongs to its original draft and generation. It cannot update a newly started bill or mark its content saved.

### Returning in the same browser

Wait for checkpoint loading before enabling default-state autosave; an empty first render must not overwrite saved work. Offer continuation or starting fresh when meaningful unfinished work exists. Show the saved bill title/time when available, but not raw account numbers or capabilities in the recovery notice.

Continuation restores the correct bill/context, form input, step and QR selection, with an empty draft national-ID value. If online, compare the server revision before uploading local state. Starting fresh requires confirmation when it would discard an unfinished local draft; it does not delete an existing server bill. Make the existing draft's edit link available before the user leaves it when one exists.

### Opening an edit link on another device

For an unpublished bill, load the last server-confirmed checkpoint and continue autosaving that same draft. Changes that were only saved on the first device cannot be recovered remotely; show server-save status so the limitation is visible before switching devices. A selected, unuploaded QR is likewise local-only until its server upload is confirmed.

For an already published bill, retain explicit-save behavior: remember unsaved edits locally, scoped to that bill, but do not change the live document or live QR in the background. Another device sees the last explicitly confirmed version, not unpublished local edits. No second cloud workspace for editing published bills is added in this release.

### Conflicting edits

Use a server-issued revision and an atomic conditional write for draft saves, QR association changes and publication. A timestamp comparison only in browser code is insufficient. If another tab/device changed the bill, stop background writes and preserve local work; do not silently choose last-writer-wins or automatically merge monetary/payment data.

Tell the user that a newer server copy exists and offer to load it, with confirmation before replacing local work. A server-confirmed publication also stops all remaining draft autosave attempts. Real-time collaboration and automatic conflict merging are non-goals.

## Publication and starting a new bill

Explicit confirmation pauses/drains the draft-write queue and validates the live form, including a re-entered national ID where selected. Complete required QR upload and final publication in an order that cannot report success with a missing QR or allow a stale autosave to revert the result. On failure keep the checkpoint and inputs for retry; do not show success, delete recovery data or create a duplicate bill.

Publication from a second device's edit link must also produce a working share link. Currently the database holds only token digests, so the original raw share token cannot simply be fetched from the edit document. Builder proposal: when the publishing device lacks a valid share capability, issue a fresh one with edit authorization while the bill is still unpublished, and persist the returned capability locally before the final publication request. Reissuing an unavailable draft-only share capability must be revision-guarded and never rotate an already published bill's share link. If the publication response is lost, reconcile the bill status and the locally retained capability rather than creating another bill or rotating a live link. Do not weaken hashed-token storage or put raw capabilities into public document fields.

After successful creation, replace the unfinished-bill checkpoint with a small completion receipt containing the existing bill identity and share/edit links. This supports reloading the success screen without resubmitting the bill or losing its only admin link. It must not contain another copy of payment details or a QR blob.

Add **เริ่มทำรายการใหม่** to the existing success surface. Starting the next bill creates fresh participant/item identities, blank recipient/payment fields, no inherited QR, default calculation settings, and step zero. It clears the previous completion receipt/current local working state only for that flow; old published bills and their links remain valid on the server. Stop old timers/requests before starting the new generation. Keep a clear reminder to copy the previous edit link before leaving; do not introduce a bill-history screen.

## Current totals during item entry

Reuse the existing `calculateBill` result while editing; never create or publish a bill merely to calculate its amount. Update after item add/edit/remove/import, fee changes, formula changes and payer selection.

Show two-decimal-baht product subtotal, service charge, VAT and total before split-rounding, using the selected bill/item fee mode and VAT calculation formula. Keep the existing per-person round-up policy unchanged. If an amount to collect after rounding is shown, label it separately from the bill total.

An incomplete name or missing payer does not hide the product amount. Show that incomplete rows or payer assignments still need attention; do not present a complete per-person allocation when some items have no payer. Invalid numeric input never produces `NaN`, a negative total or a deceptively complete amount; calculate from valid input and label the result provisional while invalid fields remain.

Placement/spacing are left to the builder using the existing theme/fonts. On mobile the amount must remain easy to find without covering text fields, the keyboard, the add-item action or navigation. Labels and saved-state messages must be accessible and not conveyed only by color.

## Boundaries and acceptance evidence

No login, new paid service, altered share/edit authority, public draft access, receipt-photo persistence, fee-formula changes, automatic live-bill updates, saved-bill deletion or multi-draft history.

Before implementation is considered complete, verify at least:

1. Refresh/close/reopen recovers partial names/items/raw numbers, modes, payer choices, recipient fields, QR and step in the same browser after a confirmed local save.
2. Browser records and draft network/server payloads contain no national-ID field value, even after retries, type switches, another-device edits or recovering a legacy draft. Explicit confirmed-bill behavior remains compatible.
3. An edit link on a clean browser loads the latest server-confirmed unpublished draft and QR; a share link cannot read it.
4. Storage failure, offline use, failed/late requests and concurrent changes do not silently overwrite or discard work or falsely report save success.
5. Editing a published bill or choosing its replacement QR does not change the shared result before explicit confirmation.
6. Publication/reload/new-bill actions do not duplicate bills, inherit private data, lose the success links, revive an old autosave queue or alter the previous bill. Publishing an unpublished draft from an edit link on a clean second browser yields usable share/edit links without rotating any previously published link.
7. Live totals match the existing calculator for both fee modes/formulas and rounding cases, including incomplete and invalid input.
8. Actual browser tests cover recovery and QR behavior plus desktop/mobile layout; unit/API tests cover sanitization, authorization, validation and conflict protection.

## Decisions left to the builder

The exact checkpoint schema, IndexedDB store layout, draft API route names, revision representation, debounce interval, safe retry implementation and component boundaries are implementation decisions, provided the contracts above hold. Prefer extending current modules and storage bindings rather than introducing a new framework or service.

The user approved this design on 2026-11-23. The next deliverable is an implementation plan for review; no application implementation or deployment is part of the design/planning step.
