# Bill History, Retention and Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show this browser's created bills and drafts, display their payment status and remaining lifetime, and permanently remove expired/manually deleted bills and receiving QR files while revoking both links.

**Architecture:** Keep a minimal history ledger beside the existing IndexedDB recovery stores. Make D1 lifecycle columns and conditional writes authoritative; retain only minimal deletion markers and durable QR cleanup metadata after revocation. Coalesce on-entry/foreground synchronization and opportunistic cleanup; countdown ticks stay local. Complete the independent compact-total plan first; tasks below form one integrated backend/history slice and are not separate production releases.

**Tech Stack:** Existing Vinext/React/TypeScript, Drizzle with Cloudflare D1, R2, IndexedDB, Zod, Vitest, Testing Library and Wrangler; no new runtime dependency, login, cron or paid service.

**Spec:** `docs/superpowers/specs/2026-11-24-bill-history-retention-design.md`, approved in full on 2026-11-24.

## Global Constraints

- Normal lifetime: `30 × 24 × 60 × 60 × 1000` ms after the latest meaningful committed update. Full payment: `7 × 24 × 60 × 60 × 1000` ms after everyone with a positive amount due becomes paid.
- Reverting full payment starts a fresh 30 days. Becoming complete again starts a new 7 days. A change that leaves the bill complete preserves its original completion/deadline.
- Visits, refreshes, copying, step changes, identical saves/status actions, share issuance and retries do not extend retention. A new confirmation ID with unchanged normalized published business content preserves paid flags and deadline; real edits retain the existing payment-reset behavior.
- Status copy: `ดราฟต์`, `รอชำระ`, `ชำระบางส่วน`, `ชำระครบแล้ว`; payment progress and expiry urgency are separate. Zero-positive-payer bills are never complete.
- At least 24 hours: `เหลือ X วัน`, ceiling of days. Below 24 hours: `หมดอายุใน HH:mm:ss` with `ใกล้หมดอายุ`. Never decrement an API-backed timer every second.
- Same-browser history only; share-link visits never enroll a bill. Unrelated edit-link visits do not silently enroll a bill. A retained edit link still works on another device while active.
- No duplicate item/payment/QR contents in history. Typed PromptPay national IDs never enter draft/history persistence. Existing safe draft phone/account/QR recovery remains supported.
- Delete the server bill and QR; invalidate all ordinary share/edit/payment/QR operations. Retain only non-reversible token digests and minimal deletion/cleanup metadata. Distinguish 404 unknown from 410 `bill-deleted` / `bill-deleting` without returning bill contents.
- Deleted page: `การ์ดอธิบายชัดเจน`, sad receipt mascot 150px responsively, heading `บิลนี้ได้ถูกลบออกจากระบบแล้ว`, description `ขออภัย ท่านไม่สามารถดูรายละเอียดหรือแก้ไขบิลนี้ได้อีก`, supporting line `ข้อมูลบิลและ QR Code สำหรับรับชำระเงินถูกลบออกจากระบบแล้ว`, bottom action `กลับสู่หน้าแรก` to `/`.
- Pending deletion must not claim that QR cleanup finished. Expired access is denied even if physical cleanup is awaiting another app request.
- Existing server bills receive a one-time 30-/7-day grace at migration rollout time; old local-only drafts receive one-time 30-day grace on IndexedDB upgrade. Never regrant on visits.
- Preserve the approved compact-total plan, money formulas, masking/copy permissions, published-edit isolation, confirmation/QR idempotency and conditional acknowledgements.
- Native execution in the existing checkout on `codex/bill-history-retention-design`; no new worktree or method question. Preserve unrelated `tsconfig.tsbuildinfo`. No production migration, deletion, push or deployment occurs merely from writing/reviewing this plan.

## Review Focus

- A legacy bill with null lifecycle columns, including an already-paid bill, must receive its one-time grace without exposing data through an unchecked legacy route — Tasks 2, 3 and 5.
- A tab holding IndexedDB v1 open during upgrade, or browser storage refusing writes, must not erase existing recovery data or prevent safe edit-link use — Tasks 6 and 8.
- An R2 put that finishes after revocation, or has an uncertain outcome after a worker restart, must remain tracked and must not cause premature “deleted” success — Tasks 4 and 9.
- Out-of-order sync responses, duplicate capabilities and a concurrent new edit must not remove a newer history record or silently extend/overwrite a server deadline — Tasks 3, 6, 7 and 9.
- An old client missing `If-Match` on DELETE, a stale share proof, or a malformed/oversized history batch must fail safely without deleting an active peer revision or revealing another bill — Tasks 5, 7 and 9.

---

## File Structure

