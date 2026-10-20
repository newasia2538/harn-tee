export type ParticipantDraft = {
  id: string;
  name: string;
  order: number;
};

export type FeeMode = "bill" | "item";

export type CalculationMode = "vat-after-service" | "separate";

export type ItemDraft = {
  id: string;
  name: string;
  priceSatang: number;
  payerIds: string[];
  vatPercent?: number;
  serviceChargePercent?: number;
  order: number;
};

export type ReceiptBox = { x0: number; y0: number; x1: number; y1: number };

export type ReceiptOcrWord = {
  text: string;
  confidence: number | null;
  bbox: ReceiptBox;
};

export type ReceiptOcrLine = {
  text: string;
  confidence: number | null;
  bbox?: ReceiptBox;
  words?: ReceiptOcrWord[];
};

export type ReceiptOcrItemStatus = "ready" | "needs-review";

export type ReceiptOcrItem = {
  id: string;
  name: string;
  priceSatang: number | null;
  rawLine: string;
  confidence: number | null;
  status: ReceiptOcrItemStatus;
  sourceBox?: ReceiptBox;
  priceBox?: ReceiptBox;
  priceConfidence?: number | null;
  reviewReasons?: string[];
  previewUrl?: string;
  suggestedPriceSatang?: number;
};

export type BillDraft = {
  title?: string;
  feeMode?: FeeMode;
  calculationMode?: CalculationMode;
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
  feeMode?: FeeMode;
  calculationMode?: CalculationMode;
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
    | "feeMode"
    | "calculationMode"
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
  serviceChargeSatang: number;
  vatSatang: number;
  totalSatang: number;
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
