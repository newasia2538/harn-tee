# Draft Recovery and Live Totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover unfinished bills locally and through edit links without retaining draft national IDs, add a safe new-bill action, and show current totals during item entry.

**Architecture:** A sanitized form contract feeds native IndexedDB checkpoints and a serialized server-save queue. Existing D1 bill rows retain their format version and token digests; private checkpoint metadata and compare-and-swap writes provide draft recovery and conflict protection without a new service or database table. Published bills remain explicit-save-only; the existing calculator supplies live totals.

**Tech Stack:** Existing TypeScript, React 19, Vinext, Zod, D1/R2, Vitest and Testing Library; native IndexedDB/Web Crypto. Add `fake-indexeddb` as a dev-only dependency for storage tests, not an application storage library.

**Spec:** `docs/superpowers/specs/2026-11-23-draft-recovery-live-totals-design.md` (approved 2026-11-23).

## Global Constraints

- No login, new paid service, altered share/edit authority, public draft access, receipt-photo persistence, fee-formula changes, automatic live-bill updates, saved-bill deletion or multi-draft history.
- Never remember the value entered in the PromptPay national-ID field in a draft. Warn the user that it must be entered again after returning.
- The national-ID exception applies to draft persistence, not to the existing explicit publication of a bill that uses national-ID PromptPay.
- Keep the same bill and edit token across saves and recovery; normal autosaves must not change the share token or create another bill.
- `BillDocument.version` is a format version, not a write-conflict counter; do not repurpose it.
- Remember recipient name, bank choice/account number, PromptPay phone number, visibility choice and the selected payment QR image.
- QR: PNG/JPEG/WebP up to 5 MB; retain signature checks, the existing 6 MB multipart/1 MB JSON bounds and edit-token authorization. Never accept client-selected R2 keys.
- Use `no-store` responses and preserve existing private QR/payment access behavior. Do not add sensitive values, QR bytes or capability tokens to logs/analytics.
- No automatic expiry or server-record deletion is introduced by this design.
- Preserve the existing unrelated dirty `tsconfig.tsbuildinfo`; type-check with `--incremental false` and stage explicit task paths only.
- Every task uses red/green tests before implementation and a focused commit; do not install packages, edit application code, push or deploy until the execution handoff is accepted.
- An execution worktree must start from the local commit containing this approved spec and plan, not an older remote default branch that lacks them.

## Review Focus

1. A transaction/request finishes after reset or after another tab changes the same draft: it must not rebind the new-bill slot or replace newer work (Tasks 2, 5, 6, 9).
2. A QR file remains pending while text continues changing, or upload loses a revision race: do not duplicate uploads, detach the selected image or delete the winning QR (Tasks 3–6, 8).
3. Creation/publication succeeds but its response is lost: retry must recover the same bill, its admin capability and a usable share link (Tasks 3–5, 8, 9).
4. National-ID PromptPay changes to phone, or a stored old draft contains an ID: no number or prefix may reach a new checkpoint or retry; live published details must still work (Tasks 1, 4, 6, 7).
5. Storage is blocked/full, a browser is offline, or raw numeric input is incomplete: preserve usable input and honest save/provisional-total states rather than silently treating failure as zero or success (Tasks 1, 2, 5–9).

## File and Interface Map

Create focused files under the existing `lib/harn-tee/` directory:

- `draft-state.ts`: form/checkpoint schemas, sanitization, raw-number normalization and blank-form construction. Reuse `types.ts`, `input.ts`, `payment.ts` and existing bounds; do not move the calculator.
- `draft-store.ts`: IndexedDB transactions, record/alias ownership and QR assets only.
- `draft-api.ts`: typed client requests and classified API errors only.
- `draft-save-queue.ts`: debounce, serialization, retry and stale-generation cancellation only.
- `use-draft-session.ts`: React lifecycle, local recovery, storage/network integration and submission lease.
- `draft-publication.ts`: explicit confirmation and uncertain-result reconciliation only.
- `live-totals.ts`: a safe view model around `calculateBill`, not a replacement calculator.

Create `db/draft-document.ts` for pure private-envelope projections and revision calculation; extend `db/repository.ts` for authorized reads, atomic conditional writes, idempotent draft creation and share-capability issuance. No D1 schema change is planned.

Create API routes `app/api/bills/drafts/route.ts`, `app/api/bills/[token]/draft/route.ts`, `app/api/bills/[token]/share-capability/route.ts`, and `app/api/bills/[token]/publish/route.ts`. Extend existing QR/bill routes where compatibility or sanitization requires it.

Create `components/harn-tee/draft-recovery.tsx`, `draft-save-status.tsx`, and `live-bill-totals.tsx`. Modify existing form editors, `link-panel.tsx`, `app/harn-tee-client.tsx`, and `app/edit/[token]/page.tsx` in their owning tasks. Existing OCR processing and monetary rules are not implementation targets.

### Shared contracts to define in Task 1

