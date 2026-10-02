# Receipt OCR Auto-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้ถ่ายรูปหรือเลือกรูปใบเสร็จ แล้วตรวจสอบรายการที่ OCR อ่านได้ก่อนเติมเป็นรายการสินค้าใน harn-tee โดยไม่ส่งรูปใบเสร็จไป backend

**Architecture:** แยกงานเป็นสามชั้น: parser แบบ pure function สำหรับแปลงข้อความ OCR, client-only OCR service สำหรับ Tesseract.js และ image preprocessing, และ `ReceiptScanner` สำหรับ flow เลือกรูป/กำลังอ่าน/ตรวจสอบ/ยืนยัน จากนั้นให้ `HarnTeeApp` เป็นเจ้าของการแปลงรายการที่ยืนยันแล้วเป็น `ItemDraft` และ append เข้า draft เดิม

**Tech Stack:** Next.js 16 + React 19, TypeScript, Tesseract.js browser worker (`tha+eng`), Vitest, Testing Library สำหรับ component tests, Tailwind/shadcn components ที่มีอยู่แล้ว

**Spec:** `docs/superpowers/specs/2026-10-02-receipt-ocr-design.md`

## Global Constraints

- ใช้ OCR ภาษา `tha+eng` ใน browser เท่านั้น และห้ามส่ง `File` หรือรูปใบเสร็จไปยัง `/api/bills`, D1 หรือ R2
- รับเฉพาะ `image/*` และจำกัดไฟล์เริ่มต้นไม่เกิน `10 MB`; ใช้ `capture="environment"` เพื่อให้มือถือเลือกกล้องได้
- ต้องมีหน้าตรวจสอบก่อน import เสมอ; ห้ามแก้ `BillDraft` ก่อนผู้ใช้กดยืนยัน
- รายการที่ยืนยันแล้วต้องแปลงราคาเป็น `priceSatang` และตั้ง `payerIds` เป็นผู้ร่วมบิลทุกคน
- MVP อ่านเฉพาะชื่อรายการกับราคา ไม่เดา VAT, service charge, ส่วนลด, ยอดรวม หรือผู้ที่เป็นเจ้าของรายการ
- ห้ามเปลี่ยน `BillDocument`, D1 schema, bill API หรือ flow VAT/service charge เดิม
- เก็บรูปไว้ใน memory/object URL เท่านั้น; revoke object URL ต่อ operation และ terminate worker เมื่อ scanner unmount/session สิ้นสุด
- ใช้ข้อความเตือนว่า `ระบบอ่านจากภาพ อาจคลาดเคลื่อน กรุณาตรวจสอบทุกรายการก่อนยืนยัน`
- ต้องไม่มี horizontal overflow ที่ viewport กว้าง `360px` และปุ่ม/input ต้องมี accessible name ภาษาไทย
- MVP ใช้ resource resolution มาตรฐานของ Tesseract.js เพื่อไม่เพิ่ม binary asset ขนาดใหญ่ใน repository; หากพบปัญหา CDN ให้แยกเป็นงาน self-host model ภายหลัง

## Review Focus

- เลขไทย, comma, จุดทศนิยม และสัญลักษณ์บาทต้องกลายเป็น satang ที่ถูกต้อง — ทดสอบใน `tests/harn-tee/receipt-parser.test.ts`
- บรรทัด total/VAT/service/discount, บรรทัดไม่มีราคา และ confidence ต่ำต้องถูก mark `needs-review` ไม่ import เงียบ ๆ — ทดสอบใน parser และ scanner review tests
- ไฟล์ผิดชนิด, ใหญ่เกิน `10 MB`, และรูปที่ browser แปลงไม่ได้ต้องแสดง error ที่แก้ต่อได้ — ทดสอบใน `tests/harn-tee/receipt-ocr.test.ts`
- การ cancel, OCR error และการเลือก review ก่อนยืนยันต้องไม่เรียก `onImport` หรือทำให้ draft เปลี่ยน — ทดสอบใน `tests/harn-tee/receipt-scanner.test.tsx`
- การ scan ซ้ำต้อง append ต่อท้าย, รักษารายการเดิม/fee fields และให้ผู้ร่วมบิลทุกคนเป็น payer เริ่มต้น — ทดสอบใน `tests/harn-tee/receipt-import.test.ts` และ integration smoke test

