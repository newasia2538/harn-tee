export type BankOption = {
  id: string;
  name: string;
  logoUrl: string;
  color: string;
};

// The source repository provides the Thai bank SVG marks used by the picker.
// The colored code tile remains visible as a graceful fallback if an image is blocked.
export const banks: BankOption[] = [
  { id: "SCB", name: "ธนาคารไทยพาณิชย์", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/scb.svg", color: "#4e2e7f" },
  { id: "KBANK", name: "ธนาคารกสิกรไทย", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/kbank.svg", color: "#138f2d" },
  { id: "KTB", name: "ธนาคารกรุงไทย", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/ktb.svg", color: "#1ba5e1" },
  { id: "BBL", name: "ธนาคารกรุงเทพ", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/bbl.svg", color: "#1e4598" },
  { id: "BAY", name: "ธนาคารกรุงศรีอยุธยา", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/bay.svg", color: "#fec43b" },
  { id: "TTB", name: "ธนาคารทหารไทยธนชาต", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/tmb.svg", color: "#1279be" },
  { id: "GSB", name: "ธนาคารออมสิน", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/gsb.svg", color: "#eb198d" },
  { id: "UOB", name: "ธนาคารยูโอบี", logoUrl: "https://raw.githubusercontent.com/omise/banks-logo/master/th/uob.svg", color: "#0b3979" },
];

export function getBank(bankId: string) {
  return banks.find((bank) => bank.id === bankId) ?? null;
}