- `DraftForm = { draft: BillDraft; step: 0 | 1 | 2; numbers: NumericInputs }`.
- `NumericInputs = { prices: Record<string,string>; itemVat: Record<string,string>; itemService: Record<string,string>; vat: string; service: string }`. Keys must reference current item IDs; strings are at most 32 characters. Absent entries derive display text from normalized values without filling blank zero values.
- `NumericField = {kind: "price" | "item-vat" | "item-service"; itemId: string} | {kind: "vat" | "service"}`.
- `SafeDraftForm`: output type of `persistedFormSchema`; national-ID PromptPay has `value: ""`, phone has at most 10 digits, and only whitelisted bill/raw-input fields exist. Include `paymentReentryRequired: boolean` without another copy of any removed value.
- `RemoteIdentity = { id: string; editToken: string; shareToken?: string; revision: string; status: "draft" | "published"; qrSelectionId?: string }`; the optional selection marker acknowledges which local QR was uploaded and is not an R2 key.
- `DraftAck = { id: string; document: BillDocument; form?: SafeDraftForm; revision: string; lastConfirmationId?: string }`. `form` is present only for unpublished drafts and only with edit authorization.
- `QrSelection = { kind: "none" } | { kind: "local"; selectionId: string; file: File } | { kind: "server" }`; persistence replaces `file` with an owned asset reference and safe filename/type/size metadata.
- `StoredQrSelection = {kind: "none"} | {kind: "server"} | {kind: "local"; selectionId: string; name: string; contentType: "image/png" | "image/jpeg" | "image/webp"; size: number}`; the owned blob is in `qrAssets`.
- `WorkingCheckpoint = { kind: "working"; schemaVersion: 1; localId: string; localVersion: number; formSequence: number; form: SafeDraftForm; remote?: RemoteIdentity; creationKey?: string; pendingConfirmation?: {id: string; formSequence: number}; qr: StoredQrSelection; savedAt: number; serverSavedAt?: number }`. Increment `formSequence` only for user/form/QR changes, not save acknowledgments. Reuse a pending confirmation ID only while its form sequence is unchanged.
- `CompletionCheckpoint = { kind: "complete"; schemaVersion: 1; localId: string; localVersion: number; billId: string; shareUrl: string; editUrl: string; savedAt: number }`; no form, QR asset or payment copy.
- `DraftContext = { kind: "new" } | { kind: "edit"; editToken: string }`. Storage aliases are `new` and `edit:` plus the existing `hashToken(editToken)` digest, never a raw capability in a key/log.
- `WriteResult<T> = { kind: "ok"; value: T } | { kind: "not-found" } | { kind: "conflict"; code?: "revision-conflict" | "not-draft" | "share-proof-stale" }`.

## Protocol Decisions

**Revision:** Use the existing SHA-256/Base64URL helper as `hashToken(payload_json + "\0" + share_token_digest)` over the exact stored strings. Include the share digest because a draft share-capability rotation must change the revision even within the same millisecond. A mutation reads the original row and atomically updates `WHERE id = ? AND payload_json = ? AND share_token_digest = ?`; draft-only changes additionally require the stored status to remain `draft`. Check `meta.changes === 1`; a preflight read alone is not protection. Return plain revisions in JSON, quote them for HTTP `ETag`/`If-Match` headers, and never expose these private envelopes through share reads.

**Private envelope:** Store optional `draftForm: SafeDraftForm` and `lastConfirmationId: string` alongside existing bill fields in `payload_json`. Existing rows without them remain valid. `readBillByToken` must project a plain `BillDocument`; only the new edit-only draft endpoint projects `draftForm`. Publication removes `draftForm`; a public response never relies solely on that removal for redaction.

**Creation retry:** Before its first create request, the official client generates a 32-random-byte Base64URL `creationKey` with `createOpaqueToken()` and saves it locally if storage works. Derive retry-stable edit/share capabilities on the server with `hashToken("harn-tee:draft-edit:v1:" + creationKey)` and the distinct label `harn-tee:draft-share:v1:`. Store only the resulting token digests, not the key or raw tokens. A unique edit-token digest plus `INSERT OR IGNORE` and reread returns the same bill without applying the old request body again. Return a derived share token only while its digest still matches the row; a rotated draft share capability cannot be reconstructed from the creation key. Treat the key as an admin secret and never log it. Existing non-draft creation remains compatible.

**Endpoints:** New server operations preserve existing JSON limits. `POST /api/bills/drafts` accepts `{creationKey, form}` and returns `DraftAck & {editToken, shareToken?}`. `GET /api/bills/:token/draft` is edit-only and returns `DraftAck`, even for an already published bill so clients can reconcile. `PUT` on that route accepts `{form}` and requires `If-Match`; missing preconditions return 428, conflicting revision/status returns 409, unauthorized/missing resources return 404. `POST .../share-capability` requires `If-Match` and draft status, returning `{shareToken, revision}`. `POST .../publish` requires `If-Match`, `{confirmationId, form: DraftForm, shareToken?}`, full validation and a valid current share capability for first publication. The same persisted `confirmationId` reconciles an already applied confirmation before rejecting an outdated revision. Published updates never rotate the share link. Authorized conflict responses distinguish safe codes `revision-conflict`, `not-draft`, and `share-proof-stale`; callers must not treat every conflict as permission to reissue a capability.

**QR:** Keep `POST /api/bills/:token/qr`; new callers send `If-Match` and `X-Harn-Tee-Save-Mode: draft | confirm`. Draft mode can only commit to an unpublished row. Confirm mode is invoked only after the user confirms a published edit. Retain old authorized-client compatibility with atomic read/write protection even when headers are absent. Upload a fresh object, CAS the association, then remove the old object; on CAS failure remove only the newly uploaded unreferenced object. Return the new revision, never delete the winning old QR on conflict.

**Partial input:** Bounded structural validation permits missing names, empty items/payers and partial raw numbers. Typed national-ID values and overlength phone values are cleared in the server's sanitizer before persistence; client sanitization prevents official draft requests from transmitting them. Autosave transport sets `recipient.qr` to `null`; the server preserves its authorized current QR association and rejects any non-null client key. Confirmed publication uses normalized complete numeric input and full existing business/payment validation.

---

### Task 1: Safe Form and Checkpoint Contracts

**Files:** Create `lib/harn-tee/draft-state.ts`, `tests/harn-tee/draft-state.test.ts`. Modify `lib/harn-tee/types.ts` only for compatible type exports if needed.

