import { describe, expect, it } from "vitest";

import { parseConfig } from "../src/config";

const baseEnv: NodeJS.ProcessEnv = {
  SOLANA_RPC_URL: "https://rpc.example.test",
  DOBERMANN_AMOUNT: "3000000",
  VESTING_DAYS: "90",
};

describe("configuration", () => {
  it("keeps quote configuration minimal", () => {
    const config = parseConfig(baseEnv, false);
    expect(config.vestingCliffDays).toBe(0);
    expect(config.liquiditySlippageBps).toBe(50);
    expect(config.ownerKeypairPath).toBeNull();
  });

  it("requires owner safeguards before signing", () => {
    expect(() => parseConfig(baseEnv, true)).toThrow(
      "OWNER_KEYPAIR_PATH and EXPECTED_OWNER",
    );
  });

  it("rejects an excessive schedule", () => {
    expect(() =>
      parseConfig(
        {
          ...baseEnv,
          VESTING_DAYS: "3600",
          VESTING_CLIFF_DAYS: "100",
        },
        false,
      ),
    ).toThrow("cannot exceed 3649");
  });

  it("rejects loose liquidity slippage", () => {
    expect(() =>
      parseConfig(
        { ...baseEnv, LIQUIDITY_SLIPPAGE_BPS: "501" },
        false,
      ),
    ).toThrow("0 through 500");
  });
});
