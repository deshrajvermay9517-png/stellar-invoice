const STROOPS_PER_XLM = 10_000_000n;
const MAX_STROOPS = BigInt(Number.MAX_SAFE_INTEGER);

export function parseXlm(value: unknown): number {
  if (typeof value !== "string" || value.length > 32 ||
      !/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(value)) {
    throw new Error("Enter an XLM amount with up to 7 decimal places, without signs or exponent notation.");
  }
  const [whole, fraction = ""] = value.split(".");
  const stroops = BigInt(whole) * STROOPS_PER_XLM + BigInt(fraction.padEnd(7, "0"));
  if (stroops <= 0n || stroops > MAX_STROOPS) {
    throw new Error("Amount must be between 0.0000001 and 900719925.4740991 XLM.");
  }
  // Conversion happens only after exact integer arithmetic and a safe-range check.
  return Number(stroops);
}

export function formatXlm(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid stored amount.");
  const stroops = BigInt(value);
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = (stroops % STROOPS_PER_XLM).toString().padStart(7, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction}`;
}