**Interfaces:** Consumes existing `BillDraft`, `RecipientData` and `createOpaqueToken`. Produces the shared contracts above, `makeBlankForm(): DraftForm`, `sanitizeDraftForm(form: DraftForm): SafeDraftForm`, `parseStoredCheckpoint(value: unknown): WorkingCheckpoint | CompletionCheckpoint`, `setNumericInput(form: DraftForm, field: NumericField, raw: string): DraftForm`, `parseNumericInput(raw: string, kind: "price" | "percent"): {value: number | null; complete: boolean}`, `validateFormForPublication(form: DraftForm, hasPendingQr?: boolean): ValidationResult`, and `changePromptPayType(recipient: RecipientData, type: "phone" | "national-id" | null): RecipientData`. Numeric price values are integer satang; percentage values are percentages, not fractional multipliers. Export `NumericField` for editors. Publication validation combines raw-number completeness, existing bill/payment validation and safe aggregate amounts; Task 4 merges the server-owned QR before validation and never uses the pending-file exception.

- [ ] **1. Write failing contract tests** with these exact assertions and fixtures containing IDs `p1`/`i1`:
  ```ts
  expect(sanitizeDraftForm(idForm).draft.recipient?.promptPay).toEqual({type: "national-id", value: ""});
  expect(JSON.stringify(sanitizeDraftForm(idForm))).not.toContain("1234567890123");
  expect(changePromptPayType(idForm.draft.recipient!, "phone").promptPay?.value).toBe("");
  expect(setNumericInput(form, {kind: "price", itemId: "i1"}, "7.").numbers.prices.i1).toBe("7.");
  ```
  Also pin: live `idForm` is unchanged; phone/account/visibility survive; phone `1234567890123` becomes empty, not a prefix; hostile extra OCR/QR data is excluded; NaN/negative/out-of-range normalized values are not accepted into saved arithmetic; empty input stays empty; raw maps lose deleted-item keys; future checkpoint versions fail closed without auto-deleting the stored record. `makeBlankForm` uses fresh IDs, `bill`/`vat-after-service`, empty names/payment fields and zero normalized fees.
- [ ] **2. Run red:** `npm test -- tests/harn-tee/draft-state.test.ts`; expect missing exports/failed behavioral assertions, not a setup error.
- [ ] **3. Implement the listed contracts and strict Zod schemas** using current 100-person/500-item, 120/200/160-character and 0–100% bounds. Preserve raw inputs separately; incomplete/invalid numeric input yields a safe zero contribution plus a provisional flag, never silent publishability. `parseNumericInput` accepts at most two fractional digits, rejects exponent/negative/unsafe values and marks an unfinished trailing dot incomplete; it does not rewrite the raw string. Do not trim unfinished names in the recoverable form. Reuse `calculateBill` to check safe aggregate amounts, not another monetary formula.
- [ ] **4. Run green:** the same focused command plus `npm test -- tests/harn-tee/payment.test.ts tests/harn-tee/money.test.ts`; expect all selected tests passing.
- [ ] **5. Commit:** stage only Task 1 paths; message `feat: define sanitized draft checkpoints`.

### Task 2: Transactional Browser Storage and QR Recovery

**Files:** Create `lib/harn-tee/draft-store.ts`, `tests/harn-tee/draft-store.test.ts`. Modify `package.json`, `package-lock.json` for dev-only `fake-indexeddb`.

**Interfaces:** Consumes Task 1 records. Produces `openDraftStore(factory?: IDBFactory): Promise<DraftStore>` with `read(context: DraftContext): Promise<WorkingCheckpoint | CompletionCheckpoint | null>`, `writeWorking(record: WorkingCheckpoint, expectedVersion: number | null, qrFile?: File): Promise<WorkingCheckpoint>`, `loadQr(localId: string, selectionId: string): Promise<File | null>`, `bindEditContext(localId: string, editToken: string, expectedVersion: number): Promise<WorkingCheckpoint>`, `writeCompletion(record: CompletionCheckpoint, expectedVersion: number): Promise<CompletionCheckpoint>`, `startNew(previousLocalId?: string): Promise<WorkingCheckpoint>`, and `close(): void`. Typed storage/conflict failures reject rather than masquerading as empty storage. `qrFile` supplies bytes only for a new selection; `loadQr` reconstructs them with the recorded filename/type.

- [ ] **1. Add the test-only dependency and write failing native-adapter tests:** `npm install --save-dev fake-indexeddb`. In this Node-environment test import `IDBFactory` from that package and inject a fresh factory. Assert a write/reopen round trip preserves `"7."`, step `1`, recipient phone and QR bytes; a second handle with an old local version cannot overwrite a newer record; abort leaves both the old snapshot and old QR reference intact; a completed record contains neither `form` nor asset; replacing `new` cannot delete another edit-scoped record; an old write cannot reclaim `new` after reset. Inject quota/open/blocked failures and assert rejection without wiping the previous record.
  ```ts
  // Test: "round-trips partial input and its QR across store reopen".
  expect(await reopened.read({kind: "new"})).toMatchObject({form: {step: 1, numbers: {prices: {i1: "7."}}}});
  expect(new Uint8Array(await (await reopened.loadQr(localId, selectionId))!.arrayBuffer())).toEqual(pngBytes);
  ```