| Files | Responsibility |
| --- | --- |
| New `lib/harn-tee/bill-lifecycle.ts` | Pure status, meaningful-change, deadline and summary rules |
| New `lib/harn-tee/retention-clock.ts` | Monotonic server-time bridge and remaining-time formatting |
| Modify `db/schema.ts`, new `drizzle/0001_bill_retention.sql`, generated `drizzle/meta/*` | Additive lifecycle, deletion and QR-journal storage |
| New `db/bill-retention-store.ts` | Stored-row/binding types, legacy initialization and revision-aware SQL snapshots |
| New `db/bill-access.ts` | One token/lifecycle access decision and typed unavailable error |
| New `db/bill-deletion.ts`, `db/bill-qr-assets.ts`, `db/bill-maintenance.ts` | Atomic revocation, durable asset work and bounded maintenance |
| Modify `db/repository.ts`, `db/draft-document.ts` | Use the lifecycle protocol on every existing repository operation |
| Modify existing bill API routes, `lib/harn-tee/draft-http.ts`, new `lib/harn-tee/history-http.ts` | Consistent 410/409/428 handling, bounded safe DTOs |
| New `app/api/bills/history/route.ts`, `app/api/bills/maintenance/route.ts` | Capability-bounded synchronization and server-selected expired cleanup |
| New `lib/harn-tee/history-state.ts`, `history-store.ts`, `browser-db.ts`; modify `draft-store.ts`, `draft-state.ts` | Shared IndexedDB v2 connection/transactions, minimal ledger and atomic record cleanup |
| New `lib/harn-tee/history-api.ts`, `history-sync.ts`, `use-bill-history.ts`; modify draft API/session/publication integration | Coalesced refresh, receipt adoption, deletion intent and invalidation |
| New `components/harn-tee/bill-history-provider.tsx`, `bill-history-list.tsx`, `bill-expiry.tsx`, `delete-bill-dialog.tsx`, `deleted-bill-state.tsx`, `sad-receipt.tsx` | App maintenance context, history UI and approved unavailable state |
| New `app/history/page.tsx`, `app/history/drafts/[localId]/page.tsx`; modify `app/layout.tsx`, `app/harn-tee-client.tsx`, `app/summary-client.tsx`, `app/edit/[token]/page.tsx`, `components/harn-tee/link-panel.tsx`, `app/globals.css` | Routes, navigation and safe cache/view invalidation |
| New/modified focused tests listed in each task; new `tests/integration/*`, `scripts/verify-bill-retention.mjs` | Domain, browser storage, API and real D1/R2 proof |
| New `docs/superpowers/verification/2026-11-24-bill-history-retention.md` | Test evidence, rollout/rollback instructions and remaining limits |

### Shared contracts

Define these in Task 1 and use them consistently; do not embed personal payment data in lifecycle/history DTOs.

```ts
type BillPaymentStatus = "draft" | "unpaid" | "partial" | "paid";
type BillLifecycle = {
  lastActivityAt: number; allPaidAt: number | null; expiresAt: number;
};
type LifecycleSnapshot = BillLifecycle & {
  paymentStatus: BillPaymentStatus; paidCount: number; payerCount: number;
};
type BillSummary = {
  id: string; title: string; totalSatang: number;
  lifecycle: LifecycleSnapshot; revision: string;
};
type DeleteResult = {
  state: "deleting" | "deleted"; serverNow: number;
};
```

`totalSatang` means receipt total, not the rounded collection total. Add required `lifecycle: LifecycleSnapshot` and `serverNow: number` to new-server `DraftAck`; add these fields to normal authorized GET/create/share-issuance/status acknowledgements as appropriate. Old stored `RemoteIdentity`/completion checkpoints may omit lifecycle until synchronized. Never invent server deadlines from a client's latest save time.

### Task 1: Pin the lifecycle and clock rules

**Files:** New lifecycle/clock modules; `tests/harn-tee/bill-lifecycle.test.ts`, `tests/harn-tee/retention-clock.test.ts`; existing calculator fixtures.

**Interfaces:**
- `paymentProgress(document: BillDocument): Pick<LifecycleSnapshot, "paymentStatus" | "paidCount" | "payerCount">`.
- `advanceLifecycle(previous: BillLifecycle | null, before: BillDocument | null, after: BillDocument, now: number, meaningful: boolean): BillLifecycle`.
- `samePublishedContent(current: BillDocument, candidate: BillDocument): boolean` ignores timestamps/payment flags/transport markers, preserves normalized business and server-owned QR differences.
- `sameDraftActivity(before: SafeDraftForm, after: SafeDraftForm): boolean` ignores step only; compares safe raw input/business values, not just normalized zeroes.
- `summarizeBill(document: BillDocument, id: string, revision: string, lifecycle: BillLifecycle): BillSummary`.
- `createRetentionClock(monotonicNow: () => number): {sync(serverNow: number): void; now(): number | null}`; `remainingBillTime(expiresAt: number, now: number)` returns `{kind:"days";days:number}`, `{kind:"countdown";text:string}` or `{kind:"expired"}`.

- [x] **Step 1: Write failing tests** named `normal_thirty_day_boundary`, `completion_reversion_and_recompletion`, `no_op_never_renews`, `zero_due_does_not_block_or_complete`, `draft_raw_edit_counts_but_step_does_not`, `clock_uses_elapsed_time_after_sleep` and `countdown_boundary_is_exact`. Pin:

```ts
expect(first.expiresAt).toBe(now + 2_592_000_000);
expect(complete.expiresAt).toBe(completedAt + 604_800_000);
expect(reverted.expiresAt).toBe(revertedAt + 2_592_000_000);
expect(repeated).toEqual(complete);
expect(remainingBillTime(86_400_000, 0)).toEqual({kind:"days",days:1});
expect(remainingBillTime(86_399_999, 0)).toEqual({kind:"countdown",text:"23:59:59"});
expect(remainingBillTime(1, 1)).toEqual({kind:"expired"});
```

Use `buildBillDocument(draftFixture().draft, now, "published")` and set paid flags in fixtures explicitly. Include drafts, partially paid bills, zero-price participants, title/payment-only edits that leave a complete bill complete, both fee formulas and split rounding. `lastActivityAt` changes for meaningful work even if the completed deadline remains unchanged. Clock `now()` is null before a server-time sync; do not trust a wall-clock jump as a remote extension. Test that an older/out-of-order server-time response never moves an already anchored clock backwards.
- [x] **Step 2: Run red.** `npm test -- tests/harn-tee/bill-lifecycle.test.ts tests/harn-tee/retention-clock.test.ts`.
- [x] **Step 3: Implement the pure contracts** with the existing calculator and explicit `now`; exclude live national-ID values from any persisted comparison/fingerprint. No timer or network side effects in these modules.
- [x] **Step 4: Run the focused tests green.** Include a simulated suspended tab advancing monotonic time by several hours and exactly-zero remaining time.
- [x] **Step 5: Commit.** `feat: define bill lifecycle rules`.

