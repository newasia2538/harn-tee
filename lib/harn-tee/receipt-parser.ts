import type { ReceiptBox, ReceiptOcrItem, ReceiptOcrLine } from "./types";

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const MIN_CONFIDENCE = 60;
const SUBTOTAL = /^(?:sub\s*total|ยอดรวมสินค้า|รวมสินค้า|ยอดก่อนภาษี)(?=$|[\s:฿\d])/i;
const NON_ITEM = /^(?:(?:(?:grand|net)\s*)?total|amount\s*due|tendered|cash|change|discount|payment|paid|credit\s*card|debit\s*card|prompt\s*pay|vat|tax(?:\s*id)?|service(?:\s*charge)?|date|time|tel(?:ephone)?|phone)(?=$|[^a-z])|^(?:ยอดรวม|ยอดสุทธิ|รวมทั้งสิ้น|รวมเป็นเงิน|ภาษี|ค่าบริการ|เซอร์วิส|ส่วนลด|เงินทอน|รับเงิน|เงินสด|ชำระ|บัตรเครดิต|โอนเงิน|วันที่|เวลา|โทร|เลขประจำตัวผู้เสียภาษี)|^รวม(?=$|[\s:฿\d])/i;
const PREFIXED_FEE = /^\d+(?:\.\d+)?\s*%\s*(?:(?:vat|tax|service(?:\s*charge)?)(?=$|[^a-z])|ภาษี|ค่าบริการ|เซอร์วิส)/i;
const CURRENCY = /^(?:฿|บาท|THB)$/i;
const PRODUCT_UNIT = /^(?:ml|cl|dl|l|mg|g|kg|oz|lbs?|pcs?|มล\.?|ลิตร|มิลลิลิตร|กรัม|กก\.?|กิโลกรัม|ชิ้น)$/i;
const TABLE_HEADER = /^(?:(?:รายการ|ชื่อสินค้า|สินค้า|จำนวน|ราคาต่อหน่วย|ราคา|description|item|qty|quantity|unit|price|amount|total)(?:\s+|$)){2,}$/i;
const NUMERIC_TEXT = /^(?:(?:฿|THB))?[+\-−(]?[0-9OoIlISB.,/:()\-−%]+(?:บาท|฿|THB)?T?$/i;

type Token = { text: string; start: number; end: number; fragmented?: boolean };
type Money = Token & { satang: number | null; integer: boolean; corrected: boolean };
type Part = { text: string; confidence: number | null; box?: ReceiptBox; order: number; origins: number[]; conflict?: boolean };
type Row = ReturnType<typeof makeRow>;

function normalizeDigits(value: string) {
  return [...value].map((character) => {
    const index = THAI_DIGITS.indexOf(character);
    return index === -1 ? character : String(index);
  }).join("");
}

export function normalizeReceiptLine(line: string) {
  return normalizeDigits(line).trim().replace(/\s+/g, " ");
}

function knownConfidence(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value : null;
}

function validBox(box: ReceiptBox | undefined): box is ReceiptBox {
  return !!box && [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) &&
    box.x1 > box.x0 && box.y1 > box.y0;
}

function unionBoxes(boxes: ReceiptBox[]): ReceiptBox | undefined {
  if (!boxes.length) return undefined;
  return boxes.reduce((a, b) => ({
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
  }));
}

function minimumConfidence(parts: readonly { confidence: number | null }[]) {
  return !parts.length || parts.some((part) => part.confidence === null)
    ? null : Math.min(...parts.map((part) => part.confidence!));
}

function makeRow(parts: Part[], wrapped = false, ambiguousColumns = false) {
  let text = "";
  const spans = parts.map((part, index) => {
    const normalized = normalizeReceiptLine(part.text);
    const previous = parts[index - 1];
    const closeThai = previous?.box && part.box && /\p{Script=Thai}$/u.test(previous.text) && /^\p{Script=Thai}/u.test(normalized) &&
      yOverlap(previous.box, part.box) >= 0.5 && part.box.x0 - previous.box.x1 <= Math.min(previous.box.y1 - previous.box.y0, part.box.y1 - part.box.y0) * 0.4;
    const separator = text && !closeThai ? " " : "";
    const start = text.length + separator.length;
    text += separator + normalized;
    return { ...part, start, end: text.length };
  });
  return {
    parts, spans, text, wrapped, ambiguousColumns,
    rawLine: parts.map((part) => part.text.trim().replace(/\s+/g, " ")).join(" "),
    box: unionBoxes(parts.flatMap((part) => part.box ? [part.box] : [])),
    order: Math.min(...parts.map((part) => part.order)),
  };
}

function yOverlap(a: ReceiptBox, b: ReceiptBox) {
  return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) /
    Math.min(a.y1 - a.y0, b.y1 - b.y0);
}

