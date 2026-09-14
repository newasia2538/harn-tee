import { calculateBill } from "./money";
import type { BillDraft, ItemDraft } from "./types";

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (input: unknown) => unknown | Promise<unknown>;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

type Actions = {
  getDraft: () => BillDraft;
  start: () => void;
  addItem: (item: ItemDraft) => void;
};

export function registerHarnTeeTools(actions: Actions) {
  if (typeof document === "undefined") return () => {};
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();

  const register = async () => {
    await context.registerTool(
      {
        name: "start_harn_tee_bill",
        title: "Start harn-tee bill",
        description: "Open the harn-tee bill creation flow and focus the participant step.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: () => {
          actions.start();
          return { status: "ready", step: "participants" };
        },
      },
      { signal: lifecycle.signal },
    );
    await context.registerTool(
      {
        name: "add_harn_tee_item",
        title: "Add harn-tee item",
        description: "Add one priced item to the current harn-tee bill.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            priceBaht: { type: "number", minimum: 0.01 },
            payerIds: { type: "array", items: { type: "string" } },
          },
          required: ["name", "priceBaht"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          const value = input as { name?: unknown; priceBaht?: unknown; payerIds?: unknown };
          if (typeof value.name !== "string" || typeof value.priceBaht !== "number" || value.priceBaht <= 0) {
            throw new Error("name and positive priceBaht are required");
          }
          const draft = actions.getDraft();
          const payerIds = Array.isArray(value.payerIds)
            ? value.payerIds.filter((id): id is string => typeof id === "string")
            : draft.participants.map((person) => person.id);
          const item: ItemDraft = {
            id: "item-tool-" + Math.random().toString(36).slice(2, 10),
            name: value.name.trim(),
            priceSatang: Math.round(value.priceBaht * 100),
            payerIds,
            order: draft.items.length,
          };
          actions.addItem(item);
          const summary = calculateBill({ ...draft, items: [...draft.items, item] });
          return { status: "added", itemName: value.name.trim(), subtotalSatang: summary.subtotalSatang };
        },
      },
      { signal: lifecycle.signal },
    );
    await context.registerTool(
      {
        name: "read_harn_tee_summary",
        title: "Read harn-tee summary",
        description: "Read the current harn-tee bill totals and participant amounts.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => {
          const summary = calculateBill(actions.getDraft());
          return {
            subtotalSatang: summary.subtotalSatang,
            grossTotalSatang: summary.grossTotalSatang,
            collectedTotalSatang: summary.collectedTotalSatang,
            participants: summary.participants.map((person) => ({
              participantId: person.participantId,
              name: person.name,
              amountDueSatang: person.amountDueSatang,
            })),
          };
        },
      },
      { signal: lifecycle.signal },
    );
  };

  void register().catch(() => lifecycle.abort());
  return () => lifecycle.abort();
}
