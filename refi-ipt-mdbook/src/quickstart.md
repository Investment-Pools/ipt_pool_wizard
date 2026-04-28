# Quick start: deploy an investment pool

~**5 minutes** to read. This guide matches the repo layout under `refi-pool/` and the script `scripts/init-pool-devnet.ts`.

---

## 1. Prerequisites

- **Rust** + **Solana CLI** + **Anchor** (see `Anchor.toml` → `anchor_version`, e.g. `0.29.0`).
- A **wallet** with SOL on the target cluster (devnet airdrop is fine for testing).
- **Node.js** (npm or yarn) — scripts use `npx ts-node` and types from `target/types/` after `anchor build`.

---

## 2. Build the program

From the `refi-pool` repository root:

```bash
anchor build
```

This produces the IDL at `target/idl/refi_ipt.json` and types at `target/types/`.

---

## 3. Deploy the program

Point Solana CLI at your cluster (example: devnet), then deploy:

```bash
solana config set --url https://api.devnet.solana.com
anchor deploy
```

(`Anchor.toml` already sets `[provider] cluster = "Devnet"`; if your CLI points elsewhere, pass `--provider.cluster` explicitly.)

Note the deployed **program id** (must match `declare_id!` in `programs/refi-ipt/src/lib.rs` and `[programs.devnet]` / `[programs.localnet]` in `Anchor.toml`, or deploy/upgrade with the matching program keypair). For devnet, the script can override with **`REFI_POOL_PROGRAM_ID`** if you use a different deployment.

---

## 4. Initialize one pool (three on-chain steps)

On-chain deployment of a pool is always this sequence:

1. **`init_pool`** — Create the `Pool` PDA for a chosen **USDC mint** and pass `PoolConfig` (admin, oracle, fee collector, fees, initial PPS, `nav_allocation_bps`, etc.).
2. **`init_pool_step2`** — Create the **IPT mint** and **USDC reserve** PDAs and save their addresses on `Pool`.
3. **`init_wallets`** — One-time: set the **NAV wallet** and create the **`pending_fee_reserve`** PDA. The NAV pubkey must have (or the tx must create) a **USDC ATA** for that mint — the devnet script calls `getOrCreateAssociatedTokenAccount` for `navWalletUsdc` before this step; if you integrate manually, ensure that ATA exists.

After step 3, users can call **`user_deposit`** (and later withdraw / queue flows) as documented in [Instructions](./instructions.md).

---

## 5. Automated path (devnet script)

The repo includes a devnet initializer that **creates a new 6-decimal SPL mint as test USDC** (unless you pass **`EXISTING_USDC_MINT`**), runs the three instructions, optionally mints test USDC to the admin ATA, and writes addresses to a JSON file (default **`devnet-pool-init.json`** in the repo root).

From the **`refi-pool/`** repository root (after `anchor build` so `target/types/refi_ipt` exists):

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json

# Ensure your wallet has SOL for rent + transactions (devnet only)
solana airdrop 2

# optional — see table below

npx ts-node --transpile-only -P ./tsconfig.json scripts/init-pool-devnet.ts
```

---

## 6. What you must decide before `init_pool`

| Item | Notes |
|------|--------|
| **USDC mint** | Must be **6 decimals** for this program’s accounting assumptions. |
| **Authorities** | `admin_authority`, `oracle_authority`, `fee_collector` in `PoolConfig`. |
| **Economics** | `deposit_fee_bps`, `initial_exchange_rate` (PPS scale `1e4`), `nav_allocation_bps`, `max_queue_size` (≤ **20**). |
| **NAV wallet** | External pubkey that receives the NAV share of deposits; needs a USDC ATA before `init_wallets`. |

---

For field-level detail, use [Accounts](./accounts.md) and [Instructions](./instructions.md).
