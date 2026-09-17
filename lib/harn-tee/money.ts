import type {
  CalculationInput,
  CalculationResult,
  ParticipantCalculation,
} from "./types";

function roundUpSatang(value: number) {
  if (value <= 0) return 0;
  return Math.ceil(value - Number.EPSILON);
}

function roundCurrency(satang: number) {
  return Math.round(satang);
}

function feeFromPercent(satang: number, percent: number) {
  const basisPoints = Math.round(percent * 100);
  return roundCurrency((satang * basisPoints) / 10_000);
}

function allocateFeeAcrossItems(
  totalFeeSatang: number,
  items: CalculationInput["items"],
  weights: Map<string, number>,
) {
  const allocation = new Map<string, number>();
  const totalWeightSatang = items.reduce(
    (sum, item) => sum + (weights.get(item.id) ?? 0),
    0,
  );
  if (totalWeightSatang === 0) {
    for (const item of items) allocation.set(item.id, 0);
    return allocation;
  }
  let allocated = 0;
  const orderedItems = [...items].sort((a, b) => a.order - b.order);

  orderedItems.forEach((item, index) => {
    const amount =
      index === orderedItems.length - 1
        ? totalFeeSatang - allocated
        : Math.floor(
            (totalFeeSatang * (weights.get(item.id) ?? 0)) / totalWeightSatang,
          );
    allocation.set(item.id, amount);
    allocated += amount;
  });

  return allocation;
}

export function calculateBill(input: CalculationInput): CalculationResult {
  const feeMode = input.feeMode ?? "bill";
  const calculationMode = input.calculationMode ?? "vat-after-service";
  const vatIncludesServiceCharge = calculationMode === "vat-after-service";
  const subtotalSatang = input.items.reduce(
    (sum, item) => sum + item.priceSatang,
    0,
  );
  const serviceChargeSatang =
    feeMode === "item"
      ? input.items.reduce(
          (sum, item) =>
            sum + feeFromPercent(item.priceSatang, item.serviceChargePercent ?? 0),
          0,
      )
      : feeFromPercent(subtotalSatang, input.serviceChargePercent);
  const itemServiceCharges =
    feeMode === "item"
      ? new Map(
          input.items.map((item) => [
            item.id,
            feeFromPercent(item.priceSatang, item.serviceChargePercent ?? 0),
          ]),
        )
      : allocateFeeAcrossItems(
          serviceChargeSatang,
          input.items,
          new Map(input.items.map((item) => [item.id, item.priceSatang])),
        );
  const vatSatang =
    feeMode === "item"
      ? input.items.reduce(
          (sum, item) =>
            sum +
            feeFromPercent(
              item.priceSatang +
                (vatIncludesServiceCharge
                  ? (itemServiceCharges.get(item.id) ?? 0)
                  : 0),
              item.vatPercent ?? 0,
            ),
          0,
        )
      : feeFromPercent(
          subtotalSatang + (vatIncludesServiceCharge ? serviceChargeSatang : 0),
          input.vatPercent,
        );
  const itemVatCharges =
    feeMode === "item"
      ? new Map(
          input.items.map((item) => [
            item.id,
            feeFromPercent(
              item.priceSatang +
                (vatIncludesServiceCharge
                  ? (itemServiceCharges.get(item.id) ?? 0)
                  : 0),
              item.vatPercent ?? 0,
            ),
          ]),
        )
      : allocateFeeAcrossItems(
          vatSatang,
          input.items,
          new Map(
            input.items.map((item) => [
              item.id,
              item.priceSatang +
                (vatIncludesServiceCharge
                  ? (itemServiceCharges.get(item.id) ?? 0)
                  : 0),
            ]),
          ),
        );

  const rawSubtotals = new Map<string, number>();
  const rawTotals = new Map<string, number>();
  const lineItems = new Map<string, ParticipantCalculation["lineItems"]>();

  for (const participant of input.participants) {
    rawSubtotals.set(participant.id, 0);
    rawTotals.set(participant.id, 0);
    lineItems.set(participant.id, []);
  }

  for (const item of [...input.items].sort((a, b) => a.order - b.order)) {
    const payers = item.payerIds
      .map((id) => input.participants.find((person) => person.id === id))
      .filter((person): person is (typeof input.participants)[number] =>
        Boolean(person),
      )
      .sort((a, b) => a.order - b.order);
    if (payers.length === 0) continue;

    const rawShare = item.priceSatang / payers.length;
    const itemServiceCharge = itemServiceCharges.get(item.id) ?? 0;
    const itemVat = itemVatCharges.get(item.id) ?? 0;
    for (const payer of payers) {
      const amountSatang = roundUpSatang(rawShare);
      const serviceChargeShare = roundUpSatang(itemServiceCharge / payers.length);
      const vatShare = roundUpSatang(itemVat / payers.length);
      rawSubtotals.set(
        payer.id,
        (rawSubtotals.get(payer.id) ?? 0) + rawShare,
      );
      rawTotals.set(
        payer.id,
        (rawTotals.get(payer.id) ?? 0) +
          rawShare +
          itemServiceCharge / payers.length +
          itemVat / payers.length,
      );
      lineItems.get(payer.id)?.push({
        itemId: item.id,
        name: item.name,
        amountSatang,
        serviceChargeSatang: serviceChargeShare,
        vatSatang: vatShare,
        totalSatang: amountSatang + serviceChargeShare + vatShare,
      });
    }
  }

  const participants: ParticipantCalculation[] = input.participants
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((participant) => {
      const rawSubtotal = rawSubtotals.get(participant.id) ?? 0;
      const itemSubtotalSatang = (lineItems.get(participant.id) ?? []).reduce(
        (sum, item) => sum + item.amountSatang,
        0,
      );
      const participantServiceCharge = (lineItems.get(participant.id) ?? []).reduce(
        (sum, item) => sum + item.serviceChargeSatang,
        0,
      );
      const participantVat = (lineItems.get(participant.id) ?? []).reduce(
        (sum, item) => sum + item.vatSatang,
        0,
      );
      const amountDueSatang =
        itemSubtotalSatang + participantServiceCharge + participantVat;

      return {
        participantId: participant.id,
        name: participant.name,
        itemSubtotalSatang,
        serviceChargeSatang: participantServiceCharge,
        vatSatang: participantVat,
        amountDueSatang,
        lineItems: lineItems.get(participant.id) ?? [],
        roundingAdjustmentSatang:
          amountDueSatang -
          Math.round(rawTotals.get(participant.id) ?? rawSubtotal),
      };
    });

  const collectedTotalSatang = participants.reduce(
    (sum, participant) => sum + participant.amountDueSatang,
    0,
  );
  const grossTotalSatang =
    subtotalSatang + serviceChargeSatang + vatSatang;

  return {
    subtotalSatang,
    serviceChargeSatang,
    vatSatang,
    grossTotalSatang,
    collectedTotalSatang,
    roundingDifferenceSatang: collectedTotalSatang - grossTotalSatang,
    participants,
  };
}

export function formatBaht(satang: number) {
  return (satang / 100).toFixed(2);
}