function samePosition(a: ReceiptBox, b: ReceiptBox) {
  const intersection = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const area = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0);
  return intersection / (area - intersection) >= 0.65;
}

function splitColumns(parts: Part[]) {
  const columns: Part[][] = [[]];
  let ambiguousColumns = false;
  for (const part of parts) {
    const column = columns.at(-1)!;
    const previousBox = column.at(-1)?.box;
    const columnGap = part.box && previousBox &&
      part.box.x0 - previousBox.x1 > (part.box.y1 - part.box.y0) * 2;
    // Require a physical gap so names like "water 500 ml" stay intact.
    if (columnGap &&
      /[\p{L}\p{M}]/u.test(part.text) && !isNumericText(normalizeReceiptLine(part.text)) &&
      !CURRENCY.test(part.text) && !PRODUCT_UNIT.test(part.text) && !/^T$/i.test(part.text)) {
      const parsed = parseProduct(makeRow(column).text);
      if (parsed.price && parsed.nameTokens.length) {
        // A gap within one OCR line may just be a spaced-out description.
        // Only separate columns with corroborating OCR line boundaries.
        if (!column.some((previous) => previous.origins.some((origin) => part.origins.includes(origin)))) {
          columns.push([part]);
          continue;
        }
        ambiguousColumns = true;
      }
    }
    column.push(part);
  }
  return columns.map((column) => makeRow(column, false, ambiguousColumns));
}

