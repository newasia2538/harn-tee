export function numberInputValue(value: number | undefined) {
  return value === undefined || value === 0 ? "" : String(value);
}
