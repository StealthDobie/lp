import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const PENDING_OPERATION_PATH = fileURLToPath(
  new URL("../.lp-operation.json", import.meta.url),
);

export type PendingOperationRecord = {
  version: 1;
  state: "approved" | "submitted";
  createdAt: string;
  submittedAt?: string;
  signature: string;
  owner: string;
  position: string;
  positionNft: string;
  positionNftAccount: string;
  blockhash: string;
  lastValidBlockHeight: number;
  serializedTransactionBase64: string;
  tokenAmount: string;
  maximumSol: string;
  liquidityDelta: string;
  schedule: {
    cliffPoint: string;
    periodFrequency: string;
    cliffUnlockLiquidity: string;
    liquidityPerPeriod: string;
    numberOfPeriod: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerString(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`Pending operation has an invalid ${label}`);
  }
  return value;
}

function publicKeyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Pending operation has an invalid ${label}`);
  }
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`Pending operation has an invalid ${label}`);
  }
}

function base58Bytes(value: unknown, length: number, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Pending operation has an invalid ${label}`);
  }
  try {
    if (bs58.decode(value).length !== length) {
      throw new Error("wrong length");
    }
  } catch {
    throw new Error(`Pending operation has an invalid ${label}`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`Pending operation has an invalid ${label}`);
  }
  return value;
}

export function parsePendingOperation(value: unknown): PendingOperationRecord {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Pending operation has an unsupported format");
  }
  if (value.state !== "approved" && value.state !== "submitted") {
    throw new Error("Pending operation has an invalid state");
  }
  if (!isRecord(value.schedule)) {
    throw new Error("Pending operation has an invalid vesting schedule");
  }
  if (
    !Number.isSafeInteger(value.lastValidBlockHeight) ||
    Number(value.lastValidBlockHeight) < 1
  ) {
    throw new Error("Pending operation has an invalid last-valid block height");
  }
  if (
    !Number.isSafeInteger(value.schedule.numberOfPeriod) ||
    Number(value.schedule.numberOfPeriod) < 1 ||
    Number(value.schedule.numberOfPeriod) > 65_535
  ) {
    throw new Error("Pending operation has an invalid number of vesting periods");
  }
  if (typeof value.serializedTransactionBase64 !== "string") {
    throw new Error("Pending operation has an invalid serialized transaction");
  }
  const serialized = Buffer.from(value.serializedTransactionBase64, "base64");
  if (
    serialized.length === 0 ||
    serialized.toString("base64") !== value.serializedTransactionBase64
  ) {
    throw new Error("Pending operation has an invalid serialized transaction");
  }

  const submittedAt =
    value.submittedAt === undefined
      ? undefined
      : isoTimestamp(value.submittedAt, "submission timestamp");
  if (value.state === "submitted" && submittedAt === undefined) {
    throw new Error("Submitted pending operation is missing its timestamp");
  }

  return {
    version: 1,
    state: value.state,
    createdAt: isoTimestamp(value.createdAt, "creation timestamp"),
    ...(submittedAt === undefined ? {} : { submittedAt }),
    signature: base58Bytes(value.signature, 64, "signature"),
    owner: publicKeyString(value.owner, "owner"),
    position: publicKeyString(value.position, "position"),
    positionNft: publicKeyString(value.positionNft, "position NFT"),
    positionNftAccount: publicKeyString(
      value.positionNftAccount,
      "position NFT account",
    ),
    blockhash: base58Bytes(value.blockhash, 32, "blockhash"),
    lastValidBlockHeight: Number(value.lastValidBlockHeight),
    serializedTransactionBase64: value.serializedTransactionBase64,
    tokenAmount: integerString(value.tokenAmount, "DOBERMANN amount"),
    maximumSol: integerString(value.maximumSol, "maximum SOL amount"),
    liquidityDelta: integerString(value.liquidityDelta, "liquidity amount"),
    schedule: {
      cliffPoint: integerString(value.schedule.cliffPoint, "cliff point"),
      periodFrequency: integerString(
        value.schedule.periodFrequency,
        "period frequency",
      ),
      cliffUnlockLiquidity: integerString(
        value.schedule.cliffUnlockLiquidity,
        "cliff liquidity",
      ),
      liquidityPerPeriod: integerString(
        value.schedule.liquidityPerPeriod,
        "per-period liquidity",
      ),
      numberOfPeriod: Number(value.schedule.numberOfPeriod),
    },
  };
}

async function writePrivateJson(value: PendingOperationRecord): Promise<void> {
  const temporaryPath = `${PENDING_OPERATION_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, PENDING_OPERATION_PATH);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function loadPendingOperation(): Promise<PendingOperationRecord | null> {
  let metadata;
  try {
    metadata = await stat(PENDING_OPERATION_PATH);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (!metadata.isFile()) {
    throw new Error(".lp-operation.json must be a regular file");
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error(".lp-operation.json must have mode 0600");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(PENDING_OPERATION_PATH, "utf8"));
  } catch {
    throw new Error(".lp-operation.json is not valid JSON");
  }
  return parsePendingOperation(parsed);
}

export async function savePendingOperation(
  record: PendingOperationRecord,
): Promise<void> {
  const validated = parsePendingOperation(record);
  const existing = await loadPendingOperation();
  if (existing && existing.signature !== validated.signature) {
    throw new Error(
      `Unresolved operation ${existing.signature} already exists; refusing to create another deposit`,
    );
  }
  await writePrivateJson(validated);
}

export async function markPendingSubmitted(signature: string): Promise<void> {
  const existing = await loadPendingOperation();
  if (!existing || existing.signature !== signature) {
    throw new Error("Pending-operation journal changed during submission");
  }
  await writePrivateJson({
    ...existing,
    state: "submitted",
    submittedAt: new Date().toISOString(),
  });
}

export async function clearPendingOperation(signature: string): Promise<void> {
  const existing = await loadPendingOperation();
  if (!existing) {
    return;
  }
  if (existing.signature !== signature) {
    throw new Error("Pending-operation journal changed during recovery");
  }
  await unlink(PENDING_OPERATION_PATH);
}