- [ ] **2. Run red:** `npm test -- tests/harn-tee/draft-store.test.ts`; expect the adapter behavior to fail.
- [ ] **3. Implement IndexedDB `harn-tee-drafts`, version 1**, with `records`, `aliases` and `qrAssets` stores. Alias values reference a canonical `localId`; new/edit aliases may reference the same draft. Store each selected QR once under an owned selection ID and update metadata/association atomically; text saves do not rewrite its blob. Resolve only on transaction completion, re-sanitize at the write boundary, check local version and alias ownership in the transaction, and remove only unreferenced assets owned by the replaced draft. On `versionchange`, close and report the blocked session without deleting data.
- [ ] **4. Run green:** `npm test -- tests/harn-tee/draft-store.test.ts tests/harn-tee/draft-state.test.ts`; expect all passing. Test the production native adapter, not a memory replacement for `DraftStore`.
- [ ] **5. Commit:** Task 2 paths only; message `feat: persist recoverable browser drafts`.

### Task 3: Conditional Server Checkpoints and Retry Identity

**Files:** Create `db/draft-document.ts`, `tests/db/draft-checkpoints.test.ts`, `tests/helpers/draft-fixtures.ts`, `tests/helpers/conditional-bill-db.ts`. Modify `db/repository.ts`; extend `tests/db/repository-sensitive-access.test.ts` as needed.

**Interfaces:** Produces `readEditCheckpoint(editToken: string): Promise<DraftAck | null>`, `createDraftOnce(creationKey: string, form: SafeDraftForm): Promise<DraftAck & {editToken: string; shareToken?: string}>`, `saveDraftCheckpoint(editToken: string, revision: string, form: SafeDraftForm): Promise<WriteResult<DraftAck>>`, `issueDraftShareCapability(editToken: string, revision: string): Promise<WriteResult<{shareToken: string; revision: string}>>`, and `publishCheckpoint(editToken: string, revision: string, form: DraftForm, confirmationId: string, shareToken?: string): Promise<WriteResult<DraftAck>>`. Pure `revisionOf(payloadJson: string, shareTokenDigest: string): Promise<string>` reuses `hashToken`; private-envelope projections are not public types.

- [ ] **1. Write failing repository tests:** fixtures supply token digests and actual payload strings; the conditional DB test adapter evaluates row predicates and reports `meta.changes`, rather than accepting every UPDATE. Assert:
  ```ts
  // Test: "rejects stale/draft-after-publish writes and deduplicates creation".
  expect((await saveDraftCheckpoint(edit, staleRevision, safeForm)).kind).toBe("conflict");
  expect((await saveDraftCheckpoint(edit, publishedRevision, safeForm)).kind).toBe("conflict");
  expect((await createDraftOnce(key, safeForm)).id).toBe((await createDraftOnce(key, changedForm)).id);
  ```
  Pin concurrent same-key creation, unchanged first body on retry, partial raw/name recovery, no ID/key/raw token in stored JSON, legacy rows without metadata, same-millisecond updates and share-token rotations changing revision, share denial for drafts, no private metadata in any plain-document projection, wrong/stale share proof rejection, draft-only capability rotation, published-link stability, and replay of an applied `confirmationId` returning success without resetting payments again.
- [ ] **2. Run red:** `npm test -- tests/db/draft-checkpoints.test.ts`; expect conditional-write/privacy assertions failing.
- [ ] **3. Implement the protocol decisions above.** Reuse token lookup/security; CAS against the exact row payload/share digest, keeping format version 1 and table/index definitions unchanged. Strip national-ID values from both form and document projections of a legacy unpublished draft; do not copy them into new checkpoints. Preserve complete published-update validation at the API boundary. For legacy mutation helpers, prevent a read-before-publication draft from later overwriting published state; paid-status mutation must reject unpublished bills. Keep existing confirmed financial-change/payment-reset semantics.
- [ ] **4. Run green:** `npm test -- tests/db/draft-checkpoints.test.ts tests/db/repository-sensitive-access.test.ts tests/harn-tee/repository.test.ts tests/harn-tee/tokens.test.ts`; expect all passing, including existing access tests. Actual D1 SQL is additionally verified in Task 10.
- [ ] **5. Commit:** Task 3 paths only; message `feat: add conditional server draft storage`.

### Task 4: Authorized Draft APIs and Safe QR Association

**Files:** Create the four new routes in the file map and `tests/api/draft-recovery.test.ts`, `tests/api/draft-publication.test.ts`. Modify `lib/harn-tee/server-validation.ts`, existing bill/QR routes, `db/repository.ts` QR association helper, and `tests/api/qr-security.test.ts`, `tests/api/bill-mutation-security.test.ts`.

**Interfaces:** Consumes Task 3 repository results; produces the exact HTTP contract in Protocol Decisions. Extend `saveQrForEditToken(token, file, options?: {revision?: string; mode?: "draft" | "confirm"})` compatibly; distinguish a conflict from an invalid token so the route can return 409.

- [ ] **1. Write failing API tests:** assert `PUT .../draft` returns 428 without `If-Match`, 409 for stale/published targets and 404 for share/bad tokens; empty names/items/payers and `"7."` round-trip; malformed shapes, unknown keys, dangling payer IDs and oversized bodies fail; caller-supplied non-null QR keys fail. Assert national ID/overlength phone are absent from persisted create/save calls even when directly supplied to the API. `GET` hides legacy draft IDs, rejects share access, and never adds checkpoint metadata to shared/published document responses. Confirm publication rejects partial/invalid raw numbers and an empty national ID, but permits a valid ID on explicit confirmation only. Verify CAS-losing QR upload deletes its own fresh object, not the currently associated object; QR completion advances the revision so an old text save conflicts.
  ```ts
  // Test: "requires an atomic write precondition before saving a draft".
  const response = await PUT(new Request("https://harn-tee.test/api/bills/e/draft", {method: "PUT", body: JSON.stringify({form: safeForm})}), {params: Promise.resolve({token: "e"})});
  expect(response.status).toBe(428);
  expect(repository.saveDraftCheckpoint).not.toHaveBeenCalled();
  ```
