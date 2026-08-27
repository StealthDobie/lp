import BN from "bn.js";

const U64_MAX = (1n << 64n) - 1n;

export function parseUiAmount(value: string, decimals: number): BN {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Unsupported mint decimals: ${decimals}`);
  }

  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new Error(
      "Amount must be a positive plain decimal without commas or scientific notation",
    );
  }

  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places`);
  }

  const whole = BigInt(match[1]);
  const scale = 10n ** BigInt(decimals);
  const paddedFraction = fraction.padEnd(decimals, "0");
  const raw = whole * scale + BigInt(paddedFraction || "0");

  if (raw <= 0n) {
    throw new Error("Amount must be greater than zero");
  }
  if (raw > U64_MAX) {
    throw new Error("Amount exceeds the SPL token u64 limit");
  }

  return new BN(raw.toString());
}

export function formatUiAmount(amount: BN, decimals: number): string {
  const raw = amount.toString(10).padStart(decimals + 1, "0");
  if (decimals === 0) {
    return raw;
  }

  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

export function addBpsCeil(amount: BN, basisPoints: number): BN {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error("Basis points must be an integer from 0 through 10000");
  }

  return amount
    .mul(new BN(10_000 + basisPoints))
    .add(new BN(9_999))
    .div(new BN(10_000));
}

export function toBigInt(amount: BN): bigint {
  return BigInt(amount.toString(10));
}