### Task 2: Add schema, one-time grace and concurrency metadata

**Files:** Schema/migration/retention-store; `db/draft-document.ts`; new `tests/db/retention-schema.test.ts`; update `tests/helpers/conditional-bill-db.ts`.

**Interfaces:**
- Export `StoredBillRow` from `db/bill-retention-store.ts`, including existing columns plus nullable `last_activity_at`, `all_paid_at`, `expires_at`, and non-null integer `retention_version` (default 0).
- Export `RetentionBindings = {DB: D1Database; BUCKET?: R2Bucket}` and `initializeLegacyRow(bindings: RetentionBindings, row: StoredBillRow, rolloutAt: number): Promise<StoredBillRow | null>`. Null means the snapshot lost a race and must be re-read, never overwritten.
- Change `revisionOf(payload: string, shareDigest: string, retentionVersion: number): Promise<string>`; include the version in its digest. Update all callers and mock fixtures, not only the editor route.
- `backfillLegacyBatch(bindings: RetentionBindings, limit: number): Promise<number>` initializes at most `limit` null-deadline rows against the persisted rollout timestamp.

- [x] **Step 1: Write failing schema/adapter tests.** `legacy_grace_is_once_for_paid_and_unpaid`, `migration_preserves_payload_and_tokens`, `changed_snapshot_skips_backfill`, `revision_includes_retention_version`. Assert old unpaid/partial/draft deadlines equal rollout + 2_592_000_000; fully paid equals rollout + 604_800_000; second initialization leaves the same values. Preserve old `updated_at` for historical display; initialize `last_activity_at` from it, and old complete `all_paid_at` from rollout time.
- [x] **Step 2: Run red.** `npm test -- tests/db/retention-schema.test.ts tests/db/draft-checkpoints.test.ts`.
- [x] **Step 3: Add the additive migration and storage helpers.** Generate with `npm run db:generate -- --name bill_retention`, yielding `0001_bill_retention.sql` and metadata. Add:
  - lifecycle columns and `bills_expires_at_idx`;
  - `bill_deletions`: internal bill ID, unique share/edit digests, deleted timestamp/reason, `deleting|deleted` state, bounded-prefix-scan cursor/completion metadata while needed; no payload;
  - `bill_qr_assets`: server-owned object key, bill ID, selection ID when needed, upload-settlement/attachment/cleanup state, retry timestamp/attempts; no QR bytes or user values;
  - `bill_retention_policy`: singleton `lifecycle-v1`, one rollout timestamp inserted by the migration using SQLite UTC epoch milliseconds, plus a maintenance-next-run timestamp.

  Legacy rows stay nullable until initialized using Task 1's actual calculator, not SQL guesses about paid flags. Guard initialization by ID, payload, share digest, null deadline and version; increment the version once. Extend the test adapter to reject unknown SQL and model affected-row counts; do not make every write pass. Native migration/transaction proof is Task 9.
- [x] **Step 4: Run the focused tests green.** Ensure creation and draft checkpoint suites still pass with lifecycle-aware rows/revisions. Newly created records initialize their own deadlines immediately, independent of legacy backfill.
- [x] **Step 5: Commit migration, schema and adapter changes.** `feat: add retention storage and rollout grace`.

### Task 3: Enforce lifecycle on repository reads and writes

**Files:** `db/bill-access.ts`, repository/document modules, `lib/harn-tee/draft-state.ts`; new `tests/db/bill-lifecycle-writes.test.ts`; update checkpoint/publication/status tests and fixtures.

**Interfaces:**
- `lookupBillAccess(bindings: RetentionBindings, kind: "share" | "edit", rawToken: string, now: number): Promise<{kind:"active";row:StoredBillRow}|{kind:"missing"}|{kind:"gone";state:"deleting"|"deleted"}>`.
- `BillUnavailableError` carries only `code: "bill-deleted" | "bill-deleting"`; no document/tokens.
- Existing repository entry points keep their names. Their active acknowledgements adopt Shared contracts; `conditionalWrite` must guard the row's payload, share digest, retention version and `expires_at > writeNow` and commit lifecycle/version together.
- Task 4 supplies expiry revocation. Until connected, expired rows return `gone/deleting` without serving their payload; do not ship this intermediate task alone.

- [x] **Step 1: Write failing tests** for no-op draft/raw/step saves, identical publication with a different confirmation ID, real financial edit payment reset, repeated payment flags, last positive payer/reversion, legacy reads and an expiry boundary during a write. Assert identical publication retains paid flags and original 7-day deadline; `7.` → `7.0` counts as raw draft work; step 0 → 1 alone does not. Reject unknown participant IDs without changing activity. Pin the acknowledgement's revision/deadline to the actual committed snapshot even if a peer writes immediately afterward.
- [x] **Step 2: Run red.** `npm test -- tests/db/bill-lifecycle-writes.test.ts tests/db/draft-checkpoints.test.ts tests/api/draft-publication.test.ts`.
- [x] **Step 3: Connect every repository operation to access/lifecycle helpers.** Cover create, read, draft save/load, share issuance, publication, legacy PATCH, both payment-status overloads, QR read/write and DELETE delegation. A same-content draft save may retain step/recovery metadata and change transport revision without renewing TTL. Validate an unchanged explicit publication normally before preserving flags; a matching previously applied confirmation retains its existing response-loss exception. Ignore bookkeeping timestamps in comparisons. Change status only from a validated persisted document, never client-supplied lifecycle fields.

  For `createDraftOnce`, use one conditional INSERT excluding a matching edit-digest deletion marker; a preflight lookup alone is insufficient. A deleted creation-key retry returns gone and cannot insert another active row. In-flight writes with a now-expired or revoked snapshot lose their CAS. Required new acknowledgement metadata must come from the committed snapshot, not a later unguarded read. A stale open client's old revision conflicts and asks for reload.