- [ ] **2. Run red:** `npm test -- tests/api/draft-recovery.test.ts tests/api/draft-publication.test.ts tests/api/qr-security.test.ts`.
- [ ] **3. Implement strict request/response mapping and existing upload checks.** Keep `POST /api/bills` and existing full `PATCH` clients working; sanitize any legacy draft creation path as well. Publication removes private form metadata, preserves server-owned QR, and checks full bill/payment/raw-number validity. Use generic bounded errors, not request-body/token logging. No share token may be used to mint capabilities or read unpublished QR.
- [ ] **4. Run green:** the red command plus `npm test -- tests/api/bill-mutation-security.test.ts tests/api/payment-details.test.ts tests/harn-tee/server-validation.test.ts`; expect all passing.
- [ ] **5. Commit:** Task 4 paths only; message `feat: expose secure draft recovery APIs`.

### Task 5: Typed Transport and Serialized Autosave

**Files:** Create `lib/harn-tee/draft-api.ts`, `lib/harn-tee/draft-save-queue.ts`, `tests/harn-tee/draft-api.test.ts`, `tests/harn-tee/draft-save-queue.test.ts`.

**Interfaces:** Export `DraftApi`: `create(creationKey: string, form: SafeDraftForm, signal?: AbortSignal): Promise<DraftAck & {editToken: string; shareToken?: string}>`; `load(editToken: string, signal?: AbortSignal): Promise<DraftAck>`; `save(editToken: string, revision: string, form: SafeDraftForm, signal?: AbortSignal): Promise<DraftAck>`; `uploadQr(editToken: string, revision: string, file: File, mode: "draft" | "confirm", signal?: AbortSignal): Promise<DraftAck>`; `issueShare(editToken: string, revision: string, signal?: AbortSignal): Promise<{shareToken: string; revision: string}>`; `publish(editToken: string, revision: string, form: DraftForm, confirmationId: string, shareToken?: string, signal?: AbortSignal): Promise<DraftAck>`. Only `publish` accepts a live form. Produce `createDraftSaveQueue({save, onState})` returning `enqueue(form: SafeDraftForm): void`, `flush(): Promise<void>`, `retry(): void`, and `stop(): void`; `save(form: SafeDraftForm, signal: AbortSignal): Promise<void>` captures the session's current remote revision, not a stale creation-time one. Typed API errors expose a safe status/code, not the request body.

- [ ] **1. Write failing transport/fake-timer tests:** draft JSON is whitelisted and has `recipient.qr: null`/no national ID; `If-Match` is correctly quoted; 409/404/network errors stay distinct; secret values are not included in surfaced errors. At 999 ms expect no write; at 1000 ms expect one; with continuous changes expect a write by 5000 ms. While the first save is unresolved, queue two newer forms and assert only the newest is sent next. After `stop()`, late resolutions cannot report saved or start retries. Conflict stops retries; offline/network failure retains the newest safe form. Retry delays are 1000, 2000, 5000, 15000 then capped at 30000 ms, reset on successful save/manual retry.
  ```ts
  // Test: "debounces a safe snapshot for 1000 ms without a premature saved state".
  queue.enqueue(safeForm); await vi.advanceTimersByTimeAsync(999);
  expect(save).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(1);
  ```
- [ ] **2. Run red:** `npm test -- tests/harn-tee/draft-api.test.ts tests/harn-tee/draft-save-queue.test.ts`.
- [ ] **3. Implement the transport and queue without React or storage responsibilities.** Abort and invalidate the generation on stop; `flush` drains an existing in-flight request followed by the newest pending snapshot. Never capture a live national-ID form in a background retry job. Report saved only for the acknowledged snapshot; a newer queued snapshot remains pending.
- [ ] **4. Run green:** the same command; expect no extra writes after stopping, and all timer assertions passing.
- [ ] **5. Commit:** Task 5 paths only; message `feat: queue draft autosaves safely`.

### Task 6: Recovery Session and Local First Lifecycle

**Files:** Create `lib/harn-tee/use-draft-session.ts`, `tests/harn-tee/draft-session.test.tsx`.

**Interfaces:** `useDraftSession({initialDocument?, initialSnapshot?, editToken?, dependencies?}): DraftSession`, with `initialDocument?: BillDocument`, `initialSnapshot?: DraftAck`; inject `store`/`api` only for tests. Export `DraftSession` and `SubmissionContext` types here. The session exposes `form: DraftForm`, `setForm(updater: (form: DraftForm) => DraftForm): void`, `qr: QrSelection`, `selectQr(file: File): Promise<void>`, `phase` (`hydrating | recovery | editing | submitting | complete`), `recovery: WorkingCheckpoint | null`, `resume(): Promise<void>`, `startFresh(): Promise<void>`, `localSave`, `remoteSave`, `remote?: RemoteIdentity`, `retrySave(): void`, `loadLatest(): Promise<void>`, `ensureRemote(): Promise<RemoteIdentity>`, `prepareSubmission(): Promise<SubmissionContext>`, `rememberRemote(remote: RemoteIdentity): Promise<void>`, `completeSubmission(receipt: CompletionCheckpoint): Promise<void>`, `failSubmission(): void`, and `beginNew(): Promise<void>`. `SubmissionContext = {form: DraftForm; remote: RemoteIdentity; qr: QrSelection; confirmationId: string; generation: string}` is produced only after an explicit click pauses/drains queues. `rememberRemote` updates the active identity before attempting its sanitized durable write, and never overwrites live form input. Save states carry `status`, `savedAt?` and a safe error code. Completion is also observable as `completion: CompletionCheckpoint | null`.

