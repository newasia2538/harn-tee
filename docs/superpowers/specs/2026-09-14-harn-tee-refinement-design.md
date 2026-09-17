# harn-tee Refinement Design

## Approved visual direction

Use the Navy & Tangerine palette: deep navy ink and teal controls on a soft blue-gray canvas, with tangerine for primary actions and warnings. Keep body text at accessible contrast and avoid low-contrast gray-on-tinted-card combinations.

## Fee modes

Every new bill stores `feeMode` as either `bill` or `item`. Existing bills without this field are treated as `bill` mode.

Every bill also stores `calculationMode` as either `vat-after-service` or `separate`. Existing bills without this field are treated as `vat-after-service` so their current totals do not change.

- `bill`: the existing VAT and service-charge percentages apply to the bill subtotal.
- `item`: each item stores its own VAT and service-charge percentages. Service charge is calculated from that item price first, then VAT is calculated from that item price plus its service charge. Each fee is split equally among that item's selected payers.

Both modes calculate service charge from item prices first, then calculate VAT from the item price plus the allocated service charge. The calculation result keeps the fee amount on each participant and also exposes fee components on every participant line item so Preview and Summary can audit the result.

When `calculationMode` is `separate`, VAT is calculated from item prices without adding service charge first, preserving the previous formula in both fee modes.

## Preview and Summary

The Preview participant rows become interactive. Selecting a person opens the same item-level detail pattern used on Summary, including base item share, VAT, service charge, line total, and participant total.

Summary uses the same calculation contract and shows the item fee breakdown in its detail dialog. Mobile keeps the card layout; desktop may use the same cards without introducing a wide table.

## Bank picker

Replace the native select with a compact accessible picker showing a locally bundled bank mark, bank short code, and Thai name. The list remains limited to the supported Thai banks already offered by the form. Logos are local assets so the picker and Summary do not depend on third-party image availability.

## Compatibility and verification

Old published documents remain readable through fallback `feeMode: bill` and missing item fee values defaulting to zero. Add pure calculation coverage for both fee modes, run the existing test/lint/typecheck/build gates, and exercise the create → Preview detail → publish → Summary detail flow at 360px, 390px, and 412px viewport widths.