- [x] **Step 4: Run the focused suites green**, then `npm test -- tests/db tests/api`. No existing share/draft privacy fixture may start exposing private draft metadata or unmasked values.
- [x] **Step 5: Commit.** `feat: enforce lifecycle on bill mutations`.

### Task 4: Revoke bills atomically and finish QR cleanup honestly

**Files:** New deletion/asset/maintenance modules; repository QR/deletion paths; `tests/db/bill-deletion.test.ts`, `tests/db/bill-qr-assets.test.ts`, existing QR security tests.

**Interfaces:**
- `revokeBillSnapshot(bindings: RetentionBindings, row: StoredBillRow, reason: "manual" | "expired", now: number): Promise<"revoked" | "conflict">`.
- `deleteBillByEditToken(rawToken: string, revision: string): Promise<DeleteResult | null>` replaces the old boolean delete; known markers return their current state idempotently.
- `drainBillQrCleanup(bindings: RetentionBindings, billId: string, now: number, maxObjects: number): Promise<"deleting" | "deleted">`.
- Asset helpers: `registerQrAsset(bindings, row, objectKey, selectionId: string | undefined, now): Promise<boolean>`, `settleQrAsset(bindings, objectKey: string, outcome: "stored" | "uncertain", now): Promise<void>`, `queueQrCleanup(bindings, objectKey: string, now): Promise<void>`. Here `bindings: RetentionBindings`, `row: StoredBillRow`, `objectKey: string`, `now: number`; attachment journal updates are committed in the same D1 batch as the bill's guarded QR association.
- `runBillMaintenance(bindings: RetentionBindings, now: number): Promise<void>`: at most 20 backfills, 20 expired bills and 20 object operations; globally claim at most once per 60 seconds. Direct known-expired access is always checked regardless of this batch gate.

- [x] **Step 1: Write failing deletion/asset tests.** `revocation_erases_payload_before_r2_work`, `expiry_snapshot_cannot_delete_extended_bill`, `manual_delete_rejects_stale_revision`, `put_finishes_after_revocation`, `uncertain_put_survives_restart`, `r2_delete_failure_is_pending`, `same_creation_key_cannot_resurrect`, `legacy_replaced_object_is_swept`. Pin:

```ts
expect(activeRowAfterRevocation).toBeNull();
expect(marker.state).toBe("deleting");
expect(JSON.stringify(marker)).not.toContain("1234567890123");
expect(result.state).toBe("deleting"); // failed/uncertain/in-flight R2 work
expect(afterSuccessfulDrain.state).toBe("deleted");
expect(extendedBillStillExists).toBe(true);
```

Use a deferred fake R2 `put` to resume after the deletion transaction. Inject a process-restart boundary by constructing a new cleanup runner over the same persisted rows, not an in-memory job queue. An unconfirmed put may not be marked settled merely because time passed.
- [x] **Step 2: Run red.** `npm test -- tests/db/bill-deletion.test.ts tests/db/bill-qr-assets.test.ts tests/api/qr-security.test.ts`.
- [x] **Step 3: Implement atomic revocation and the durable journal.** One D1 batch conditionally records digests/reason/state, captures current QR cleanup intent and removes the active row. Guard the current expiry for automatic deletion and the expected revision for manual deletion. Tie all statements to the same qualifying snapshot; affected-row counts decide success. Do not leave a content-bearing “deleted” bill row.

  Register every new immutable QR key in D1 **before** starting R2 put, only if the bill is still active/unexpired at the expected version. After put, preserve any concurrent cleanup request; never turn a revoked asset back into an attached one. CAS-loss or QR replacement queues cleanup durably. Track uncertain puts across restart. A revoked bill cannot register new uploads; an already registered put keeps deletion pending until its outcome is settled and cleanup acknowledged. If no settlement proof exists, keep a durable pending state and retry deletion; never clear that barrier solely on a timeout or claim completed cleanup.

  Drain only server-owned `bills/{internalId}/` keys. Include the current legacy key and bounded R2 prefix-list pages (100 keys/page, persisted cursor) to find old replaced/orphaned keys. Queue keys not processed within the object budget. Finish the marker only after the prefix sweep and all tracked uploads/cleanup are settled; retain no object keys after complete cleanup. Back off failed work using retry timestamps (first retry 30 seconds, doubling to at most one hour). No unbounded bucket/database scan.
- [x] **Step 4: Run the suites green**, including repeated/lost-response deletion, absent R2 binding with a real QR, concurrent registration/revocation, maintenance throttling and no-QR deletion. Real D1/R2 evidence remains required in Task 9.
- [x] **Step 5: Commit.** `feat: revoke bills with durable qr cleanup`.

### Task 5: Expose bounded history sync and consistent unavailable responses

**Files:** All existing routes under `app/api/bills`; new history/maintenance routes and `history-http.ts`; draft HTTP helper; `tests/api/bill-retention.test.ts`, `tests/api/bill-history.test.ts`, existing mutation/payment/QR tests.

**Interfaces:** Define in `lib/harn-tee/history-state.ts`:

