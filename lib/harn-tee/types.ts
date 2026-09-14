export type ParticipantDraft = {
  id: string;
  name: string;
  order: number;
};

export type ItemDraft = {
  id: string;
  name: string;
  priceSatang: number;
  payerIds: string[];
  order: number;
};

export type BillDraft = {
  title?: string;
  participants: ParticipantDraft[];
  items: ItemDraft[];
  vatPercent: number;
  serviceChargePercent: number;
  recipient?: RecipientData;
};

export type BankPayment = {
  bankId: string;
  accountNumber: string;
};

export type PromptPayPayment = {
  type: "phone" | "national-id";
  value: string;
};

export type QrPayment = {
  objectKey: string;
  contentType: string;
  size: number;
};

export type RecipientData = {
  name: string;
  bank: BankPayment | null;
  promptPay: PromptPayPayment | null;
  qr: QrPayment | null;
  visible: boolean;
};

export type BillParticipant = ParticipantDraft & {
  paid: boolean;
  paidAt: number | null;
};

export type BillDocument = {
  version: 1;
  status: "draft" | "published" | "deleted";
  title: string;
  participants: BillParticipant[];
  items: ItemDraft[];
  vatPercent: number;
  serviceChargePercent: number;
  recipient: RecipientData;
  createdAt: number;
  updatedAt: number;
};

export type BillPatch = Partial<
  Pick<
    BillDocument,
    | "title"
    | "participants"
    | "items"
    | "vatPercent"
    | "serviceChargePercent"
    | "recipient"
    | "status"
  >
>;

export type BillRecord = {
  id: string;
  document: BillDocument;
  access: "share" | "edit";
  shareToken?: string;
  editToken?: string;
};

export type CalculationInput = BillDraft;

export type LineItemShare = {
  itemId: string;
  name: string;
  amountSatang: number;
};

export type ParticipantCalculation = {
  participantId: string;
  name: string;
  itemSubtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  amountDueSatang: number;
  lineItems: LineItemShare[];
  roundingAdjustmentSatang: number;
};

export type CalculationResult = {
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  grossTotalSatang: number;
  collectedTotalSatang: number;
  roundingDifferenceSatang: number;
  participants: ParticipantCalculation[];
};

export type ValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: string[] };