---

### Task 1: Add receipt contracts and browser-test dependencies

**Files:**
- Modify: `package.json:17-63`
- Modify: `package-lock.json`
- Modify: `lib/harn-tee/types.ts:1-19`

**Interfaces:**
- Produces shared types `ReceiptOcrLine`, `ReceiptOcrItemStatus`, and `ReceiptOcrItem` for the parser, OCR service, scanner, and importer.

- [ ] **Step 1: Add the runtime and test dependencies**

  Add `tesseract.js` to `dependencies`. Add `@testing-library/react`, `@testing-library/user-event`, and `jsdom` to `devDependencies`; keep Vitest's default Node environment so only the component test file opts into jsdom with its file directive.

  Run:

  ```bash
  npm install tesseract.js
  npm install --save-dev @testing-library/react @testing-library/user-event jsdom
  ```

- [ ] **Step 2: Define the OCR result contract in `lib/harn-tee/types.ts`**

  Add:

  ```ts
  export type ReceiptOcrLine = {
    text: string;
    confidence: number | null;
  };

  export type ReceiptOcrItemStatus = "ready" | "needs-review";

  export type ReceiptOcrItem = {
    id: string;
    name: string;
    priceSatang: number | null;
    rawLine: string;
    confidence: number | null;
    status: ReceiptOcrItemStatus;
  };
  ```

  Keep these types independent from `BillDocument` and `ItemDraft`; OCR data is an ephemeral review model.

- [ ] **Step 3: Verify the contract compiles without changing application behavior**

  Run: `npx tsc --noEmit`

  Expected: PASS. No database or API files should be modified by this task.

- [ ] **Step 4: Commit**

  ```bash
  git add package.json package-lock.json lib/harn-tee/types.ts
  git commit -m "feat: add receipt OCR contracts"
  ```

### Task 2: Build the pure receipt parser and ItemDraft importer

**Files:**
- Create: `lib/harn-tee/receipt-parser.ts`
- Create: `lib/harn-tee/receipt-import.ts`
- Create: `tests/harn-tee/receipt-parser.test.ts`
- Create: `tests/harn-tee/receipt-import.test.ts`
- Modify: `lib/harn-tee/types.ts:1-19` only if a confirmed-item type guard needs to be exported

**Interfaces:**
- Consumes: `ReceiptOcrLine[]` and participant ids.
- Produces: `parseReceiptLines(lines: readonly ReceiptOcrLine[]): ReceiptOcrItem[]`, `isReceiptItemReady(item: ReceiptOcrItem): item is ReceiptOcrItem & { status: "ready"; priceSatang: number }`, `createItemDraftsFromReceipt(items, participantIds, startingOrder, makeId): ItemDraft[]`, and `appendReceiptItems(currentItems, items, participantIds, makeId): ItemDraft[]`.

- [ ] **Step 1: Write failing parser tests**

  In `tests/harn-tee/receipt-parser.test.ts`, add tests with exact assertions for:

  - `ข้าวผัด ๑,๒๓๔.๕๐ บาท` becoming `name: "ข้าวผัด"` and `priceSatang: 123450`.
  - `ชาเย็น ฿75.5` becoming `7550` and a plain `น้ำเปล่า` becoming `priceSatang: null` with `status: "needs-review"`.
  - `รวม 1,309.50`, `VAT 7%`, `Service 10%`, `ส่วนลด 50`, `เงินทอน 0` being retained as reviewable rows when they have a price, never as ready rows.
  - confidence `59` becoming `needs-review`, confidence `90` with a normal product line becoming `ready`, and blank lines being skipped.
  - deterministic ids `ocr-1`, `ocr-2`, ... and preservation of the original trimmed `rawLine`.

