import type { ItemDraft, ReceiptOcrItem } from "./types";

export function isReceiptItemReady(
  item: ReceiptOcrItem,
): item is ReceiptOcrItem & { status: "ready"; priceSatang: number } {
  return (
    item.status === "ready" &&
    typeof item.priceSatang === "number" &&
    Number.isInteger(item.priceSatang) &&
    item.priceSatang > 0 &&
    Boolean(item.name.trim())
  );
}

export function createItemDraftsFromReceipt(
  items: readonly (ReceiptOcrItem & { status: "ready"; priceSatang: number })[],
  participantIds: readonly string[],
  startingOrder: number,
  makeId: (index: number) => string,
): ItemDraft[] {
  return items.filter(isReceiptItemReady).map((item, index) => ({
    id: makeId(index),
    name: item.name.trim(),
    priceSatang: item.priceSatang,
    payerIds: [...participantIds],
    order: startingOrder + index,
  }));
}

export function appendReceiptItems(
  currentItems: readonly ItemDraft[],
  items: readonly (ReceiptOcrItem & { status: "ready"; priceSatang: number })[],
  participantIds: readonly string[],
  makeId: (index: number) => string,
): ItemDraft[] {
  return [
    ...currentItems,
    ...createItemDraftsFromReceipt(items, participantIds, currentItems.length, makeId),
  ];
}
