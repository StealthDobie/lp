import { PublicKey } from "@solana/web3.js";

import { MAX_CONFIGURED_VESTING_DAYS } from "./constants";

export type AppConfig = {
  rpcUrl: string;
  expectedOwner: PublicKey | null;
  ownerKeypairPath: string | null;
  dobermannAmount: string;
  vestingDays: number;
  vestingCliffDays: number;
  liquiditySlippageBps: number;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number | null,
): number {
  const raw = env[name]?.trim();
  if (!raw) {
    if (defaultValue === null) {
      throw new Error(`Missing required environment variable ${name}`);
    }
    return defaultValue;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} is too large`);
  }
  return value;
}

export function parseConfig(
  env: NodeJS.ProcessEnv,
  requireSigner: boolean,
): AppConfig {
  const rpcUrl = required(env, "SOLANA_RPC_URL");
  let parsedRpc: URL;
  try {
    parsedRpc = new URL(rpcUrl);
  } catch {
    throw new Error("SOLANA_RPC_URL must be a valid URL");
  }
  if (parsedRpc.protocol !== "https:" && parsedRpc.hostname !== "localhost") {
    throw new Error("SOLANA_RPC_URL must use HTTPS unless it targets localhost");
  }

  const vestingDays = integer(env, "VESTING_DAYS", null);
  const vestingCliffDays = integer(env, "VESTING_CLIFF_DAYS", 0);
  const liquiditySlippageBps = integer(
    env,
    "LIQUIDITY_SLIPPAGE_BPS",
    50,
  );

  if (vestingDays < 1 || vestingDays > MAX_CONFIGURED_VESTING_DAYS) {
    throw new Error(
      `VESTING_DAYS must be from 1 through ${MAX_CONFIGURED_VESTING_DAYS}`,
    );
  }
  if (
    vestingCliffDays < 0 ||
    vestingCliffDays + vestingDays > MAX_CONFIGURED_VESTING_DAYS
  ) {
    throw new Error(
      `VESTING_CLIFF_DAYS plus VESTING_DAYS cannot exceed ${MAX_CONFIGURED_VESTING_DAYS}`,
    );
  }
  if (liquiditySlippageBps < 0 || liquiditySlippageBps > 500) {
    throw new Error("LIQUIDITY_SLIPPAGE_BPS must be from 0 through 500");
  }

  const ownerKeypairPath = env.OWNER_KEYPAIR_PATH?.trim() || null;
  const expectedOwnerText = env.EXPECTED_OWNER?.trim() || null;
  if (requireSigner && (!ownerKeypairPath || !expectedOwnerText)) {
    throw new Error(
      "OWNER_KEYPAIR_PATH and EXPECTED_OWNER are required for simulate/submit",
    );
  }

  let expectedOwner: PublicKey | null = null;
  if (expectedOwnerText) {
    try {
      expectedOwner = new PublicKey(expectedOwnerText);
    } catch {
      throw new Error("EXPECTED_OWNER must be a valid Solana public key");
    }
  }

  return {
    rpcUrl,
    expectedOwner,
    ownerKeypairPath,
    dobermannAmount: required(env, "DOBERMANN_AMOUNT"),
    vestingDays,
    vestingCliffDays,
    liquiditySlippageBps,
  };
}
