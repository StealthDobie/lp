import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export function loadOwnerKeypair(
  env: NodeJS.ProcessEnv,
  expectedOwner: PublicKey,
): Keypair {
  const encoded = env.SOURCE_PRIVATE_KEY_BASE58?.trim();
  delete env.SOURCE_PRIVATE_KEY_BASE58;
  if (!encoded) {
    throw new Error(
      "SOURCE_PRIVATE_KEY_BASE58 is required for simulate/submit",
    );
  }

  let secretKey: Uint8Array;
  try {
    secretKey = bs58.decode(encoded);
  } catch {
    throw new Error("SOURCE_PRIVATE_KEY_BASE58 is not valid base58");
  }
  if (secretKey.length !== 64) {
    throw new Error(
      `SOURCE_PRIVATE_KEY_BASE58 decoded to ${secretKey.length} bytes; expected 64`,
    );
  }

  const keypair = Keypair.fromSecretKey(secretKey);
  if (!keypair.publicKey.equals(expectedOwner)) {
    throw new Error(
      `Signer mismatch: keypair is ${keypair.publicKey.toBase58()}, expected ${expectedOwner.toBase58()}`,
    );
  }
  return keypair;
}