- [ ] **Step 2: Run parser tests and confirm they fail**

  Run: `npm test -- tests/harn-tee/receipt-parser.test.ts`

  Expected: FAIL because `lib/harn-tee/receipt-parser.ts` does not exist yet.

- [ ] **Step 3: Implement normalization and candidate extraction**

  Implement `normalizeReceiptLine` and `parseReceiptLines` in `lib/harn-tee/receipt-parser.ts` with these fixed rules:

  - Trim and collapse whitespace, convert Thai digits `๐-๙` to Arabic digits, and normalize `฿`/`บาท` suffixes.
  - Read only the final numeric candidate on a line; accept comma thousands separators and up to two decimal places, then round to integer satang.
  - Mark a row `needs-review` when it has no valid positive price, confidence below `60`, or any keyword in `รวม`, `subtotal`, `total`, `vat`, `ภาษี`, `service`, `ส่วนลด`, `เงินทอน`, `รับเงิน`, `ยอดสุทธิ`, `tax`, `change`.
  - Keep uncertain non-empty lines for review instead of dropping them; skip only blank lines.
  - Derive `name` by removing the selected trailing price and currency suffix, while leaving `rawLine` unchanged apart from trimming.

- [ ] **Step 4: Run parser tests and confirm they pass**

  Run: `npm test -- tests/harn-tee/receipt-parser.test.ts`

  Expected: PASS with all normalization, keyword, confidence, and no-price cases covered.

- [ ] **Step 5: Write failing importer tests**

  In `tests/harn-tee/receipt-import.test.ts`, test `createItemDraftsFromReceipt` with a deterministic id factory:

  - Two confirmed rows produce `ItemDraft`s with new ids, `order` values starting at `startingOrder`, trimmed names, and integer `priceSatang`.
  - Every output item receives a new copy of all participant ids in `payerIds`, in participant order.
  - `vatPercent` and `serviceChargePercent` remain `undefined` so the existing bill/item fee flow decides fees.
  - The source OCR rows and participant id array are not mutated.
  - `appendReceiptItems` preserves an existing item object and its fee fields, then appends confirmed rows with orders beginning at the current item count.

- [ ] **Step 6: Run importer tests and confirm they fail**

  Run: `npm test -- tests/harn-tee/receipt-import.test.ts`

  Expected: FAIL because `lib/harn-tee/receipt-import.ts` does not exist yet.

- [ ] **Step 7: Implement the importer and readiness guard**

  Implement:

  ```ts
  export function isReceiptItemReady(
    item: ReceiptOcrItem,
  ): item is ReceiptOcrItem & { status: "ready"; priceSatang: number };

  export function createItemDraftsFromReceipt(
    items: readonly (ReceiptOcrItem & { status: "ready"; priceSatang: number })[],
    participantIds: readonly string[],
    startingOrder: number,
    makeId: (index: number) => string,
  ): ItemDraft[];

  export function appendReceiptItems(
    currentItems: readonly ItemDraft[],
    items: readonly (ReceiptOcrItem & { status: "ready"; priceSatang: number })[],
    participantIds: readonly string[],
    makeId: (index: number) => string,
  ): ItemDraft[];
  ```

  The readiness guard must require a non-empty name, integer `priceSatang > 0`, and `status === "ready"`. The importer must only map confirmed rows and must not calculate or copy any VAT/service values. `appendReceiptItems` must return a new array, preserve existing item objects, and call `createItemDraftsFromReceipt` with `startingOrder = currentItems.length`.

- [ ] **Step 8: Run parser and importer tests**

  Run: `npm test -- tests/harn-tee/receipt-parser.test.ts tests/harn-tee/receipt-import.test.ts`

  Expected: PASS.