```ts
type HistorySyncProof = {localId: string; editToken: string; shareToken?: string};
type HistorySyncItem =
  | {localId:string;kind:"active";summary:BillSummary;shareUsable:boolean}
  | {localId:string;kind:"gone";state:"deleting"|"deleted"}
  | {localId:string;kind:"missing"};
type HistorySyncResponse = {serverNow:number;items:HistorySyncItem[]};
```

- `POST /api/bills/history`: `{entries: HistorySyncProof[]}`, at most 20 entries and 65,536 JSON bytes. Each proof authorizes its own lookup; no global list/search and no returned capabilities/payment/item data.
- `POST /api/bills/maintenance`: strict empty JSON object, at most 1,024 bytes, returns `{serverNow}` only after bounded maintenance. No client-specified IDs/deadlines or cleanup counts revealing records.
- `DELETE /api/bills/[token]`: requires valid `If-Match`; returns `DeleteResult` with 200 when deleted, 202 when pending, 409 when stale, 428 when absent. An authorized already-deleted edit token may return its idempotent result. Share-only delete never succeeds.

- [x] **Step 1: Write failing API tests.** Parameterize GET/PATCH/DELETE, draft read/save, publish, share issuance, status, payment-details and QR GET/POST for expired/deleting/deleted state. All deny without personal payload, QR body or resurrection. Test unknown tokens separately as 404. Test 21 entries, oversized streamed bodies, duplicate edit proofs, mismatched share proofs, malicious paths/control characters and forbidden lifecycle fields. Duplicate proofs produce one storage lookup but safe per-local-ID results; never cross-wire summaries between inputs.
- [x] **Step 2: Run red.** `npm test -- tests/api/bill-retention.test.ts tests/api/bill-history.test.ts`.
- [x] **Step 3: Implement consistent mapping and bounded DTOs.** Route all entry points, including legacy GET/status/QR/PATCH, through the shared access decision before serving or mutating data. Map unavailable errors to safe 410 codes, retain 404 for unknowns and `Cache-Control: no-store`. Keep masked share responses and existing edit/unmask permissions. Add safe bill ID/lifecycle/server time to authorized summary responses and lifecycle metadata to status/share/draft acknowledgements; expose no raw capabilities. Require DELETE preconditions even for an old client; keep legacy share-status compatibility with internal snapshot CAS. Validate missing/stale share proof into `shareUsable:false`, not token recovery/rotation. Never log proof bodies or caught financial payloads.
- [x] **Step 4: Run `npm test -- tests/api tests/db` green.** Check missing preconditions do not execute revocation SQL. Maintenance may affect only server-selected expired records; it returns no bill directory.
- [x] **Step 5: Commit.** `feat: add private history sync and gone responses`.

### Task 6: Upgrade IndexedDB and preserve a minimal history ledger

**Files:** Browser DB/history-state/history-store modules; draft store/state; `tests/harn-tee/history-store.test.ts`, existing draft-store/state tests.

**Interfaces:**
- `HistoryEntry = ActiveHistoryEntry | PendingHistoryEntry` in `history-state.ts`. Active entries have `kind:"bill"`, `schemaVersion:1`, stable `localId`, `recordIds:string[]`, optional `billId`/known edit/share tokens/revision, title, receipt `totalSatang`, `LifecycleSnapshot`, `deadlineSource:"local"|"server"`, `localVersion:number`, `syncState:"synced"|"pending"|"offline"|"conflict"`, optional `{revision:string;requestedAt:number}` pending-delete intent and `shareUsable:boolean`. They have no item/recipient/QR value fields.
- Pending entries have `kind:"deleting"` and only `schemaVersion:1`, `localId`, `billId`, known edit token, confirmation revision, `localVersion`, `requestedAt` and `syncState` as above. They contain no title, total, participant counts, share token or payload. They replace active entries only after server revocation is confirmed; an offline intent stays attached to a blocked active entry until reconciled, preserving work on a 409.
- `HistoryStore`: `list(): Promise<HistoryEntry[]>`, `upsert(entry: ActiveHistoryEntry, expectedVersion: number | null): Promise<ActiveHistoryEntry>`, `purge(localId: string, expectedVersion: number): Promise<void>`, `markPendingDelete(localId: string, expectedVersion: number, revision: string): Promise<ActiveHistoryEntry>`, `confirmRevocation(localId: string, expectedVersion: number, result: DeleteResult): Promise<PendingHistoryEntry | null>`.
- `DraftStore` adds `history: HistoryStore`; `DraftContext` adds `{kind:"local";localId:string}`. Shared `browser-db.ts` opens `harn-tee-drafts` version 2 and owns the transaction helpers used by both stores.
- Checkpoints keep `schemaVersion:1`, with additive optional provenance/lifecycle metadata accepted by their strict schemas. New created-here records have `provenance:"created-here"`; unrelated edit contexts have `"edit-only"`.

