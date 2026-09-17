# harn-tee (หารที) Design Specification

## Goal

Build a Thai, mobile-first bill-splitting web app for one shared bill. People enter participants and item-level payers, then receive transparent per-person totals, payment instructions, and shareable summary/edit links without signing in.

## Product shape

- Brand: `harn-tee`, read in Thai as “หารที”.
- Primary flow: `รายชื่อคน → รายการสินค้า → ตรวจสอบ → สรุปผล`.
- One bill per share link; no account system in the MVP.
- Every bill has a bearer edit token and a separate public share token.
- Public pages are unlisted and accessible only to people with the URL.
- Data is durable server-side: D1 stores bill data and R2 stores optional QR images.
- UI is Thai, friendly, responsive, and task-first rather than marketing-led.

## Calculation contract

Let `subtotal` be the sum of item prices.

```text
serviceCharge = subtotal × serviceChargePercent / 100
vat = (subtotal + serviceCharge) × vatPercent / 100
grossTotal = subtotal + serviceCharge + vat
```

- Service charge is calculated from the item subtotal first; VAT is then calculated from the subtotal plus service charge.
- The bill owner can choose between this `vat-after-service` formula and the legacy `separate` formula, where VAT and service charge are each calculated from the item subtotal independently. New bills default to `vat-after-service`; documents without a stored choice use that same default so existing totals do not change.
- Each item starts with all participants selected as payers.
- An item is split equally across its selected payers.
- Currency inputs are positive Thai baht values with two displayed decimals.
- The final amount for each participant is rounded up to two decimals so equal shares remain equal when division is inexact.
- The UI always shows the receipt total, the collected total after per-person round-up, and the positive rounding difference.
- A short disclaimer is shown: “การหารอาจมีการปัดเศษขึ้นในกรณีที่หารกันไม่ลงตัว”.
- Affected payment statuses reset after an edit changes a person’s amount.

## Roles and links

### Public share link

- View summary and participant details.
- Select a participant and mark that participant’s total paid/unpaid.
- Status changes are self-reported and visible after refresh.
- No claim is made that a bank transfer was verified.

### Edit link

- Full admin access: people, items, fees, recipient data, payment statuses, deletion.
- The owner is the holder of this bearer URL; no login is required.
- The UI warns not to share the edit link.
- Deletion makes both public and edit links return a not-found state.

## Data model

- `bills`: identifiers, title, status, percentages, recipient/payment JSON, share/edit token hashes, timestamps.
- `participants`: stable bill-local ids, unique display names, display order.
- `items`: name, price in satang, display order.
- `item_payers`: item/participant join rows.
- `payment_statuses`: participant status and last-updated timestamp.
- `qr_assets`: R2 object key and image metadata, owned by a bill.

## UX requirements

- Add/remove participants with `+` controls; duplicate names are rejected after trimming.
- Remove a participant only after their item assignments are moved or removed.
- Add/edit/delete item cards.
- VAT/service charge default to `0.00%`, accept `0–100%`.
- Preview is required before publishing the public share link.
- Summary uses compact cards on mobile and may use a full table on desktop.
- Detail view shows item shares, VAT share, service-charge share, rounding adjustment, and total.
- Recipient supports a display name, bank account, PromptPay phone or Thai ID, and optional QR upload.
- Payment fields have copy buttons; QR accepts PNG/JPG/WebP up to 5 MB with preview.

## Explicit MVP non-goals

- Authentication, OCR, bank ownership verification, dynamic Thai QR generation, custom weighted splits, quantities, recurring expenses, English localization, and transfer verification.
