# StealthDobie LP

Minimal mainnet-beta CLI for adding DOBERMANN/SOL liquidity to the canonical
Meteora DAMM v2 pool and applying a daily non-permanent vesting schedule.

The deposit and embedded vesting lock are one atomic transaction. If either
instruction fails, Solana rolls back the entire operation; the tool never falls
back to an unlocked two-transaction deposit.

## Fixed on-chain scope

- DOBERMANN mint: `J3mfHoQb27xHL1xUYsoPfU1vZHbzCeK7fZYvsWeYdoge`
- Meteora pool: `BRfodpEwqjjecN9u2i8mV6h6dT9ANbfG5hUeX76yPtkL`
- Meteora DAMM v2 program: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
- Cluster: Solana mainnet-beta

These values are intentionally compiled into the tool and revalidated from
RPC. They cannot be redirected through `.env`.

## Setup

Requires Node.js 24+ and pnpm 11.

```bash
pnpm install
cp .env.example .env
```

Install pnpm 11 first if `pnpm` is not already available.

The lockfile upgrades compatible transitive `bn.js` and `uuid` releases. It
also blocks `bigint-buffer`'s optional native build, keeping that dependency on
its pure-JavaScript path because its native binding has an unpatched buffer
overflow advisory.

Configure `.env`:

```dotenv
SOLANA_RPC_URL=https://your-mainnet-rpc.example

# Needed only by simulate/submit. Store a path, never key material.
OWNER_KEYPAIR_PATH=/absolute/path/to/dedicated-owner.json
EXPECTED_OWNER=YourExpectedOwnerPublicKey

DOBERMANN_AMOUNT=3000000
VESTING_DAYS=90

# Optional defaults shown below.
VESTING_CLIFF_DAYS=0
LIQUIDITY_SLIPPAGE_BPS=50
```

The signer must be a 64-byte Solana JSON keypair file with mode `0600`. The
tool refuses a signer whose public key differs from `EXPECTED_OWNER`. Do not use
a shared automation key or place private-key material directly in `.env`.

## Commands

Read the live pool, validate mainnet and calculate the required SOL without
loading a signer:

```bash
pnpm quote
```

Build, sign locally and simulate the complete atomic transaction without
sending it:

```bash
pnpm simulate
```

Rebuild from a fresh quote, simulate, require an exact interactive mainnet
confirmation phrase, submit the same simulated bytes, wait for finality and
verify the resulting position:

```bash
pnpm submit
```

`submit` has no non-interactive confirmation mode.

## Vesting behavior

`VESTING_DAYS` creates equal daily releases. `VESTING_CLIFF_DAYS` delays the
start. The tool places the initial vesting point five minutes after the live
chain timestamp so it remains valid while the transaction is built and lands.
The combined cliff and release duration is conservatively capped at 3,649 days
inside Meteora's ten-year limit. All schedule points are on-chain Unix seconds,
not JavaScript milliseconds. Integer division can leave a tiny liquidity-unit
remainder; only that remainder is assigned to the cliff release so every quoted
liquidity unit is covered by vesting.

The resulting position uses Meteora's embedded vesting state and has no
external vesting account. Matured liquidity may need a later refresh through
Meteora before withdrawal. Vesting does not prevent fee collection.

## Safety properties

- Verifies the RPC genesis hash is mainnet-beta.
- Verifies program, pool ownership, exact mints, token programs, vault mints
  and decimals.
- Uses Meteora's current on-chain quote and explicit maximum token debits.
- Treats `DOBERMANN_AMOUNT` as a hard maximum; slippage headroom applies only
  to the matching SOL side.
- Requires sufficient DOBERMANN in the owner's associated token account and
  matching SOL plus a 0.05 SOL operating buffer.
- Rejects an atomic transaction over Solana's packet-size limit rather than
  silently splitting deposit and vesting.
- Simulates with signature verification before any confirmation prompt.
- Verifies after finality that all quoted liquidity is vested, none is
  permanently locked or unexpectedly unlocked, and the NFT belongs to the
  expected owner.

The position NFT controls the position. Funding the owner from another wallet
publicly links those wallets on-chain.

## Development

```bash
pnpm typecheck
pnpm test
```