- [ ] **Step 9: Commit**

  ```bash
  git add lib/harn-tee/receipt-parser.ts lib/harn-tee/receipt-import.ts lib/harn-tee/types.ts tests/harn-tee/receipt-parser.test.ts tests/harn-tee/receipt-import.test.ts
  git commit -m "feat: parse and import receipt items"
  ```

### Task 3: Implement the client-only OCR service and image preparation

**Files:**
- Create: `lib/harn-tee/receipt-ocr.ts`
- Create: `tests/harn-tee/receipt-ocr.test.ts`

**Interfaces:**
- Consumes: a browser `File` and optional `AbortSignal`/progress callback.
- Produces: `validateReceiptImage(file)`, `recognizeReceipt(file, options)`, and `disposeReceiptOcrWorker()`.

- [ ] **Step 1: Write failing service tests**

  Add tests for:

  - `validateReceiptImage` accepting an image at or below `10 * 1024 * 1024` bytes.
  - Rejecting `application/pdf` with `ไฟล์ต้องเป็นรูปภาพ` and rejecting an image above the limit with `ไฟล์ใบเสร็จต้องมีขนาดไม่เกิน 10 MB`.
  - `recognizeReceipt` forwarding worker progress and returning `rawText` plus `{ text, confidence }` lines from a mocked Tesseract result; a separate `disposeReceiptOcrWorker` call terminates the worker.
  - An aborted signal resulting in an AbortError and no result being passed to the parser/UI.

- [ ] **Step 2: Run the service tests and confirm they fail**

  Run: `npm test -- tests/harn-tee/receipt-ocr.test.ts`

  Expected: FAIL because the service module is missing.

- [ ] **Step 3: Implement the image validation and preprocessing boundary**

  In `lib/harn-tee/receipt-ocr.ts`, export:

  ```ts
  export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024;
  export type ReceiptOcrProgress = {
    phase: "preparing" | "loading-model" | "recognizing";
    progress: number;
    message: string;
  };
  export type ReceiptOcrResult = {
    rawText: string;
    lines: ReceiptOcrLine[];
  };
  export function validateReceiptImage(file: File): { valid: true } | { valid: false; error: string };
  export async function recognizeReceipt(
    file: File,
    options?: { signal?: AbortSignal; onProgress?: (progress: ReceiptOcrProgress) => void },
  ): Promise<ReceiptOcrResult>;
  export async function disposeReceiptOcrWorker(): Promise<void>;
  ```

  Keep all browser-only work inside the functions: lazy-load `tesseract.js`, create/reuse one worker per scanner session with `tha+eng`, and never import or initialize it during server rendering. Resize the image to a bounded canvas, apply grayscale/contrast preprocessing, and convert to a JPEG blob when the browser can decode the source. If decoding/conversion fails (including unsupported HEIC), throw a user-facing error without making a request to the app API.

- [ ] **Step 4: Implement progress, cancellation, and cleanup**

  Map model loading and recognition logger events to the progress callback, check `signal.aborted` before expensive work and after OCR returns, revoke every temporary object URL in `finally`, and terminate the singleton worker only from `disposeReceiptOcrWorker`.

  Use Tesseract's default worker/core/model resource resolution for this MVP; do not add a cloud OCR provider, receipt upload, or large static model files.

- [ ] **Step 5: Run service tests and typecheck**

  Run: `npm test -- tests/harn-tee/receipt-ocr.test.ts`

  Expected: PASS.

  Run: `npx tsc --noEmit`

  Expected: PASS with no server-build import of browser-only OCR code.

- [ ] **Step 6: Commit**

  ```bash
  git add lib/harn-tee/receipt-ocr.ts tests/harn-tee/receipt-ocr.test.ts
  git commit -m "feat: add client receipt OCR service"
  ```

### Task 4: Build the reviewable ReceiptScanner component

**Files:**
- Create: `components/harn-tee/receipt-scanner.tsx`
- Create: `tests/harn-tee/receipt-scanner.test.tsx`

