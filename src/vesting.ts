import BN from "bn.js";

import {
  MAX_CONFIGURED_VESTING_DAYS,
  SECONDS_PER_DAY,
  VESTING_START_BUFFER_SECONDS,
} from "./constants";

export type VestingSchedule = {
  cliffPoint: BN;
  periodFrequency: BN;
  cliffUnlockLiquidity: BN;
  liquidityPerPeriod: BN;
  numberOfPeriod: number;
  finalReleasePoint: BN;
};

export function buildDailyVestingSchedule(
  liquidity: BN,
  chainTimeSeconds: BN,
  vestingDays: number,
): VestingSchedule {
  if (liquidity.lte(new BN(0))) {
    throw new Error("Liquidity must be greater than zero");
  }
  if (
    !Number.isInteger(vestingDays) ||
    vestingDays < 1 ||
    vestingDays > MAX_CONFIGURED_VESTING_DAYS
  ) {
    throw new Error(
      `Vesting days must be from 1 through ${MAX_CONFIGURED_VESTING_DAYS}`,
    );
  }
  const numberOfPeriod = vestingDays;
  const periodFrequency = new BN(SECONDS_PER_DAY);
  // A point equal to quote time can be in the past when the transaction lands.
  const cliffPoint = chainTimeSeconds.add(
    new BN(VESTING_START_BUFFER_SECONDS),
  );
  const liquidityPerPeriod = liquidity.div(new BN(numberOfPeriod));
  if (liquidityPerPeriod.isZero()) {
    throw new Error("Liquidity is too small for the requested daily schedule");
  }

  // Meteora represents the schedule as cliff + equal releases. Put only the
  // integer-division remainder at the cliff so every liquidity unit is vested.
  const cliffUnlockLiquidity = liquidity.sub(
    liquidityPerPeriod.mul(new BN(numberOfPeriod)),
  );
  const finalReleasePoint = cliffPoint.add(
    periodFrequency.mul(new BN(numberOfPeriod)),
  );

  return {
    cliffPoint,
    periodFrequency,
    cliffUnlockLiquidity,
    liquidityPerPeriod,
    numberOfPeriod,
    finalReleasePoint,
  };
}

export function scheduleTotalLiquidity(schedule: VestingSchedule): BN {
  return schedule.cliffUnlockLiquidity.add(
    schedule.liquidityPerPeriod.mul(new BN(schedule.numberOfPeriod)),
  );
}

export function unixSecondsToIso(value: BN): string {
  return new Date(Number(value.toString(10)) * 1_000).toISOString();
}
