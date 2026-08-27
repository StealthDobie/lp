import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Keypair } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadOwnerKeypair } from "../src/signer";

describe("owner signer", () => {
  let directory: string;
  let path: string;
  let owner: Keypair;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "stealthdobie-lp-"));
    path = join(directory, "owner.json");
    owner = Keypair.generate();
    await writeFile(path, JSON.stringify(Array.from(owner.secretKey)), {
      mode: 0o600,
    });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("loads a mode-0600 keypair matching the expected owner", async () => {
    const loaded = await loadOwnerKeypair(path, owner.publicKey);
    expect(loaded.publicKey.equals(owner.publicKey)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a keypair readable by other users",
    async () => {
      await chmod(path, 0o644);
      await expect(loadOwnerKeypair(path, owner.publicKey)).rejects.toThrow(
        "chmod 600",
      );
    },
  );

  it("rejects a signer that does not match EXPECTED_OWNER", async () => {
    await expect(
      loadOwnerKeypair(path, Keypair.generate().publicKey),
    ).rejects.toThrow("Signer mismatch");
  });
});
