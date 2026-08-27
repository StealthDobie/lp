import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";

import { loadOwnerKeypair } from "../src/signer";

describe("owner signer", () => {
  it("loads base58 key material matching the expected owner", () => {
    const owner = Keypair.generate();
    const env: NodeJS.ProcessEnv = {
      SOURCE_PRIVATE_KEY_BASE58: bs58.encode(owner.secretKey),
    };

    const loaded = loadOwnerKeypair(env, owner.publicKey);

    expect(loaded.publicKey.equals(owner.publicKey)).toBe(true);
    expect(env.SOURCE_PRIVATE_KEY_BASE58).toBeUndefined();
  });

  it("rejects invalid key material without echoing it", () => {
    const env: NodeJS.ProcessEnv = {
      SOURCE_PRIVATE_KEY_BASE58: "not-base58",
    };
    expect(() =>
      loadOwnerKeypair(env, Keypair.generate().publicKey),
    ).toThrowError(/^SOURCE_PRIVATE_KEY_BASE58 is not valid base58$/);
    expect(env.SOURCE_PRIVATE_KEY_BASE58).toBeUndefined();
  });

  it("requires a complete 64-byte Solana keypair", () => {
    expect(() =>
      loadOwnerKeypair(
        { SOURCE_PRIVATE_KEY_BASE58: bs58.encode(new Uint8Array(32)) },
        Keypair.generate().publicKey,
      ),
    ).toThrow("decoded to 32 bytes; expected 64");
  });

  it("rejects a signer that does not match EXPECTED_OWNER", () => {
    const owner = Keypair.generate();
    expect(() =>
      loadOwnerKeypair(
        { SOURCE_PRIVATE_KEY_BASE58: bs58.encode(owner.secretKey) },
        Keypair.generate().publicKey,
      ),
    ).toThrow("Signer mismatch");
  });
});