- [ ] **1. Write failing hook tests using `renderHook`/`act`:** hydration never writes an empty default over a deferred stored record; continuation restores raw `"7."`, step/modes/payers/QR and omits ID while active typing keeps its ID; new/edit aliases for the same bill resolve the same checkpoint, unrelated edit links do not touch `new`; remote autosave begins only after `ensureRemote`, and two calls share one creation key/request. A published edit never calls draft save or uploads QR in the background. Network failure keeps local state and newer-form status; loading newer remote data requires an explicit recovery action; late local/remote acknowledgments cannot mutate a reset session. Pin local-version and server-revision conflicts, no national ID in persisted/queued payloads, no auto-merge, QR selection deduplication and failed storage without a false saved indicator.
  ```ts
  // Test: "does not overwrite a deferred checkpoint before continuation".
  expect(store.writeWorking).not.toHaveBeenCalled();
  expect(result.current.phase).toBe("recovery");
  await act(() => result.current.resume());
  expect(result.current.form.numbers.prices.i1).toBe("7.");
  ```
- [ ] **2. Run red:** `npm test -- tests/harn-tee/draft-session.test.tsx`.
- [ ] **3. Implement the hook over Tasks 1/2/5.** Serialize local writes promptly with latest-only coalescing, awaiting transaction completion for timestamps; use a fresh page generation and compare both remote revision and local version before resuming uploads. Preserve local work until the user confirms loading a conflicting copy. Always load the latest server snapshot on edit entry and after an uncertain request; adopt an acknowledgment after a lost autosave response only when its sanitized form and QR association match the attempted write, otherwise preserve conflict handling. On recovery, a published snapshot with a matching pending confirmation ID and retained valid share capability restores the success receipt without demanding an ID that was intentionally not saved. Reconstruct a selected `File` with `loadQr` only after successful recovery. If a server-only QR exists, represent it as `kind: "server"`; do not reupload it. An uploaded local selection is marked in `remote.qrSelectionId`; text saves and submit retries skip its upload. Subscribe/unsubscribe online/page lifecycle listeners; lifecycle events may flush, but are not the only save mechanism. Regenerate a pending confirmation ID when `formSequence` changes, not on a transport retry.
- [ ] **4. Run green:** the red command plus Task 1/2/5 tests; expect independent local/server errors and preserved input. Do not mock sanitization or queue ordering within their owning tests.
- [ ] **5. Commit:** Task 6 paths only; message `feat: restore browser draft sessions`.

### Task 7: Recoverable Numeric Editors and Current Totals

**Files:** Create `lib/harn-tee/live-totals.ts`, `components/harn-tee/live-bill-totals.tsx`, `tests/harn-tee/live-totals.test.ts`, `tests/harn-tee/live-bill-totals.test.tsx`, `tests/harn-tee/fee-editor.test.tsx`, `tests/harn-tee/payment-editor.test.tsx`. Modify `components/harn-tee/item-editor.tsx`, `fee-editor.tsx`, `payment-editor.tsx`, and `tests/harn-tee/item-editor.test.tsx`.

**Interfaces:** `selectLiveTotals(form: DraftForm): {calculation: CalculationResult; provisional: boolean; invalidFields: string[]; unassignedCount: number}`; reuse `calculateBill` only. `<LiveBillTotals form={form}/>` renders an accessible region named `ยอดล่าสุด`. Add optional controlled `numbers`/`onNumericChange(field: NumericField, raw: string)` editor props, retaining old standalone behavior when absent. Payment type switching consumes Task 1 `changePromptPayType`; accept `nationalIdReentryRequired?: boolean` for recovery warning context.

- [ ] **1. Write failing pure/component tests:** for 100.00, 10% service and 7% VAT assert totals `100.00 / 10.00 / 7.70 / 117.70`, or `117.00` with `separate`. For item-level fees pin 175.45 after service and 174.50 separately using the existing 100/50 item fixture. For 100.00 split three ways, bill total remains 100.00 and any collected amount is separately labeled 100.02. Rerender after add/remove/import/formula changes; missing payers still contribute to bill total but trigger a warning. Invalid/negative/NaN/overflow raw values produce no invalid currency text and make the total provisional. Controlled input recovers `"7."`/empty fields without zero autofill; changing PromptPay type clears its value; ID warning text is exact and the phone field cannot retain 13 digits.
  ```ts
  // Test: "uses the existing VAT-after-service amount before split rounding".
  expect(selectLiveTotals(form100).calculation.grossTotalSatang).toBe(11770);
  expect(selectLiveTotals(form100Separate).calculation.grossTotalSatang).toBe(11700);
  ```
- [ ] **2. Run red:** `npm test -- tests/harn-tee/live-totals.test.ts tests/harn-tee/live-bill-totals.test.tsx tests/harn-tee/item-editor.test.tsx tests/harn-tee/fee-editor.test.tsx tests/harn-tee/payment-editor.test.tsx`.
- [ ] **3. Implement controlled raw inputs and the totals view.** Clamp only calculation contributions, never overwrite the user's raw display string to hide invalid input; explicit confirmation remains blocked. Put a normal-flow totals card above the item editor when integrating, with no fixed overlay/keyboard obstruction. Use existing theme/fonts, two decimals and labels `ยอดสินค้า`, `Service charge`, `VAT`, `ยอดรวมตามใบเสร็จ`; show a provisional/incomplete notice when needed. Leave `money.ts` formulas and existing OCR import allocation intact.
- [ ] **4. Run green:** the red command plus `npm test -- tests/harn-tee/money.test.ts tests/harn-tee/receipt-import.test.ts tests/harn-tee/receipt-scanner.test.tsx`; expect all passing.
- [ ] **5. Commit:** Task 7 paths only; message `feat: show live bill totals while editing`.

