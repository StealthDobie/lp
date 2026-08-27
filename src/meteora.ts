import {
  ActivationType,
  CP_AMM_PROGRAM_ID,
  CpAmm,
  type PoolState,
  derivePositionAddress,
  derivePositionNftAccount,
  getCurrentPoint,
  getTokenProgram,
} from "@meteora-ag/cp-amm-sdk";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type SimulatedTransactionResponse,
} from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";

import { addBpsCeil, parseUiAmount } from "./amount";
import type { AppConfig } from "./config";
import {
  DOBERMANN_MINT,
  EXPECTED_DOBERMANN_DECIMALS,
  EXPECTED_SOL_DECIMALS,
  LIQUIDITY_SLIPPAGE_BPS,
  MAINNET_GENESIS_HASH,
  MAX_TRANSACTION_BYTES,
  METEORA_CP_AMM_PROGRAM,
  METEORA_POOL,
} from "./constants";
import {
  type VestingSchedule,
  buildDailyVestingSchedule,
  scheduleTotalLiquidity,
} from "./vesting";

export type PreparedQuote = {
  connection: Connection;
  cpAmm: CpAmm;
  poolState: PoolState;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
  tokenAmount: BN;
  quotedSol: BN;
  maximumSol: BN;
  liquidityDelta: BN;
  schedule: VestingSchedule;
  config: AppConfig;
};

export type AtomicOperation = {
  quote: PreparedQuote;
  owner: PublicKey;
  positionNft: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  transaction: VersionedTransaction;
  serialized: Uint8Array;
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
};

export type VerifiedReceipt = {
  signature: string;
  position: string;
  positionNft: string;
};

function assertPublicKey(
  actual: PublicKey,
  expected: PublicKey,
  label: string,
): void {
  if (!actual.equals(expected)) {
    throw new Error(
      `${label} mismatch: received ${actual.toBase58()}, expected ${expected.toBase58()}`,
    );
  }
}

async function verifyMainnetAndPool(
  connection: Connection,
  cpAmm: CpAmm,
): Promise<PoolState> {
  const [genesisHash, poolAccount] = await Promise.all([
    connection.getGenesisHash(),
    connection.getAccountInfo(METEORA_POOL, "confirmed"),
  ]);

  if (genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error(
      `RPC is not Solana mainnet-beta; unexpected genesis hash ${genesisHash}`,
    );
  }
  if (!CP_AMM_PROGRAM_ID.equals(METEORA_CP_AMM_PROGRAM)) {
    throw new Error("Installed Meteora SDK uses an unexpected program address");
  }
  if (!poolAccount) {
    throw new Error("Configured Meteora pool account does not exist");
  }
  assertPublicKey(poolAccount.owner, METEORA_CP_AMM_PROGRAM, "Pool program");

  const poolState = await cpAmm.fetchPoolState(METEORA_POOL);
  assertPublicKey(poolState.tokenAMint, DOBERMANN_MINT, "Pool token A mint");
  assertPublicKey(poolState.tokenBMint, NATIVE_MINT, "Pool token B mint");
  if (poolState.activationType !== ActivationType.Timestamp) {
    throw new Error("DOBERMANN pool unexpectedly uses slot-based scheduling");
  }
  return poolState;
}