function groupRows(lines: readonly ReceiptOcrLine[]): Row[] {
  const positioned: (Part & { box: ReceiptBox })[] = [];
  const plain: Row[] = [];
  lines.forEach((line, order) => {
    const parts: Part[] = line.words?.length ? line.words.map((word) => ({
      text: word.text, confidence: knownConfidence(word.confidence),
      box: validBox(word.bbox) ? word.bbox : undefined, order, origins: [order],
    })) : [{ text: line.text, confidence: knownConfidence(line.confidence),
      box: validBox(line.bbox) ? line.bbox : undefined, order, origins: [order] }];
    const nonempty = parts.filter((part) => part.text.trim());
    if (!nonempty.length) return;
    if (nonempty.every((part): part is Part & { box: ReceiptBox } => !!part.box)) positioned.push(...nonempty);
    else plain.push(makeRow(nonempty));
  });
  positioned.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
  const groups: { anchor: ReceiptBox; parts: (Part & { box: ReceiptBox })[] }[] = [];
  let active: typeof groups = [];
  for (const part of positioned) {
    active = active.filter((group) => group.anchor.y1 > part.box.y0);
    const group = active.find((group) => yOverlap(group.anchor, part.box) >= 0.5);
    if (!group) {
      const created = { anchor: part.box, parts: [part] };
      groups.push(created);
      active.push(created);
      continue;
    }
    const duplicateIndex = group.parts.findIndex((other) => samePosition(other.box, part.box));
    if (duplicateIndex < 0) group.parts.push(part);
    else {
      const previous = group.parts[duplicateIndex];
      const conflict = previous.conflict || normalizeReceiptLine(previous.text) !== normalizeReceiptLine(part.text);
      const preferred = (part.confidence ?? -1) > (previous.confidence ?? -1) ? part : previous;
      group.parts[duplicateIndex] = { ...preferred, conflict, origins: [...new Set([...previous.origins, ...part.origins])] };
    }
  }
  const geometric = groups.flatMap((group) => splitColumns(group.parts.sort((a, b) => a.box.x0 - b.box.x0)));
  geometric.sort((a, b) => a.box!.y0 - b.box!.y0 || a.box!.x0 - b.box!.x0);
  // Unpositioned lines retain input order; they must never be deduplicated by text.
  const rows = plain.length && geometric.length
    ? [...geometric, ...plain].sort((a, b) => a.order - b.order)
    : [...geometric, ...plain];
  const wrapped: Row[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const next = rows[index + 1];
    if (row.box && next?.box && !isNonItem(row.text) && !isNonItem(next.text) &&
      next.box.y0 >= row.box.y1 && next.box.y0 - row.box.y1 <= (row.box.y1 - row.box.y0) * 0.5 &&
      next.box.x0 > row.box.x0 + 2 && next.box.x0 - row.box.x0 <= (row.box.y1 - row.box.y0) * 2) {
      const currentProduct = parseProduct(row.text);
      const nextProduct = parseProduct(next.text);
      if (!currentProduct.price && !/\d/.test(row.text) && nextProduct.price && nextProduct.nameTokens.length) {
        wrapped.push(makeRow([...row.parts, ...next.parts], true, row.ambiguousColumns || next.ambiguousColumns));
        index++;
        continue;
      }
      if (currentProduct.price && currentProduct.nameTokens.length && !/\d/.test(next.text)) {
        const nameParts = spansFor(row, currentProduct.nameTokens);
        const amountParts = row.parts.filter((part) => !nameParts.some((name) => name.order === part.order && name.box === part.box));
        // A whole-line fallback cannot separate name and amount reliably.
        if (amountParts.length) {
          wrapped.push(makeRow([...nameParts, ...next.parts, ...amountParts], true, row.ambiguousColumns || next.ambiguousColumns));
          index++;
          continue;
        }
      }
    }
    wrapped.push(row);
  }
  return wrapped;
}

function spansFor(row: Row, tokens: Token[]) {
  return row.spans.filter((span) => tokens.some((token) => span.start < token.end && span.end > token.start));
}

function confidenceReason(label: string, confidence: number | null, reasons: string[]) {
  if (confidence === null) reasons.push(`ไม่ทราบความมั่นใจของ${label} กรุณาตรวจสอบ`);
  else if (confidence < MIN_CONFIDENCE) reasons.push(`ความมั่นใจของ${label}ต่ำ กรุณาตรวจสอบ`);
}

function isNonItem(text: string) {
  return SUBTOTAL.test(text) || NON_ITEM.test(text) || PREFIXED_FEE.test(text) || TABLE_HEADER.test(text) ||
    /^(?:\d{1,2}([/.-])\d{1,2}\1\d{2,4}|\d{4}([/-])\d{1,2}\2\d{1,2})(?:\s|$)/.test(text) ||
    /^(?:\+66|0)[\d -]{8,12}$/.test(text) || /^\d{13}$/.test(text);
}

function isNumericText(text: string) {
  return NUMERIC_TEXT.test(text) && /\d/.test(text);
}