### Task 8: Explicit Confirmation and Lost Response Recovery

**Files:** Create `lib/harn-tee/draft-publication.ts`, `tests/harn-tee/draft-publication.test.ts`. Extend Task 6 submission methods and tests only where these concrete contracts require integration.

**Interfaces:** `confirmDraftPublication(context: SubmissionContext, io: {api: DraftApi; rememberRemote(remote: RemoteIdentity): Promise<void>}, options?: {recoveryCopyAcknowledged?: boolean}): Promise<{remote: RemoteIdentity; document: BillDocument}>`. It never saves a live form as a checkpoint. Export `RecoveryCopyRequiredError` with safe message/code `recovery-copy-required` and an in-memory `remote` property; never log or persist that error object. The caller owns `prepareSubmission`, `completeSubmission` and `failSubmission`; recovery acknowledgment is bound to the currently copied share/edit URLs and generation, not a blanket bypass.

- [ ] **1. Write failing orchestration tests:** pending autosave cannot overtake publication; upload a changed QR once and use its returned revision; failed upload prevents first publication and completion; no changed QR means no upload. Missing draft share token triggers guarded issuance and `rememberRemote` before publish. A stale existing share proof triggers safe draft-only reissuance, never published-link rotation. National ID reaches only the explicit publish request and is absent from identity persistence. A lost publish response loads the edit snapshot, recognizes the same `lastConfirmationId`, and produces the retained share/edit links without creating another bill. If another confirmation won, return conflict and preserve work. Recovery of a published update keeps existing payment semantics; failed explicit updates do not clear the local draft.
  ```ts
  // Test: "does not publish when its selected QR failed to upload".
  api.uploadQr.mockRejectedValue(new Error("upload failed"));
  await expect(confirmDraftPublication(contextWithQr, io)).rejects.toThrow("upload failed");
  expect(api.publish).not.toHaveBeenCalled();
  ```
- [ ] **2. Run red:** `npm test -- tests/harn-tee/draft-publication.test.ts`.
- [ ] **3. Implement reconciliation → upload → capability readiness → confirmation using current revisions.** Load the edit snapshot first; if its confirmation marker already matches this attempt, return that success without requiring the deliberately unsaved national ID or resending the body. Otherwise validate live complete numbers/payment before remote mutation; reuse a pending confirmation ID only for the same form sequence. After uploading, retain the selection marker and returned revision with `rememberRemote` so a later failure does not reupload the same QR. Persist the issued capability before final publication when storage works. On a storage failure throw `RecoveryCopyRequiredError` unless the user has acknowledged copying these exact links; after that acknowledgment permit a volatile submission with an honest durability warning. A new capability resets the acknowledgment. A lost response is resolved by the edit-only confirmation marker. Reissue a capability only for `share-proof-stale` on an unchanged draft revision, never for general revision conflicts; do not resubmit a different form or rotate a published share token. Explicit published QR/body failures must report partial progress honestly and reload the revision before retry. All wire forms send `recipient.qr: null`; the server validates against its existing authorized QR instead of accepting a client-selected key.
- [ ] **4. Run green:** the red command plus Task 4 publication and Task 6 tests; expect no duplicate create/publish or national-ID checkpoint on any failure path.
- [ ] **5. Commit:** Task 8 paths only; message `feat: preserve bill confirmation recovery`.

### Task 9: App Recovery, Save Status and New Bill Flow

**Files:** Create `components/harn-tee/draft-recovery.tsx`, `components/harn-tee/draft-save-status.tsx`, `tests/harn-tee/harn-tee-draft-flow.test.tsx`, `tests/harn-tee/link-panel.test.tsx`. Modify `app/harn-tee-client.tsx`, `app/edit/[token]/page.tsx`, `components/harn-tee/link-panel.tsx`, and `receipt-scanner.tsx` only for the review-not-persisted notice.

**Interfaces:** `<DraftRecovery candidate onResume onStartFresh>` owns user confirmation, not storage; `<DraftSaveStatus local remote onRetry onLoadLatest>` shows independent states without displaying capabilities/payment numbers. Add `onStartNew?: () => void` to `LinkPanel`. App form handlers use Task 6 `setForm` and Task 1 raw-number updates; WebMCP remains wired to the same live draft.

- [ ] **1. Write failing whole-flow interaction tests:** reload/re-mount a partially filled form and continue at step 1 with the correct amounts/QR; no save before choosing recovery; unmount during a pending read does not create a blank record; edited published data stays local until clicking save. A successful create renders share/edit links; re-mount renders the completion receipt without resubmitting. Clicking `เริ่มทำรายการใหม่` yields step 0 and fresh IDs; advance with a new participant and verify no name/account/phone/ID/QR inheritance or old-generation write. Confirm starting fresh over an unfinished local draft, but never send server DELETE. Retry/conflict/storage states expose correct actions, not a blanket saved message. Recovered ID stays empty and blocks national-ID publication until entered, except recovery of an already applied confirmation which restores its receipt without resubmission/re-entry. In storage-failure confirmation fallback require copying and acknowledging recovery links. Assert an imported OCR item survives, while pending OCR images/results are not checkpointed.
  ```ts
  // Test: "starts a blank next bill without another submission or deletion".
  await user.click(screen.getByRole("button", {name: "เริ่มทำรายการใหม่"}));
  expect(screen.getByText("ใครอยู่ในบิลนี้บ้าง?")).toBeTruthy();
  expect(screen.queryByDisplayValue("1234567890")).toBeNull();
  expect(api.publish).toHaveBeenCalledTimes(1);
  ```