- [x] **Step 1: Write failing migration/store tests.** Seed a real fake-indexeddb v1 database with records, aliases, a QR Blob, completion links and an unrelated edit working record. After v2 upgrade, assert preserved recovery/QR, one history entry per bill, one-time local grace and no import of edit-only/shared bills. Raw record inspection must exclude synthetic national ID `1234567890123` and account/phone/QR data from the ledger. Test blocked upgrade, denied/quota storage, concurrent versions, fee-only raw input `7.`, QR-only selection, step-only/no-op saves, and purging one bill while preserving a different draft/QR.
- [x] **Step 2: Run red.** `npm test -- tests/harn-tee/history-store.test.ts tests/harn-tee/draft-store.test.ts tests/harn-tee/draft-state.test.ts`.
- [x] **Step 3: Implement the additive upgrade and transactional ledger.** Preserve `records`, `aliases`, `qrAssets`; add `history` with a unique optional bill-ID index and last-activity index. Keep a local alias for retained created-here records so a historical local-only draft remains a valid checkpoint owner after the `new` pointer changes. Use existing completion receipts, local-only drafts and creation-key provenance to enroll discoverable old work; never guess unknown links/ownership. Give old local-only meaningful drafts one upgrade-time grace; remote lifecycle remains pending until authoritative sync.

  Move only connection/transaction code needed for shared atomic operations; do not refactor unrelated recovery behavior. Starting fresh archives meaningful previous records/history instead of deleting their assets; omit empty baseline forms from history. Publication upserts the same bill entry and links all owned working/completion record IDs. Purge in one transaction removes that bill's history, records, aliases and owned QR blobs, guarded by local version; no `clear()` over shared stores. `confirmRevocation` clears the same owned data but retains only a minimal pending entry for a `deleting` result, or removes the entry for `deleted`. An offline intent preserves work until confirmed revocation and blocks further edits/publication. A version conflict preserves data. Corrupt/blocked storage is an honest unavailable state, never a reason to wipe the database.

  Derive local history activity from the prior/current safe form and QR selection, not `savedAt` or every persistence call. Extend `hasMeaningfulDraft` and enrollment checks to include raw bill/item fee strings, user-added structure and a local QR selection, while leaving a generated blank form unenrolled. Acknowledgement/step/alias-only writes do not renew local life; a remote entry adopts only its committed server lifecycle. Extend DI store/session fixtures for the new methods and metadata without weakening privacy assertions.
- [x] **Step 4: Run the focused tests green.** Assert a stale autosave cannot recreate a purged record: existing-version writes fail after aliases/record removal, and completion retries cannot repopulate it.
- [x] **Step 5: Commit.** `feat: retain browser bill history safely`.

### Task 7: Synchronize history, recovery and deletion across tabs

**Files:** History API/sync/hook/provider; draft API/session/state/publication integration; `tests/harn-tee/history-api.test.ts`, `history-sync.test.ts`, existing session/publication tests.

**Interfaces:**
- `createHistoryApi(fetcher: typeof fetch = globalThis.fetch): HistoryApi`, with `sync(entries: HistorySyncProof[], signal?: AbortSignal): Promise<HistorySyncResponse>`, `remove(editToken: string, revision: string, signal?: AbortSignal): Promise<DeleteResult>` and `maintain(signal?: AbortSignal): Promise<{serverNow:number}>`.
- `createHistorySync({store, api, clock}: {store: HistoryStore; api: HistoryApi; clock: ReturnType<typeof createRetentionClock>})` returns `{refresh(reason:"entry"|"foreground"|"online"|"manual"):Promise<void>; subscribe(listener:()=>void):()=>void; dispose():void}`.
- `useBillHistory()` exposes entries/loading/error and explicit refresh/delete actions through `BillHistoryProvider`. `useDraftSession` options add `localId?:string`; its view adds `availability:"active"|"deleting"|"deleted"`.

- [x] **Step 1: Write failing sync/session tests.** `coalesces_foreground_and_never_polls_per_tick`, `server_deadline_wins_over_local_clock`, `older_sync_cannot_overwrite_newer_local_edit`, `offline_delete_keeps_bound_revision`, `gone_stops_pending_autosave_and_clears_view`, `unrelated_edit_and_share_never_enroll`, `stale_share_preserves_owner_preview`, `history_draft_does_not_replace_home_draft`. Advance fake timers 86,400 seconds and assert no per-second network calls; use deferred responses and local-version checks to prove ordering.
- [x] **Step 2: Run red.** `npm test -- tests/harn-tee/history-api.test.ts tests/harn-tee/history-sync.test.ts tests/harn-tee/draft-session.test.tsx tests/harn-tee/draft-publication.test.ts`.
- [x] **Step 3: Wire acknowledgements and coalesced refresh.** Preserve lifecycle/serverNow from each committed mutation. Atomically update the matching created-here history summary without promoting edit-only records. Refresh on app entry, route entry, visible-tab return and online; share one in-flight refresh and throttle automatic repeats for 15 seconds. Process known proofs in batches of 20; apply only to the local versions sent. A page counter uses the clock, never API polling. A server conflict/changed peer revision marks unsaved work for explicit reload and never merges it into the form.

  Recognize 410 codes in `DraftApiError` rather than collapsing them to server-error. On confirmed revocation, stop queues and invalidate session generation before clearing sensitive state/QR object URLs and attempting local purge. Complete deletion removes owned entries; pending deletion removes sensitive working data while retaining minimal pending intent, known capability and confirmation revision needed to finish. Offline intent remains blocked from editing/publication and retries with the original revision, never a newly fetched revision that silently expands permission. A 409 requires explicit review/reconfirmation. An unverified 404 or network error alone does not masquerade as successful deletion.

  Broadcast only `{billId, kind:"updated"|"deleting"|"deleted"}` on a same-origin `harn-tee-bills` channel; no capabilities/personal payload. Receivers reconcile and clear revoked views; provide foreground reconciliation when BroadcastChannel is unavailable. Mount maintenance/provider without blocking first paint or breaking the creator flow when storage fails. Close owned connections/subscriptions cleanly.
- [x] **Step 4: Run focused tests green**, including national-ID exclusion, idempotent lost publication, local/remote conflicts, stale status acknowledgements and published-edit isolation.
- [x] **Step 5: Commit.** `feat: synchronize history and bill revocation`.

### Task 8: Build history, expiry and approved deleted-link UI

