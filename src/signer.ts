import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { Keypair, PublicKey } from "@solana/web3.js";

function expandPath(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

export async function loadOwnerKeypair(
  configuredPath: string,
  expectedOwner: PublicKey,
): Promise<Keypair> {
  const path = expandPath(configuredPath);
  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new Error("OWNER_KEYPAIR_PATH must reference a regular file");
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error(
      "Owner keypair file must not be readable or writable by group/other users; use chmod 600",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("Owner keypair file must contain a Solana JSON keypair");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    !parsed.every(
      (value) =>
        Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255,
    )
  ) {
    throw new Error("Owner keypair file must contain exactly 64 byte values");
  }

  const keypair = Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
  if (!keypair.publicKey.equals(expectedOwner)) {
    throw new Error(
      `Signer mismatch: keypair is ${keypair.publicKey.toBase58()}, expected ${expectedOwner.toBase58()}`,
    );
  }
  return keypair;
}
