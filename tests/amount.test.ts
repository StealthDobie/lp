import BN from "bn.js";
import { describe, expect, it } from "vitest";

import { addBpsCeil, formatUiAmount, parseUiAmount } from "../src/amount";

describe("token amounts", () => {
  it("parses and formats exact decimal amounts", () => {
    const raw = parseUiAmount("3000000.123456789", 9);
    expect(raw.toString()).toBe("3000000123456789");
    expect(formatUiAmount(raw, 9)).toBe("3000000.123456789");
  });

  it.each(["0", "-1", "1e6", "1,000", " 1", "1."])(
    "rejects unsafe amount %s",
    (value) => {
      expect(() => parseUiAmount(value, 9)).toThrow();
    },
  );

  it("rejects excess precision", () => {
    expect(() => parseUiAmount("1.0000000001", 9)).toThrow(
      "more than 9 decimal places",
    );
  });

  it("rounds slippage upward", () => {
    expect(addBpsCeil(new BN(101), 50).toString()).toBe("102");
    expect(addBpsCeil(new BN(100), 0).toString()).toBe("100");
  });
});