**Files:** New history/draft routes and UI components; `app/layout.tsx`, `app/harn-tee-client.tsx`, `app/summary-client.tsx`, `app/edit/[token]/page.tsx`, `components/harn-tee/link-panel.tsx`, `app/globals.css`; `tests/harn-tee/bill-history.test.tsx`, `bill-expiry.test.tsx`, `deleted-bill-state.test.tsx`, existing flow/payment tests.

**Interfaces:**
- `BillHistoryList({entries, onDelete, onRefresh}: {entries: HistoryEntry[]; onDelete:(entry:HistoryEntry)=>void; onRefresh:()=>void})`.
- `BillExpiry({expiresAt, serverClock, syncState, deadlineSource}: {expiresAt:number; serverClock:ReturnType<typeof createRetentionClock>; syncState:HistoryEntry["syncState"]; deadlineSource:"local"|"server"})`; local-only deadlines use the explicitly local browser clock. Pending entries render processing state instead of `BillExpiry`. Countdowns have no every-second live announcement.
- `DeletedBillState({state}: {state:"deleting"|"deleted"})`; `SadReceipt({size = 150}: {size?:number})` adapts the approved CSS receipt illustration into an accessible component.
- `HarnTeeApp` adds optional `localId:string` and passes it to the draft session; the dedicated history-draft route uses local context rather than overwriting the home alias.

- [x] **Step 1: Write failing UI tests.** Assert all four exact Thai statuses, positive-payer progress, sorted last activity, two-decimal receipt totals, title fallback `บิลที่ยังไม่ตั้งชื่อ`, empty/offline/storage-unavailable states and view/edit/copy/delete actions. Pin days/23:59:59/zero boundaries and no screen-reader announcement every second. Pin deleted copy exactly, the bottom home href `/`, and omission of old title/account/QR. Pending state must omit the completed-QR-removal claim.
- [x] **Step 2: Run red.** `npm test -- tests/harn-tee/bill-history.test.tsx tests/harn-tee/bill-expiry.test.tsx tests/harn-tee/deleted-bill-state.test.tsx`.
- [x] **Step 3: Implement navigation and cards.** Add `บิลของฉัน` links on home and successful-share screens. Draft action opens `/history/drafts/{localId}`; published edit/view/copy use only their matching capabilities. Disable public-view/copy with `ลิงก์แชร์ในเครื่องนี้ไม่พร้อมใช้งาน` when proof is missing/stale, retaining owner edit/preview. Do not reveal raw edit tokens in history text. The delete dialog names the bill, says links/QR stop working and the operation cannot be undone, and binds confirmation to the displayed revision.

  Use grey/blue/orange/green soft status fills with readable text; show payment and expiry separately. At zero, show `กำลังตรวจสอบวันหมดอายุ`; offline uses `รอตรวจสอบเมื่อเชื่อมต่อ`. A pending remote delete keeps a minimal processing entry; a deleted entry is purged. Local-only drafts can be removed offline.

  Use the approved explanatory card, sad receipt and exact copy for both share/edit gone states. Put the home action at the page bottom with a full-height normal-flow layout and safe-area spacing, not overlapping fixed content. Focus its heading on navigation. Update summary/edit refresh and payment/unmask/QR failures to clear old bill state and unmount sensitive children on 410; a temporary connectivity error does not assert permanent deletion. Foreground refresh recognizes remote deletion without overwriting an unsaved editor.
- [x] **Step 4: Run UI tests green** and the complete draft/payment/flow regressions. Confirm history links do not discard the current root draft or manufacture cross-device history.
- [x] **Step 5: Commit.** `feat: add bill history and deleted bill screens`.

### Task 9: Prove native D1/R2 behavior and migration compatibility

**Files:** New `tests/integration/bill-retention-worker.ts`, `tests/integration/wrangler.retention.jsonc`, `scripts/verify-bill-retention.mjs`; verification document.

**Interfaces:** The test-only worker imports the real access/deletion/asset/store modules with disposable D1/R2 bindings. Its loopback-only fixture operations seed/read SQL, hold/resume R2 puts through a controlled wrapper, and exercise saved expiry snapshots. It is not imported by the app or packaged as a production API. The verifier accepts `--base-url` and `--persist-to`, rejecting public hosts/non-disposable paths; it owns starting/stopping the fixture worker and applying journaled local migrations. A separate `--app-base-url`/`--app-persist-to` mode probes an already running built application and its matching disposable bindings.

- [x] **Step 1: Implement the local native verifier.** Run migrations 0000/0001 against a disposable database with the real D1 batch implementation, not just `conditionalBillDb`. Seed unpaid, paid, draft, zero-due and null-lifecycle legacy rows plus PNG/R2 objects; report only assertion names/counts. The verifier must be deterministic and clean up only its synthetic storage.
- [x] **Step 2: Run the verifier against disposable fixtures.** Create a directory with `retention_qa_dir=$(mktemp -d /tmp/harn-tee-retention-qa.XXXXXX)`, then run `node scripts/verify-bill-retention.mjs --base-url http://127.0.0.1:8790 --persist-to "$retention_qa_dir"`. Prove: one-time 30-/7-day backfill; exact expiry boundary; rollback of a failing D1 batch; peer extension after an expiry snapshot; stale manual revision; repeated/deferred delete; deleted creation-key replay; R2 put completing after revocation; R2 failure/restart with durable intent; old untracked prefix keys; marker/row/blob inspection after successful cleanup. Compare actual SQL state and R2 key presence. An unresolved put remains `deleting`, never a false green completion assertion. HTTP access-path proof belongs to Step 3.
- [x] **Step 3: Exercise the built application HTTP routes.** Run `npm run build`, create a second disposable directory with the same safe prefix, and start the resulting worker using `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to <app-disposable-dir> --ip 127.0.0.1 --port 8788 --inspector-port 0`. Run the verifier's application mode with `--app-base-url http://127.0.0.1:8788 --app-persist-to <app-disposable-dir>`; it applies the same migrations locally using `dist/server/wrangler.json` before seeding/probes. Verify the real routes from Task 5, private/no-store responses, body limits and QR access before/after deletion. Keep capabilities out of logs/reports. Worker-fixture tests alone do not prove route wiring.
- [x] **Step 4: Record rollout and rollback ordering.** Apply additive migration before the new worker; use the migration's persisted rollout time for all legacy initialization. Run the migration runner twice against its migration journal (do not rerun raw ALTER statements); the second run applies nothing and does not reset rollout time. Raw payloads stay intact before expiry/deletion. All new/legacy paths in the deployed artifact must enforce lifecycle. Once revocation is enabled, never roll back to the old unrestricted application or restore deleted bill data; use a compatible forward fix/rollback artifact retaining access guards, markers and cleanup work. Do not down-migrate/drop these tables. Verify the existing Sites release mechanism can apply the additive D1 migration before any future production deploy; absence of that capability blocks release, not a reason to bypass migration. No remote migration is run in this task.
- [x] **Step 5: Commit verifier and evidence.** `test: verify native bill retention and deletion`.

