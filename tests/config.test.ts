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
    expect(config.expectedOwner).toBeNull();
  });

  it("requires owner safeguards before signing", () => {
    expect(() => parseConfig(baseEnv, true)).toThrow(
      "EXPECTED_OWNER",
    );
  });

  it("rejects an excessive vesting duration", () => {
    expect(() =>
      parseConfig(
        {
          ...baseEnv,
          VESTING_DAYS: "3650",
        },
        false,
      ),
    ).toThrow("1 through 3649");
  });
});
