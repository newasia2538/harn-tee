export function maskSensitiveValue(value: string): string {
  if (value.length <= 4) return "••••";
  return "••••••••" + value.slice(-4);
}