**Interfaces:**
- Consumes: `ParticipantDraft[]`, `recognizeReceipt`, `parseReceiptLines`, and `isReceiptItemReady`.
- Produces: `ReceiptScanner({ participants, onImport }: { participants: readonly ParticipantDraft[]; onImport: (items: ReceiptOcrItem[]) => void })`.

- [ ] **Step 1: Write failing component tests**

  Opt the test file into jsdom and mock `@/lib/harn-tee/receipt-ocr` so tests never run real WASM. Add tests that:

  - Render the idle state with a Thai accessible button/label, `accept="image/*"`, and `capture="environment"`.
  - Selecting a file shows reading progress, then review rows with editable name/price fields.
  - A `needs-review` row shows `ตรวจสอบ`, and import is disabled until the user fixes its name and positive price.
  - `เพิ่มรายการ` creates an editable review row; deleting a row removes it.
  - Clicking `เพิ่มเข้ารายการสินค้า` calls `onImport` only after confirmation and passes no invalid rows.
  - Cancel during reading or review does not call `onImport` and returns to the idle state.
  - OCR rejection shows `อ่านใบเสร็จไม่สำเร็จ กรุณาลองใหม่หรือกรอกเอง` and supports retry.
  - OCR returning no non-empty lines shows `อ่านไม่พบรายการ` and offers manual entry without calling `onImport`.
  - Invalid file selection surfaces the file-type/size error and leaves the parent draft untouched.
  - `globalThis.fetch` is not called during the scan/review flow.

- [ ] **Step 2: Run component tests and confirm they fail**

  Run: `npm test -- tests/harn-tee/receipt-scanner.test.tsx`

  Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement the scanner state machine**

  Implement explicit states `idle`, `reading`, `review`, and `error`; keep selected rows local until confirmation. Use a hidden file input controlled by a visible `ถ่ายรูปใบเสร็จ` button, `accept="image/*"`, and `capture="environment"`.

  The reading state must disable duplicate selection, expose progress through `role="status"`/`aria-live`, and provide `ยกเลิก`. The error state must preserve the existing parent draft and provide `ลองใหม่` plus a path back to manual entry.

- [ ] **Step 4: Implement the mobile-safe review UI**

  Render review rows as stacked cards rather than a wide table. Each row contains accessible name and decimal price inputs, a `ตรวจสอบ` badge when status is `needs-review`, a compact source-line disclosure for verification, and a delete button. Recompute status after edits; only rows passing `isReceiptItemReady` can be imported. Keep the exact warning copy from the global constraints above.

- [ ] **Step 5: Implement cleanup and confirmation**

  Abort the active OCR operation and call `disposeReceiptOcrWorker` on unmount/cancel. On confirmation, pass a defensive copy of confirmed OCR rows to `onImport`, reset scanner-local state, and leave parent draft mutation to the caller.

- [ ] **Step 6: Run component tests and lint**

  Run: `npm test -- tests/harn-tee/receipt-scanner.test.tsx`

  Expected: PASS.

  Run: `npm run lint`

  Expected: PASS with no accessibility or hook lint errors.

- [ ] **Step 7: Commit**

  ```bash
  git add components/harn-tee/receipt-scanner.tsx tests/harn-tee/receipt-scanner.test.tsx
  git commit -m "feat: add receipt review scanner"
  ```

### Task 5: Integrate scanning into the existing item workflow

**Files:**
- Modify: `components/harn-tee/item-editor.tsx:1-25,180-188`
- Modify: `app/harn-tee-client.tsx:3-28,125-144,332-351`
- Create: `tests/harn-tee/item-editor.test.tsx`

**Interfaces:**
- Consumes: `ReceiptScanner` and `appendReceiptItems`.
- Produces: scan button in step 2 that appends confirmed items to the existing draft without touching fees, payment data, or existing items.

- [ ] **Step 1: Write the failing item-editor integration test**

  Opt the test into jsdom and render `ItemEditor` with one item and two participants. Assert that the user-visible button `ถ่ายรูปใบเสร็จ` is present beside the manual `เพิ่มรายการสินค้า` action, has a Thai accessible name, and that the existing per-item VAT/service controls still render when `feeMode="item"`.