export async function prepareQuote(config: AppConfig): Promise<PreparedQuote> {
  const connection = new Connection(config.rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
  const cpAmm = new CpAmm(connection);
  const poolState = await verifyMainnetAndPool(connection, cpAmm);
  const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
  const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

  const [tokenAAccountInfo, tokenBAccountInfo, epochInfo, chainTime] =
    await Promise.all([
      connection.getAccountInfo(poolState.tokenAMint, "confirmed"),
      connection.getAccountInfo(poolState.tokenBMint, "confirmed"),
      connection.getEpochInfo("confirmed"),
      getCurrentPoint(connection, ActivationType.Timestamp),
    ]);
  if (!tokenAAccountInfo || !tokenBAccountInfo) {
    throw new Error("Pool mint account is missing");
  }
  assertPublicKey(tokenAAccountInfo.owner, tokenAProgram, "Token A program");
  assertPublicKey(tokenBAccountInfo.owner, tokenBProgram, "Token B program");

  const [tokenAMint, tokenBMint, tokenAVault, tokenBVault] = await Promise.all([
    getMint(connection, poolState.tokenAMint, "confirmed", tokenAProgram),
    getMint(connection, poolState.tokenBMint, "confirmed", tokenBProgram),
    getAccount(connection, poolState.tokenAVault, "confirmed", tokenAProgram),
    getAccount(connection, poolState.tokenBVault, "confirmed", tokenBProgram),
  ]);
  assertPublicKey(tokenAVault.mint, DOBERMANN_MINT, "Token A vault mint");
  assertPublicKey(tokenBVault.mint, NATIVE_MINT, "Token B vault mint");
  if (tokenAMint.decimals !== EXPECTED_DOBERMANN_DECIMALS) {
    throw new Error(
      `DOBERMANN decimals changed from ${EXPECTED_DOBERMANN_DECIMALS} to ${tokenAMint.decimals}`,
    );
  }
  if (tokenBMint.decimals !== EXPECTED_SOL_DECIMALS) {
    throw new Error(
      `Wrapped SOL decimals changed from ${EXPECTED_SOL_DECIMALS} to ${tokenBMint.decimals}`,
    );
  }

  const tokenAmount = parseUiAmount(config.dobermannAmount, tokenAMint.decimals);
  const inputTokenInfo = tokenAProgram.equals(TOKEN_2022_PROGRAM_ID)
    ? { mint: tokenAMint, currentEpoch: epochInfo.epoch }
    : undefined;

  const depositQuote = cpAmm.getDepositQuote({
    inAmount: tokenAmount,
    isTokenA: true,
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
    sqrtPrice: poolState.sqrtPrice,
    inputTokenInfo,
    collectFeeMode: poolState.collectFeeMode,
    tokenAAmount: poolState.tokenAAmount,
    tokenBAmount: poolState.tokenBAmount,
    liquidity: poolState.liquidity,
  });
  const maximumSol = addBpsCeil(
    depositQuote.outputAmount,
    LIQUIDITY_SLIPPAGE_BPS,
  );
  const schedule = buildDailyVestingSchedule(
    depositQuote.liquidityDelta,
    chainTime,
    config.vestingDays,
  );
  if (!scheduleTotalLiquidity(schedule).eq(depositQuote.liquidityDelta)) {
    throw new Error("Vesting schedule does not cover the full quoted liquidity");
  }

  return {
    connection,
    cpAmm,
    poolState,
    tokenAProgram,
    tokenBProgram,
    tokenAmount: depositQuote.consumedInputAmount,
    quotedSol: depositQuote.outputAmount,
    maximumSol,
    liquidityDelta: depositQuote.liquidityDelta,
    schedule,
    config,
  };
}

export async function buildAtomicOperation(
  quote: PreparedQuote,
  ownerSigner: Keypair,
): Promise<AtomicOperation> {
  const positionNftSigner = Keypair.generate();
  const position = derivePositionAddress(positionNftSigner.publicKey);
  const positionNftAccount = derivePositionNftAccount(
    positionNftSigner.publicKey,
  );

  const createAndAdd = await quote.cpAmm.createPositionAndAddLiquidity({
    owner: ownerSigner.publicKey,
    pool: METEORA_POOL,
    positionNft: positionNftSigner.publicKey,
    liquidityDelta: quote.liquidityDelta,
    maxAmountTokenA: quote.tokenAmount,
    maxAmountTokenB: quote.maximumSol,
    tokenAAmountThreshold: quote.tokenAmount,
    tokenBAmountThreshold: quote.maximumSol,
    tokenAMint: quote.poolState.tokenAMint,
    tokenBMint: quote.poolState.tokenBMint,
    tokenAProgram: quote.tokenAProgram,
    tokenBProgram: quote.tokenBProgram,
  });

  const lock = await quote.cpAmm.lockPosition({
    owner: ownerSigner.publicKey,
    payer: ownerSigner.publicKey,
    pool: METEORA_POOL,
    position,
    positionNftAccount,
    cliffPoint: quote.schedule.cliffPoint,
    periodFrequency: quote.schedule.periodFrequency,
    cliffUnlockLiquidity: quote.schedule.cliffUnlockLiquidity,
    liquidityPerPeriod: quote.schedule.liquidityPerPeriod,
    numberOfPeriod: quote.schedule.numberOfPeriod,
    innerPosition: true,
  });

  const instructions = [
    ...createAndAdd.instructions,
    ...lock.instructions,
  ];
  const { blockhash, lastValidBlockHeight } =
    await quote.connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: ownerSigner.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([ownerSigner, positionNftSigner]);
  const serialized = transaction.serialize();
  if (serialized.length > MAX_TRANSACTION_BYTES) {
    throw new Error(
      `Atomic transaction is ${serialized.length} bytes, exceeding Solana's ${MAX_TRANSACTION_BYTES}-byte limit; refusing to split the deposit and vesting operations`,
    );
  }
  const signatureBytes = transaction.signatures[0];
  if (!signatureBytes || signatureBytes.every((value) => value === 0)) {
    throw new Error("Signed transaction is missing its owner signature");
  }
  const signature = bs58.encode(signatureBytes);

  return {
    quote,
    owner: ownerSigner.publicKey,
    positionNft: positionNftSigner.publicKey,
    position,
    positionNftAccount,
    transaction,
    serialized,
    signature,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function simulateAtomicOperation(
  operation: AtomicOperation,
): Promise<SimulatedTransactionResponse> {
  const response = await operation.quote.connection.simulateTransaction(
    operation.transaction,
    {
      commitment: "confirmed",
      sigVerify: true,
      replaceRecentBlockhash: false,
    },
  );
  return response.value;
}

async function verifyFinalizedOperation(
  operation: AtomicOperation,
): Promise<VerifiedReceipt> {
  const { connection, cpAmm, liquidityDelta, schedule } = operation.quote;
  const [positionState, positionNftAccount, externalVestings] =
    await Promise.all([
      cpAmm.fetchPositionState(operation.position),
      getAccount(
        connection,
        operation.positionNftAccount,
        "finalized",
        TOKEN_2022_PROGRAM_ID,
      ),
      cpAmm.getAllVestingsByPosition(operation.position),
    ]);

  assertPublicKey(positionState.pool, METEORA_POOL, "Position pool");
  assertPublicKey(
    positionState.nftMint,
    operation.positionNft,
    "Position NFT mint",
  );
  assertPublicKey(positionNftAccount.owner, operation.owner, "Position NFT owner");
  assertPublicKey(
    positionNftAccount.mint,
    operation.positionNft,
    "Position NFT account mint",
  );
  if (positionNftAccount.amount !== 1n) {
    throw new Error("Position NFT account does not hold exactly one token");
  }
  if (positionNftAccount.delegate !== null) {
    throw new Error("Postcondition failed: position NFT has a delegate");
  }
  if (!positionState.unlockedLiquidity.isZero()) {
    throw new Error("Postcondition failed: position has unlocked liquidity");
  }
  if (!positionState.vestedLiquidity.eq(liquidityDelta)) {
    throw new Error("Postcondition failed: vested liquidity differs from quote");
  }
  if (!positionState.permanentLockedLiquidity.isZero()) {
    throw new Error("Postcondition failed: liquidity was permanently locked");
  }
  if (externalVestings.length !== 0) {
    throw new Error("Postcondition failed: unexpected external vesting account");
  }

  const inner = positionState.innerVesting;
  if (
    !inner.cliffPoint.eq(schedule.cliffPoint) ||
    !inner.periodFrequency.eq(schedule.periodFrequency) ||
    !inner.cliffUnlockLiquidity.eq(schedule.cliffUnlockLiquidity) ||
    !inner.liquidityPerPeriod.eq(schedule.liquidityPerPeriod) ||
    inner.numberOfPeriod !== schedule.numberOfPeriod
  ) {
    throw new Error("Postcondition failed: inner vesting schedule mismatch");
  }

  return {
    signature: operation.signature,
    position: operation.position.toBase58(),
    positionNft: operation.positionNft.toBase58(),
  };
}

export async function submitAtomicOperation(
  operation: AtomicOperation,
): Promise<VerifiedReceipt> {
  const currentBlockHeight = await operation.quote.connection.getBlockHeight(
    "confirmed",
  );
  if (currentBlockHeight > operation.lastValidBlockHeight) {
    throw new Error("Simulated transaction blockhash expired; rerun submit");
  }

  let confirmation;
  try {
    const returnedSignature =
      await operation.quote.connection.sendRawTransaction(
        operation.serialized,
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        },
      );
    if (returnedSignature !== operation.signature) {
      throw new Error("RPC returned an unexpected transaction signature");
    }
    confirmation = await operation.quote.connection.confirmTransaction(
      {
        signature: operation.signature,
        blockhash: operation.blockhash,
        lastValidBlockHeight: operation.lastValidBlockHeight,
      },
      "finalized",
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Submission outcome for ${operation.signature} is unknown. Do not run submit again until mainnet block height is above ${operation.lastValidBlockHeight} and the signature is still absent or failed at https://solscan.io/tx/${operation.signature}. Last error: ${message}`,
    );
  }
  if (confirmation.value.err) {
    throw new Error(
      `Mainnet transaction finalized with an error and was rolled back: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  try {
    return await verifyFinalizedOperation(operation);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Transaction ${operation.signature} finalized but position verification failed. Review it on Solscan; do not submit again. Last error: ${message}`,
    );
  }
}