### Task 10: Complete browser proof, review and release handoff

**Files:** Verification report plus only fixes justified by failing checks/review.

**Interfaces:** Consumes the integrated application and both approved plans; produces a reviewable branch and an evidence-backed release/migration handoff, not an automatic production deployment.

- [x] **Step 1: Run complete automated gates once after final changes.** `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`, `git diff --check`, and both modes of Task 9's verifier using their disposable setup. Require zero failures/successful exits. Check unrelated build-info hash against `2d11d2fa43f0e9303cc8957a0dcdacee87a4d8f530235f249d1d5496b38682d5`.
- [ ] **Step 2: Perform native browser acceptance.** Creator browser: meaningful draft → close/reopen → history → resume → publish → new bill → old history still present. Second independent browser: edit via retained link, confirm no imported history, mark final payer paid; creator foreground refresh adopts the 7-day deadline. Revert a payer and complete again. Share-only browser: cannot delete; valid sharing/unmask/copy still works while active. Manually delete, then open share/edit/QR from the other contexts and verify the approved gone state and no stale sensitive UI. Repeat automatic expiry with synthetic local fixtures; inspect IndexedDB after purge.
- [ ] **Step 3: Verify desktop and mobile UI.** At 360×800 plus 320px width and 200% text zoom, test long Thai names/titles/amounts, countdown transition, delete dialog focus/keyboard, persistent compact total, expanded fees, last-field reachability, QR selection and same-browser multi-tab invalidation. Inspect a blocked v1 upgrade/storage-denied case. Capture screenshots with synthetic data; disclose physical keyboard/browser-control gaps rather than marking them passed.
- [x] **Step 4: Obtain one fresh whole-branch review for Native execution.** Review both implementation plans against the approved spec, SQL races/access paths, privacy, rollback safety and UI integration. Reproduce and fix actionable findings with focused regressions; rerun broader gates only if those changes justify it. No per-task subagent implementation or repeated method/worktree approval.
- [x] **Step 5: Finalize the verification/release report and commit.** State exact passing commands, observed browser scenarios, remaining gates, migration ordering and current branch/commits. Keep runtime tokens and personal values out. If release is requested later, use the existing Sites/GitHub workflow and exact verified source; do not deploy or delete real production data in this planning/implementation handoff.

## Self-review and acceptance mapping

| Approved design section | Owning tasks |
| --- | --- |
| Status, positive payers, 30/7 days, no-op and re-completion | 1, 3 |
| Server-authoritative clock/countdown and no per-second API | 1, 7, 8 |
| One-time legacy grace and concurrency-sensitive migration | 2, 3, 9 |
| On-open expiry, manual deletion, invalidated links/QR, no resurrection | 3–5, 9 |
| Durable pending deletion, R2 races/restarts and minimal markers | 4, 7, 9 |
| Same-browser provenance, deduplication, old receipts, draft/QR preservation | 6, 7 |
| Missing/stale share proof, history controls, exact deleted card | 5, 8 |
| National-ID exclusion, masking/copy, minimal history, cleared sensitive views | 3, 5–8 |
| Compact bottom total | Preceding `2026-11-24-compact-live-total-bar.md`; integration rechecked in 10 |
| Real bindings, native multi-browser/mobile proof, full checks and review | 9, 10 |

## Execution Handoff

Design is approved; these detailed implementation decisions are prepared for review before product code changes. The user already chose Native and the existing checkout on a new branch. After plan review, use `superpowers:executing-plans`, implement the compact-total plan then this plan, and retain the same branch. Stop at the verified/reviewed handoff unless a separate push/deploy instruction applies; this feature's planning approval does not silently authorize production cleanup or migrations.

## Execution status — 2026-11-24

Product code and Tasks1–9 are implemented. The single fresh review produced five findings; all were reproduced and fixed, with496 tests,36 native D1/R2 assertions and203 HTTP assertions passing. Last HTTP gate used one bounded retry for the exact local Worker-restart response. Source commit: `9151fc7` (server/review fixes45bb95b). Final native long-list/large-amount/fee/OCR checks found and fixed preview/summary overflow; rebuilt320/360/1280px widths passed and the496-test suite was rerun green. Task10 Steps2/3 remain partially open for actual second-engine/device,200% text zoom, native storage-denial/IndexedDB inspection and physical keyboard checks. No push/deploy or hosted migration occurred.
