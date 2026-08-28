import {
  derivePositionAddress,
  derivePositionNftAccount,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import { describe, expect, it } from "vitest";

import { METEORA_POSITION, METEORA_POSITION_NFT } from "../src/constants";
import { aggregatePositionFees } from "../src/meteora";

describe("fixed vested position", () => {
  it("matches the position derived from its NFT mint", () => {
    expect(
      derivePositionAddress(METEORA_POSITION_NFT).equals(METEORA_POSITION),
    ).toBe(true);
  });

  it("derives the known Token-2022 position NFT account", () => {
    expect(derivePositionNftAccount(METEORA_POSITION_NFT).toBase58()).toBe(
      "C74oxEsLrYQJ7wWooZdwJpFydSFxcghQar2xiT54fC9R",
    );
  });

  it("aggregates fees across multiple positions", () => {
    const totals = aggregatePositionFees([
      { claimableDobermann: new BN(10), claimableSol: new BN(20) },
      { claimableDobermann: new BN(3), claimableSol: new BN(4) },
    ]);

    expect(totals.claimableDobermann.toString()).toBe("13");
    expect(totals.claimableSol.toString()).toBe("24");
  });
});
