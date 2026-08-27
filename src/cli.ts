import { createInterface } from "node:readline/promises";

import "dotenv/config";

import { formatUiAmount } from "./amount";
import { parseConfig } from "./config";
import {
  DOBERMANN_MINT,
  EXPECTED_DOBERMANN_DECIMALS,
  EXPECTED_SOL_DECIMALS,
  LIQUIDITY_SLIPPAGE_BPS,
  METEORA_CP_AMM_PROGRAM,
  METEORA_POOL,
} from "./constants";
import {
  type AtomicOperation,
  type PreparedQuote,
  buildAtomicOperation,
  prepareQuote,
  simulateAtomicOperation,
  submitAtomicOperation,
} from "./meteora";
import { loadOwnerKeypair } from "./signer";
import { unixSecondsToIso } from "./vesting";

type Command = "quote" | "simulate" | "submit";

function usage(): never {
  console.error("Usage: pnpm quote | pnpm simulate | pnpm submit");
  process.exit(2);
}

function parseCommand(value: string | undefined): Command {
  if (value === "quote" || value === "simulate" || value === "submit") {
    return value;
  }
  return usage();
}

function printQuote(quote: PreparedQuote): void {
  console.log("StealthDobie vested-liquidity plan");
  console.log(`Cluster: mainnet-beta`);
  console.log(`Meteora program: ${METEORA_CP_AMM_PROGRAM.toBase58()}`);
  console.log(`Pool: ${METEORA_POOL.toBase58()}`);
  console.log(`DOBERMANN mint: ${DOBERMANN_MINT.toBase58()}`);
  console.log(
    `DOBERMANN maximum: ${formatUiAmount(quote.tokenAmount, EXPECTED_DOBERMANN_DECIMALS)}`,
  );
  console.log(
    `SOL quote: ${formatUiAmount(quote.quotedSol, EXPECTED_SOL_DECIMALS)}`,
  );
  console.log(
    `SOL authorized maximum: ${formatUiAmount(quote.maximumSol, EXPECTED_SOL_DECIMALS)} (${LIQUIDITY_SLIPPAGE_BPS} bps headroom)`,
  );
  console.log(`Vesting starts: ${unixSecondsToIso(quote.schedule.cliffPoint)}`);
  console.log(
    `Daily releases: ${quote.schedule.numberOfPeriod}; final release: ${unixSecondsToIso(quote.schedule.finalReleasePoint)}`,
  );
}

function printOperation(operation: AtomicOperation): void {
  console.log(`Owner: ${operation.owner.toBase58()}`);
  console.log(`Position: ${operation.position.toBase58()}`);
  console.log(`Position NFT mint: ${operation.positionNft.toBase58()}`);
  console.log(`Transaction signature: ${operation.signature}`);
  console.log(`Last valid block height: ${operation.lastValidBlockHeight}`);
}

function sanitizeLog(value: string): string {
  let sanitized = value;
  for (const [name, secret] of [
    ["SOLANA_RPC_URL", process.env.SOLANA_RPC_URL],
    ["OWNER_KEYPAIR_PATH", process.env.OWNER_KEYPAIR_PATH],
  ] as const) {
    if (secret?.trim()) {
      sanitized = sanitized.split(secret.trim()).join(`[${name}]`);
    }
  }
  return sanitized
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .slice(0, 1_000);
}

function confirmationPhrase(operation: AtomicOperation): string {
  const owner = operation.owner.toBase58();
  const pool = METEORA_POOL.toBase58();
  const amount = formatUiAmount(
    operation.quote.tokenAmount,
    EXPECTED_DOBERMANN_DECIMALS,
  );
  const maxSol = formatUiAmount(
    operation.quote.maximumSol,
    EXPECTED_SOL_DECIMALS,
  );
  return `SUBMIT MAINNET ${pool.slice(-6)} ${owner.slice(-6)} ${amount} DOB ${maxSol} SOL ${operation.quote.config.vestingDays} DAYS`;
}

async function confirmMainnet(operation: AtomicOperation): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Submit requires an interactive terminal");
  }
  const phrase = confirmationPhrase(operation);
  console.log("\nThis will atomically deposit and vest liquidity on mainnet-beta.");
  console.log(`Type exactly: ${phrase}`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("> ");
  prompt.close();
  if (answer !== phrase) {
    throw new Error("Confirmation phrase did not match; nothing was submitted");
  }
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const config = parseConfig(process.env, command !== "quote");

  const quote = await prepareQuote(config);
  printQuote(quote);

  if (command === "quote") {
    console.log("\nRead-only quote complete. No signer was loaded.");
    return;
  }

  if (!config.ownerKeypairPath || !config.expectedOwner) {
    throw new Error("Signing configuration was not loaded");
  }
  const owner = await loadOwnerKeypair(
    config.ownerKeypairPath,
    config.expectedOwner,
  );
  const operation = await buildAtomicOperation(quote, owner);
  printOperation(operation);

  const simulation = await simulateAtomicOperation(operation);
  if (simulation.err) {
    const logs = (simulation.logs ?? []).slice(-20).map(sanitizeLog).join("\n");
    throw new Error(
      `Simulation failed: ${JSON.stringify(simulation.err)}${logs ? `\n${logs}` : ""}`,
    );
  }
  console.log(
    `Simulation succeeded; compute units consumed: ${simulation.unitsConsumed ?? "unavailable"}`,
  );

  if (command === "simulate") {
    console.log("No transaction was submitted.");
    return;
  }

  await confirmMainnet(operation);
  const receipt = await submitAtomicOperation(operation);
  console.log("Finalized and verified:");
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(sanitizeLog(message));
  process.exitCode = 1;
});
