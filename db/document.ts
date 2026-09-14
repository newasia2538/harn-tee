import type {
  BillDocument,
  BillDraft,
  BillPatch,
  RecipientData,
} from "../lib/harn-tee/types";

const emptyRecipient: RecipientData = {
  name: "",
  bank: null,
  promptPay: null,
  qr: null,
  visible: true,
};

export function buildBillDocument(
  draft: BillDraft,
  now = Date.now(),
  status: BillDocument["status"] = "draft",
): BillDocument {
  return {
    version: 1,
    status,
    title: draft.title?.trim() ?? "",
    feeMode: draft.feeMode ?? "bill",
    participants: draft.participants.map((person) => ({
      ...person,
      name: person.name.trim(),
      paid: false,
      paidAt: null,
    })),
    items: draft.items.map((item) => ({
      ...item,
      name: item.name.trim(),
      payerIds: [...item.payerIds],
    })),
    vatPercent: draft.vatPercent,
    serviceChargePercent: draft.serviceChargePercent,
    recipient: {
      ...emptyRecipient,
      ...(draft.recipient ?? {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

function hasFinancialChange(patch: BillPatch) {
  return (
    patch.participants !== undefined ||
    patch.items !== undefined ||
    patch.feeMode !== undefined ||
    patch.vatPercent !== undefined ||
    patch.serviceChargePercent !== undefined
  );
}

export function applyBillPatch(
  current: BillDocument,
  patch: BillPatch,
  now = Date.now(),
): BillDocument {
  const next: BillDocument = {
    ...current,
    ...patch,
    updatedAt: now,
    title: patch.title?.trim() ?? current.title,
    participants:
      patch.participants?.map((person) => ({
        ...person,
        name: person.name.trim(),
        paid: person.paid,
        paidAt: person.paidAt,
      })) ?? current.participants,
    items:
      patch.items?.map((item) => ({
        ...item,
        name: item.name.trim(),
        payerIds: [...item.payerIds],
      })) ?? current.items,
    recipient: patch.recipient
      ? {
          ...emptyRecipient,
          ...current.recipient,
          ...patch.recipient,
        }
      : current.recipient,
  };

  if (hasFinancialChange(patch)) {
    next.participants = next.participants.map((person) => ({
      ...person,
      paid: false,
      paidAt: null,
    }));
  }

  return next;
}
