import type { ReceiptOcrItem, ReceiptOcrLine } from "./types";

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const REVIEW_KEYWORDS = [
  "รวม",
  "subtotal",
  "total",
  "vat",
  "ภาษี",
  "service",
  "ส่วนลด",
  "เงินทอน",
  "รับเงิน",
  "ยอดสุทธิ",
  "tax",
  "change",
];

function normalizeDigits(value: string) {
  return [...value]
    .map((character) => {
      const index = THAI_DIGITS.indexOf(character);
      return index === -1 ? character : String(index);
    })
    .join("");
}

export function normalizeReceiptLine(line: string) {
  return normalizeDigits(line).trim().replace(/\s+/g, " ");
}

function parsePriceCandidate(line: string) {
  const match = line.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:บาท|฿|%)?\s*$/i);
  if (!match || match.index === undefined) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;

  const priceSatang = Math.round(amount * 100);
  return {
    priceSatang: priceSatang > 0 ? priceSatang : null,
    name: line.slice(0, match.index).trim().replace(/฿\s*$/, "").trim(),
  };
}

function hasReviewKeyword(line: string) {
  const normalized = line.toLocaleLowerCase();
  return REVIEW_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function parseReceiptLines(lines: readonly ReceiptOcrLine[]): ReceiptOcrItem[] {
  const items: ReceiptOcrItem[] = [];

  for (const line of lines) {
    const normalizedLine = normalizeReceiptLine(line.text);
    if (!normalizedLine) continue;

    const candidate = parsePriceCandidate(normalizedLine);
    const rawLine = line.text.trim().replace(/\s+/g, " ");
    const name = candidate?.name || normalizedLine;
    const status =
      !candidate ||
      candidate.priceSatang === null ||
      !name ||
      (line.confidence !== null && line.confidence < 60) ||
      hasReviewKeyword(normalizedLine)
        ? "needs-review"
        : "ready";

    items.push({
      id: "ocr-" + (items.length + 1),
      name,
      priceSatang: candidate?.priceSatang ?? null,
      rawLine,
      confidence: line.confidence,
      status,
    });
  }

  return items;
}
