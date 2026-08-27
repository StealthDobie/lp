import { PublicKey } from "@solana/web3.js";

export const DOBERMANN_MINT = new PublicKey(
  "J3mfHoQb27xHL1xUYsoPfU1vZHbzCeK7fZYvsWeYdoge",
);

export const METEORA_POOL = new PublicKey(
  "BRfodpEwqjjecN9u2i8mV6h6dT9ANbfG5hUeX76yPtkL",
);

export const METEORA_CP_AMM_PROGRAM = new PublicKey(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
);

export const MAINNET_GENESIS_HASH =
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const EXPECTED_DOBERMANN_DECIMALS = 9;
export const EXPECTED_SOL_DECIMALS = 9;
export const SECONDS_PER_DAY = 86_400;
export const VESTING_START_BUFFER_SECONDS = 300;
export const MAX_ON_CHAIN_VESTING_DAYS = 365 * 10;
export const MAX_CONFIGURED_VESTING_DAYS = Math.floor(
  (MAX_ON_CHAIN_VESTING_DAYS * SECONDS_PER_DAY -
    VESTING_START_BUFFER_SECONDS) /
    SECONDS_PER_DAY,
);
export const MAX_TRANSACTION_BYTES = 1_232;
export const OPERATING_BUFFER_LAMPORTS = 50_000_000;