- [ ] **2. Run red:** `npm test -- tests/harn-tee/harn-tee-draft-flow.test.tsx tests/harn-tee/link-panel.test.tsx`.
- [ ] **3. Integrate existing handlers without restructuring unrelated screens.** Replace scattered bill/step/QR persistence ownership with the session; keep participant/detail/payment controls. Existing participant-step validation still gates first edit-link creation. Add live totals only to item entry. Show local/server times/status, conflict/retry/load-latest actions and the local-browser privacy notice. Exact ID warning: `เพื่อความเป็นส่วนตัว เลขประชาชน PromptPay จะไม่ถูกบันทึกในดราฟต์ หากปิดหรือรีเฟรชหน้านี้ กรุณากรอกใหม่`. Before new-bill navigation remind users to retain the old edit link; reset only after the relevant confirmation. Starting new from an edit URL must stop the old session, initialize the `new` slot and navigate to `/`, rather than keep an old edit token in the new form. Add a short OCR notice that review not yet imported must be scanned again after leaving; do not persist receipt images. The edit page loads the edit-only draft endpoint, passes `initialSnapshot` to the app/session and distinguishes draft/published snapshots rather than treating every edit token as a published bill.
- [ ] **4. Run green:** the red command plus Task 6–8 tests and existing payment-summary/receipt-scanner tests; expect only explicit confirmation to change a published shared result.
- [ ] **5. Commit:** Task 9 paths only; message `feat: connect recoverable bill creation flow`.

### Task 10: End to End Evidence and Publication

**Files:** Create `docs/superpowers/verification/2026-11-23-draft-recovery-live-totals.md`; fix only task-relevant failures with new regressions in their owning test files.

**Interfaces:** Consumes the completed feature and approved Sites project `appgprj_6aa7c5daa5808191b41542f6424162c5`; produces reproducible evidence and a matching tested GitHub/Sites source commit. Follow the active Sites and verification skills at execution time, not expired credentials from chat history.

- [ ] **1. Run complete gates:** `npm test`, `./node_modules/.bin/tsc --noEmit --incremental false`, and `git diff --check`; expect zero failures and unchanged pre-existing `tsconfig.tsbuildinfo`. Build through the active Sites `scripts/build-site.mjs` helper; expect exit 0. Do not call a conditional-write mock proof that real D1 SQL works.
- [ ] **2. Verify the actual local app/D1/R2 using documented browser automation:** use synthetic data only, two independent browser contexts or verified cleared test storage to represent devices. Exercise native IndexedDB reload/reopen including a real PNG QR; save an incomplete draft, open its edit link elsewhere, verify step/raw/phone/QR, demonstrate a stale save conflicts, and publish from that second context with usable share/edit links. A third share-only view cannot open the unpublished draft, draft API or QR. While editing an already published bill and replacing its QR, verify the share view stays unchanged before confirmation. Inspect test-only request/storage payloads for absence of the synthetic national ID; do not print real identifiers or capabilities in evidence. Confirm a missing/failed precondition really results in no D1 mutation.
- [ ] **3. Verify recovery/reset/layout failures:** simulate offline/failed fetch and quota/open errors using the focused tests; test uncertain success and late callbacks there, with normal-path actual-browser confirmation. At 360×800 and desktop widths verify no horizontal document overflow, no totals/status overlay over entry/navigation, restored QR and exact ID warning, success reload and start-new isolation. Save screenshots of the synthetic flows. Native responsive browser tests do not claim physical-phone keyboard/camera coverage.
- [ ] **4. Review and record:** use the selected execution method's independent review gate; fix actionable issues with red/green evidence, rerun affected/full gates after source changes, and write the verification report with pass counts, actual-browser observations and honest limitations. Confirm every acceptance item in the spec maps to this evidence before claiming completion. Do not deploy while a required gate is failing.
- [ ] **5. Commit and publish:** commit the verification report separately, preserving unrelated user files. The Sites helper stages the whole checkout: before running it, record the existing `tsconfig.tsbuildinfo` hash and temporarily stash only that exact pre-existing file with a task-specific marker; restore that exact stash afterward and verify the hash, even if publication fails. Do not stash unrelated work broadly. Use the active Sites source workflow to push/package the exact tested source and preserve the existing public audience; push the matching commit to `github/main` at `https://github.com/newasia2538/harn-tee.git`. Save/deploy that matching archive, wait for a terminal successful result and report the returned production URL. No production data deletion or unrelated migrations are part of this release.

## Execution Notes and Self Review

- The work is one related slice: recovery, new-bill reset and displayed totals share the same form/raw-input contract. Tasks 1–6 establish that contract; 7/8 can be developed independently after their dependencies, but 9 must integrate their exact interfaces before end-to-end verification.
- Native execution is recommended for these tightly coupled form/server/session interfaces and the user's earlier preference for Native. A single implementer avoids per-task context duplication; retain one independent whole-branch reviewer before shipping. The user still reviews this plan before execution.
- Self-review coverage: partial/raw-input and ID rules → 1/4/6/7; local QR/transaction/schema/context safety → 2/6; server privacy/auth/revision/idempotency → 3/4/5; publication/capabilities/retry/completion → 8/9; totals → 7/9; actual browser, D1/R2 and release evidence → 10. No new runtime storage service, account model or D1 migration is required.
- Reference for the dev-only IndexedDB test adapter: [fake-indexeddb official README](https://github.com/dumbmatter/fakeIndexedDB#readme). It tests IndexedDB code in Node; actual browser persistence remains a separate required gate.