function tokenize(text: string): Token[] {
  const tokens = [...text.matchAll(/\S+/g)].flatMap((match) => {
    const start = match.index!;
    // OCR sometimes glues the product name directly to its price (tea70.00).
    const glued = !isNumericText(match[0]) && match[0].match(/^([\p{L}\p{M}]+)([+\-−]?\d.*)$/u);
    if (!glued) return [{ text: match[0], start, end: start + match[0].length }];
    return [
      { text: glued[1], start, end: start + glued[1].length },
      { text: glued[2], start: start + glued[1].length, end: start + match[0].length },
    ];
  });
  const signed = tokens.reduce<Token[]>((result, token) => {
    const previous = result.at(-1);
    if (previous && /^[+\-−]$/.test(previous.text) && isNumericText(token.text)) {
      result[result.length - 1] = { text: previous.text + token.text, start: previous.start, end: token.end };
    } else result.push(token);
    return result;
  }, []);
  const whole = /^(?:฿|THB)?[+\-−]?(?:\d{1,6}|\d{1,3}(?:,\d{3})+)$/i;
  return signed.reduce<Token[]>((result, token) => {
    const previous = result.at(-1);
    const before = result.at(-2);
    if (/^\d{1,2}$/.test(token.text) && previous?.text === "." && before && whole.test(before.text)) {
      result.splice(-2, 2, { text: before.text + "." + token.text, start: before.start, end: token.end, fragmented: true });
    } else if (previous && previous.text.endsWith(".") && whole.test(previous.text.slice(0, -1)) && /^\d{1,2}$/.test(token.text)) {
      result[result.length - 1] = { text: previous.text + token.text, start: previous.start, end: token.end, fragmented: true };
    } else if (previous && whole.test(previous.text) && /^\.\d{1,2}$/.test(token.text)) {
      result[result.length - 1] = { text: previous.text + token.text, start: previous.start, end: token.end, fragmented: true };
    } else result.push(token);
    return result;
  }, []);
}

