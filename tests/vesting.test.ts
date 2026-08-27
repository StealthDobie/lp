import BN from "bn.js";
import { describe, expect, it } from "vitest";

import {
  buildDailyVestingSchedule,
  scheduleTotalLiquidity,
} from "../src/vesting";

describe("daily vesting", () => {
  it("locks every liquidity unit and places only division dust at cliff", () => {
    const liquidity = new BN(1_003);
    const now = new BN(1_800_000_000);
    const schedule = buildDailyVestingSchedule(liquidity, now, 7, 10);

    expect(schedule.cliffPoint.toString()).toBe(
      now.add(new BN(300 + 7 * 86_400)).toString(),
    );
    expect(schedule.liquidityPerPeriod.toString()).toBe("100");
    expect(schedule.cliffUnlockLiquidity.toString()).toBe("3");
    expect(scheduleTotalLiquidity(schedule).eq(liquidity)).toBe(true);
  });

  it("uses Unix seconds rather than JavaScript milliseconds", () => {
    const schedule = buildDailyVestingSchedule(
      new BN(90_000),
      new BN(1_800_000_000),
      0,
      90,
    );
    expect(schedule.periodFrequency.toNumber()).toBe(86_400);
    expect(schedule.cliffPoint.toString()).toBe("1800000300");
    expect(schedule.finalReleasePoint.toString()).toBe("1807776300");
  });

  it("reserves landing time inside Meteora's ten-year limit", () => {
    expect(() =>
      buildDailyVestingSchedule(new BN(1), new BN(1), 1, 3_649),
    ).toThrow("cannot exceed 3649 days");
  });
});