- [ ] **Step 2: Run the integration test and confirm it fails**

  Run: `npm test -- tests/harn-tee/item-editor.test.tsx`

  Expected: FAIL because `ItemEditor` does not render `ReceiptScanner` or accept its import callback yet.

- [ ] **Step 3: Add the scanner entry point to `ItemEditor`**

  Add an `onImport: (items: ReceiptOcrItem[]) => void` prop, render `ReceiptScanner` beside the existing `เพิ่มรายการสินค้า` action, and pass the current `participants`. Keep manual add/remove and per-item VAT/service charge controls unchanged.

- [ ] **Step 4: Append confirmed rows in `HarnTeeApp`**

  Add `importReceiptItems(receiptItems: ReceiptOcrItem[])` next to `addItem`/`updateItem`. Inside one functional `setDraft` update, call `appendReceiptItems(current.items, receiptItems, current.participants.map(({ id }) => id), (index) => makeId("item") + "-" + index)` and assign the returned array to `items`. Pass this callback to `ItemEditor`.

  Do not call the bill API during scanning, do not alter `feeMode`, `calculationMode`, `vatPercent`, `serviceChargePercent`, `recipient`, or `qrFile`, and keep scan-sourced rows subject to the existing `validateBillDraft` on Next/Save.

- [ ] **Step 5: Run focused tests and typecheck**

  Run: `npm test -- tests/harn-tee/receipt-parser.test.ts tests/harn-tee/receipt-import.test.ts tests/harn-tee/receipt-scanner.test.tsx tests/harn-tee/item-editor.test.tsx`

  Expected: PASS.

  Run: `npx tsc --noEmit`

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add components/harn-tee/item-editor.tsx app/harn-tee-client.tsx tests/harn-tee/item-editor.test.tsx
  git commit -m "feat: connect receipt scanner to item editor"
  ```

### Task 6: Verify production behavior and mobile layout

**Files:**
- Modify: only files required by verification fixes; do not change API/schema unless a test proves a regression outside this feature
- Optional: `docs/superpowers/verification/2026-10-02-receipt-ocr.md` for the completed verification record

**Interfaces:**
- Consumes: the completed scanner, parser, importer, and existing harn-tee workflow.
- Produces: verified feature ready for user acceptance; no deployment is included in this plan.

- [ ] **Step 1: Run the complete automated gate**

  Run:

  ```bash
  npm test
  npm run lint
  npx tsc --noEmit
  npm run build
  git diff --check
  ```

  Expected: all commands pass, the production build completes, and no diff whitespace errors are reported.

- [ ] **Step 2: Run the mobile smoke test at 360px**

  In the local production-like site, use a 360px-wide viewport and verify: the scan button is reachable, camera/file picker opens, reading status is visible, review cards do not overflow horizontally, name/price inputs remain editable, delete/add/confirm/cancel are reachable by touch and keyboard, and the existing Next/Back flow still works.

- [ ] **Step 3: Run the desktop and failure-path smoke test**

  Verify one Thai receipt and one English receipt, a scan with no recognizable price, OCR failure/retry, cancel during reading, repeated scan append, and manual editing after import. Confirm the browser network log contains no request carrying the receipt image to `/api/bills` or the QR upload route.

- [ ] **Step 4: Record verification and commit any narrow fixes**

  Record the viewport and pass/fail observations in the optional verification file. If a fix is needed, add a regression test in the owning task's test file, rerun the relevant gate, then commit with a focused message such as `fix: handle receipt OCR review edge case`.

- [ ] **Step 5: Final review**

  Review the final diff for accidental changes to calculation modes, payment data, API payloads, or receipt image persistence. Confirm the only intentional new network dependency is OCR model loading in the browser, and that the feature remains usable through manual item entry when OCR is unavailable.