function parseMoney(token: Token): Money {
  let value = token.text.replace(/^(?:฿|THB)/i, "").replace(/T$/i, "")
    .replace(/(?:บาท|฿|THB)$/i, "");
  let corrected = false;
  // Letter substitutions need a decimal price context and at least one real digit.
  if (/\d/.test(value) && /^[0-9OoIlISB,]+\.[0-9OoIlISB]{1,2}$/.test(value)) {
    const replacement = value.replace(/[Oo]/g, "0").replace(/[Il]/g, "1")
      .replace(/S/g, "5").replace(/B/g, "8");
    corrected = replacement !== value;
    value = replacement;
  }
  let satang: number | null = null;
  if (/^(?:\d{1,6}|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) {
    const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (Number.isSafeInteger(amount)) satang = amount;
  }
  return { ...token, satang, integer: /^\d+$/.test(value), corrected };
}

function parseProduct(text: string) {
  const tokens = tokenize(text);
  let end = tokens.length;
  while (end && (CURRENCY.test(tokens[end - 1].text) || /^T$/i.test(tokens[end - 1].text))) end--;
  const suffixEnd = end;
  while (end && (isNumericText(tokens[end - 1].text) || CURRENCY.test(tokens[end - 1].text) ||
    /^[x×*@]$/i.test(tokens[end - 1].text))) end--;
  const numbers = tokens.slice(end, suffixEnd).filter((token) => isNumericText(token.text)).map(parseMoney);
  const nameTokens = tokens.slice(0, end);
  // A leading quantity is usable only alongside printed unit and line amounts.
  if (numbers.length >= 2 && nameTokens.length > 1 && /^\d{1,3}$/.test(nameTokens[0].text)) {
    numbers.unshift(parseMoney(nameTokens.shift()!));
  }
  const reasons: string[] = [];
  let price = numbers.at(-1);
  if (numbers.length === 2 && numbers[1].integer &&
    (!numbers[0].integer || /฿|THB|บาท/i.test(numbers[0].text))) price = numbers[0];
  if (numbers.some((number) => number.satang === null)) {
    if (price) price = { ...price, satang: null };
    reasons.push("รูปแบบราคาไม่ถูกต้อง กรุณาตรวจสอบตัวเลข");
  } else if (numbers.length > 1) {
    const [a, b, total] = numbers;
    const agrees = numbers.length === 3 && total.satang !== null && (
      (a.integer && a.satang! / 100 * b.satang! === total.satang) ||
      (b.integer && b.satang! / 100 * a.satang! === total.satang)
    );
    if (!agrees) reasons.push("จำนวน ราคาต่อหน่วย และยอดรายการยังไม่ชัดเจน");
  }
  if (numbers.some((number) => number.corrected)) reasons.push("มีการแก้ตัวอักษร OCR เป็นตัวเลขราคา กรุณาตรวจสอบ");
  if (numbers.some((number) => number.fragmented)) reasons.push("OCR แยกจุดทศนิยมเป็นหลายคำ กรุณาตรวจสอบราคา");
  if (tokens.some((token, index) => token.text === "." &&
    (isNumericText(tokens[index - 1]?.text ?? "") || isNumericText(tokens[index + 1]?.text ?? "")))) {
    if (price) price = { ...price, satang: null };
    reasons.push("จุดทศนิยมไม่ชัดเจน กรุณาตรวจสอบราคา");
  }
  if (!price || price.satang === null || price.satang <= 0) reasons.push("ไม่พบราคาสินค้าที่ใช้ได้");
  const name = nameTokens.map((token) => token.text).join(" ");
  if (!/[\p{L}\p{M}]/u.test(name)) reasons.push("ไม่พบชื่อสินค้า");
  return { name: name || text, price, reasons, nameTokens, numbers };
}

export function analyzeReceiptLines(lines: readonly ReceiptOcrLine[]): {
  items: ReceiptOcrItem[]; ignoredLines: string[]; subtotalSatang: number | null;
} {
  const items: ReceiptOcrItem[] = [];
  const ignoredLines: string[] = [];
  const subtotals: (number | null)[] = [];
  for (const row of groupRows(lines)) {
    const { text, rawLine } = row;
    if (!text) continue;
    if (isNonItem(text)) {
      ignoredLines.push(rawLine);
      const label = text.match(SUBTOTAL);
      if (label) {
        const amount = parseProduct(text.slice(label[0].length).replace(/^\s*:\s*/, ""));
        subtotals.push(!row.parts.some((part) => part.conflict) &&
          amount.numbers.length === 1 && !amount.nameTokens.length && amount.price &&
          !amount.price.corrected ? amount.price.satang : null);
      }
      continue;
    }
    const parsed = parseProduct(text);
    const nameSpans = spansFor(row, parsed.nameTokens);
    const priceSpans = spansFor(row, parsed.price ? [parsed.price] : []);
    const confidence = minimumConfidence(row.spans);
    const priceConfidence = minimumConfidence(priceSpans);
    confidenceReason("ชื่อสินค้า", minimumConfidence(nameSpans), parsed.reasons);
    confidenceReason("ราคา", priceConfidence, parsed.reasons);
    const supportingNumbers = parsed.numbers.filter((number) => number.start !== parsed.price?.start);
    if (supportingNumbers.length) confidenceReason("จำนวนหรือราคาต่อหน่วย", minimumConfidence(spansFor(row, supportingNumbers)), parsed.reasons);
    if (row.parts.some((part) => part.conflict)) parsed.reasons.push("ผล OCR ในตำแหน่งเดียวกันไม่ตรงกัน กรุณาตรวจสอบ");
    if (row.wrapped) parsed.reasons.push("ชื่อสินค้าอาจต่อเนื่องหลายบรรทัด กรุณาตรวจสอบ");
    if (row.ambiguousColumns) parsed.reasons.push("คอลัมน์ชื่อสินค้าและราคายังไม่ชัดเจน กรุณาตรวจสอบ");
    items.push({
      id: "ocr-" + (items.length + 1), name: parsed.name,
      priceSatang: parsed.price?.satang && parsed.price.satang > 0 ? parsed.price.satang : null,
      rawLine, confidence, status: parsed.reasons.length ? "needs-review" : "ready",
      sourceBox: row.box, priceBox: unionBoxes(priceSpans.flatMap((span) => span.box ? [span.box] : [])),
      priceConfidence, reviewReasons: parsed.reasons,
    });
  }
  const firstSubtotal = subtotals[0];
  return { items, ignoredLines,
    subtotalSatang: firstSubtotal !== undefined && firstSubtotal !== null && subtotals.every((value) => value === firstSubtotal)
      ? firstSubtotal : null };
}

export function parseReceiptLines(lines: readonly ReceiptOcrLine[]): ReceiptOcrItem[] {
  return analyzeReceiptLines(lines).items;
}
