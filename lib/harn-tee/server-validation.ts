import { z } from "zod";

const percentage = z.number().finite().min(0).max(100);

const participant = z.object({
  id: z.string().min(1).max(80),
  name: z.string().max(120),
  order: z.number().int().min(0).max(9999),
  paid: z.boolean().optional(),
  paidAt: z.number().int().nullable().optional(),
}).strict();

const item = z.object({
  id: z.string().min(1).max(80),
  name: z.string().max(200),
  priceSatang: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  payerIds: z.array(z.string().min(1).max(80)).max(100),
  vatPercent: percentage.optional(),
  serviceChargePercent: percentage.optional(),
  order: z.number().int().min(0).max(9999),
}).strict();

const bank = z.object({
  bankId: z.string().min(1).max(20),
  accountNumber: z.string().max(32),
}).strict();

const promptPay = z.object({
  type: z.enum(["phone", "national-id"]),
  value: z.string().max(32),
}).strict();

const qr = z.object({
  objectKey: z.string().min(1).max(300),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  size: z.number().int().min(0).max(5 * 1024 * 1024),
}).strict();

const recipient = z.object({
  name: z.string().max(120),
  bank: bank.nullable(),
  promptPay: promptPay.nullable(),
  qr: qr.nullable(),
  visible: z.boolean(),
}).strict();

const billFields = {
  title: z.string().max(160).optional(),
  feeMode: z.enum(["bill", "item"]).optional(),
  calculationMode: z.enum(["vat-after-service", "separate"]).optional(),
  participants: z.array(participant).max(100),
  items: z.array(item).max(500),
  vatPercent: percentage,
  serviceChargePercent: percentage,
  recipient: recipient.optional(),
};

export const billCreateBodySchema = z.object({
  ...billFields,
  draft: z.boolean().optional(),
}).strict();

export const billPatchBodySchema = z.object({
  title: billFields.title,
  feeMode: billFields.feeMode,
  calculationMode: billFields.calculationMode,
  participants: billFields.participants.optional(),
  items: billFields.items.optional(),
  vatPercent: billFields.vatPercent.optional(),
  serviceChargePercent: billFields.serviceChargePercent.optional(),
  recipient: recipient.optional(),
  status: z.literal("published").optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "ต้องมีข้อมูลอย่างน้อยหนึ่งรายการที่ต้องการแก้ไข",
});

export const paymentStatusBodySchema = z.object({
  participantId: z.string().min(1).max(80),
  paid: z.boolean(),
}).strict();
