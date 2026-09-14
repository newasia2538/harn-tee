import type {
  CalculationInput,
  CalculationResult,
  ParticipantCalculation,
} from "./types";

function roundUpSatang(value: number) {
  return Math.ceil(value - Number.EPSILON);
}

function roundCurrency(satang: number) {
  return Math.round(satang);
}

function feeFromPercent(satang: number, percent: number) {
  const basisPoints = Math.round(percent * 100);
  return roundCurrency((satang * basisPoints) / 10_000);
}

function proportionalFee(
  feeSatang: number,
  rawParticipantSubtotal: number,
  subtotalSatang: number,
) {
  if (subtotalSatang === 0) return 0;
  return roundUpSatang((feeSatang * rawParticipantSubtotal) / subtotalSatang);
}

export function calculateBill(input: CalculationInput): CalculationResult {
  const subtotalSatang = input.items.reduce(
    (sum, item) => sum + item.priceSatang,
    0,
  );
  const serviceChargeSatang = feeFromPercent(
    subtotalSatang,
    input.serviceChargePercent,
  );
  const vatSatang = feeFromPercent(subtotalSatang, input.vatPercent);

  const rawSubtotals = new Map<string, number>();
  const lineItems = new Map<string, ParticipantCalculation["lineItems"]>();

  for (const participant of input.participants) {
    rawSubtotals.set(participant.id, 0);
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
    for (const payer of payers) {
      rawSubtotals.set(
        payer.id,
        (rawSubtotals.get(payer.id) ?? 0) + rawShare,
      );
      lineItems.get(payer.id)?.push({
        itemId: item.id,
        name: item.name,
        amountSatang: roundUpSatang(rawShare),
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
      const participantServiceCharge = proportionalFee(
        serviceChargeSatang,
        rawSubtotal,
        subtotalSatang,
      );
      const participantVat = proportionalFee(
        vatSatang,
        rawSubtotal,
        subtotalSatang,
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
          Math.round(rawSubtotal + participantServiceCharge + participantVat),
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
