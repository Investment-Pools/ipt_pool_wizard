# REFI IPT — Investment Pool Program

Solana **Anchor** program for USDC-based **investment pools**: mint **IPT** (pool shares), route deposits between **NAV** and **pending fee** vaults, and settle exits via a **queued withdrawal** model with weekly windows and liquidity (LR/ELR) mechanics.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Program Instructions](#program-instructions)
- [Account Structures](#account-structures)
- [Pool Mechanics](#pool-mechanics)
- [Deployment](#deployment)
- [Testing](#testing)
- [PDA Reference](#pda-reference)
- [Constants](#constants)
- [Error Codes](#error-codes)
- [mdBook (this folder)](#mdbook-this-folder)

---

## Overview

The **refi-ipt** program (`refi_ipt` module) lets operators:

1. **Initialize** a pool bound to a **USDC mint**, then create **IPT** (2 decimals) and a **USDC reserve** for withdrawals.
2. **Configure** NAV wallet + **pending fee reserve** so each deposit splits **gross** USDC by `nav_allocation_bps`.
3. Accept **user deposits** (mint IPT) and **queued withdrawals** (no instant exit): users approve IPT to the pool authority; a **keeper** calls `process_queue` per weekly **window**.
4. **Oracle** updates **PPS** (`current_exchange_rate`, scale `1e4`) and **illiquid FIT** (`illiquid_fit_assets`) so **NAV** and **LR/ELR** stay consistent.

---

## Features

### Deposits & IPT

- **USDC → IPT** using on-chain **PPS** (`current_exchange_rate`, scale `1e4`); IPT mint **2 decimals**.
- **Net** deposit with configurable **deposit fee** (bps on net); **slippage** guard via `min_ipt_amount`.
- **Gross** deposit split by **`nav_allocation_bps`**: NAV wallet vs **`pending_fee_reserve`** PDA; tracks **`total_pending_fees`**.
- Optional **max IPT supply** cap (`max_total_supply`).

### NAV, liquidity & oracle

- **NAV** = `stable_assets_total + illiquid_fit_assets` (derived).
- **Oracle** updates **exchange rate (PPS)** and **illiquid FIT assets** (`update_illiquid_fit_assets`) for NAV / LR / ILR.
- **LR** (liquidity ratio) and **ELR** (after pending withdrawals) drive scheduling and fees; **ILR** curve from `LRConfig` (VOLT-style defaults via `default_volt()`).
- **Liquidity Recovery Mode** when **LR = 0%** (new user withdraws blocked); events when entering/exiting recovery via oracle NAV updates.

### Queued withdrawals (no instant exit)

- **100% queued** — no instant USDC exit; users **delegate IPT** to pool authority for queued amounts.
- **Withdrawal queue** up to **20** requests; each request up to **5** **time slices** with **weekly window** scheduling and **22h-before-execution** eligibility (`lr_utils`).
- **ELR-based** extra **window delays**; **marginal exit fees** by **LR tier** (fee cannot increase above estimate at queue time).
- **`process_queue`** by **window_id** + **`max_requests`**; **pro-rata** settlement if reserve liquidity is short; burns IPT and pays USDC from **`usdc_reserve`**.
- **`cancel_withdrawal`** for **Pending** requests; updates IPT approve/revoke.

### Admin, fee & treasury flows

- **Admin**: deposit/withdraw **USDC reserve**, **`withdraw_pending_fees`** from pending fee vault, **`admin_update_config`** (full `PoolConfig`, optional **NAV wallet** + **`LRConfig`**).
- **Oracle**: **PPS** and **illiquid** updates (dedicated signers in `PoolConfig`).
- **Fee collector**: withdraw **`total_accumulated_fees`** from reserve (subject to balance).
- **`PoolState`**: **Active**, **Paused**, **Frozen**, **DepositOnly**, **WithdrawOnly**.

### Safety & accounting

- Checked math patterns; **slippage** and **ELR** checks on new withdraws (e.g. cannot push ELR to 0%).
- On-chain tracking of **stable assets**, **reserves**, **IPT supply**, **accumulated fees**, and **queue** state for integrators and indexers.

---

## Architecture

### Program layout

```
programs/refi-ipt/src/
├── lib.rs                    # Program entry: refi_ipt
├── constants.rs              # PPS_SCALE, MIN_USDC_AMOUNT, SHARES_TRUNCATE_UNIT
├── errors.rs                 # PoolError
├── events.rs                 # Anchor events
├── states.rs                 # Pool, PoolConfig, LRConfig, WithdrawRequest, ...
└── instructions/
    ├── mod.rs
    ├── init_pool.rs
    ├── init_pool_step2.rs
    ├── init_wallets.rs
    ├── user_deposit.rs
    ├── user_withdraw.rs
    ├── process_queue.rs
    ├── cancel_withdrawal.rs
    ├── admin_deposit_usdc.rs
    ├── admin_withdraw_usdc.rs
    ├── fee_collector_withdraw.rs
    ├── admin_update_config.rs
    ├── update_exchange_rate.rs
    ├── withdraw_pending_fees.rs
    └── update_illiquid_fit_assets.rs
```

### Main state

| Account | Role |
|---------|------|
| **Pool** | PDA `["pool", usdc_mint]` — all pool config, queue, NAV fields, LR config |
| **IPT mint** | PDA `["ipt_mint", pool]` — 2 decimals |
| **USDC reserve** | PDA `["usdc_reserve", pool]` — USDC for `process_queue` / admin / fees |
| **Pending fee reserve** | PDA `["pending_fee_reserve", pool]` — non-NAV share of deposits |

---

## Installation

### Prerequisites

- Rust (edition 2021)
- Solana CLI (compatible with your cluster)
- **Anchor 0.29.0** (see `Anchor.toml`)
- Node.js + yarn (for tests / scripts)

### Setup

From the **repository root** (`refi-pool/`):

```bash
yarn install
anchor build
anchor test
```

Deploy (example devnet):

```bash
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet
```

### Program ID

Declared in `programs/refi-ipt/src/lib.rs`:

```rust
declare_id!("HpPJBUex6FdSw7CGvYzjtUmM1629RNTqgCyu6pfcyNBx");
```

Override per cluster in `Anchor.toml` under `[programs.<cluster>]`.

---

## Program Instructions

### 1. `init_pool`

Creates the **Pool** PDA for a given USDC mint and initial `PoolConfig`.

```rust
pub fn init_pool(ctx: Context<InitializePool>, config: PoolConfig) -> Result<()>
```

**Parameters**

- `config` — Admin, oracle, fee collector, fees, `initial_exchange_rate`, `max_total_supply`, `max_queue_size`, `nav_allocation_bps`, etc.

**Accounts**

- `payer` (signer, mut), `usdc_mint`, `pool` (init, mut), `system_program`

---

### 2. `init_pool_step2`

Creates **IPT mint** and **USDC reserve** token accounts; updates `pool.ipt_mint` / `pool.usdc_reserve`.

```rust
pub fn init_pool_step2(ctx: Context<InitializePoolStep2>) -> Result<()>
```

**Accounts**

- `payer` (signer, mut), `pool` (mut), `pool_authority`, `usdc_mint`, `ipt_mint` (init), `usdc_reserve` (init), `token_program`, `system_program`

---

### 3. `init_wallets`

One-time: sets **NAV wallet** and creates **`pending_fee_reserve`**. `admin` must match `config.admin_authority`.

```rust
pub fn init_wallets(ctx: Context<InitializeWallets>) -> Result<()>
```

**Accounts**

- `admin` (signer, mut), `pool` (mut), `pool_authority`, `usdc_mint`, `pending_fee_reserve` (init), `nav_wallet`, `nav_wallet_usdc` (mut), `token_program`, `system_program`

---

### 4. `user_deposit`

User deposits **net** USDC; fee on net; gross split NAV / pending fee; **mints IPT**. Requires `init_wallets`.

```rust
pub fn user_deposit(
    ctx: Context<UserDeposit>,
    net_usdc_amount: u64,
    min_ipt_amount: u64,
) -> Result<()>
```

**Accounts**

- `user` (signer, mut), `pool`, `pool_authority`, `user_usdc_account`, `user_ipt_account`, `nav_wallet_usdc`, `pending_fee_reserve`, `ipt_mint`, `token_program`, `system_program`

**Usage (sketch)**

```typescript
await program.methods
  .userDeposit(new BN(1_000_000), new BN(95)) // example: min IPT out
  .accounts({
    user: user.publicKey,
    pool: poolPda,
    poolAuthority: poolPda,
    userUsdcAccount: userUsdcAta,
    userIptAccount: userIptAta,
    navWalletUsdc: navUsdcAta,
    pendingFeeReserve: pendingFeeReservePda,
    iptMint: iptMintPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

---

### 5. `user_withdraw`

Queues a **full** withdrawal (no instant). Builds slices; **approves** total delegated IPT for this user’s active requests.

```rust
pub fn user_withdraw(
    ctx: Context<UserWithdraw>,
    net_ipt_amount: u64,
    min_usdc_amount: u64,
) -> Result<()>
```

**Accounts**

- `user` (signer, mut), `pool`, `pool_authority`, `user_ipt_account`, `user_usdc_account`, `pool_usdc_reserve`, `ipt_mint`, `token_program`, `system_program`

---

### 6. `process_queue`

Executes slices for `window_id`. **Remaining accounts**: for each processed request, **two** accounts — user **IPT** ATA, then user **USDC** ATA.

```rust
pub fn process_queue(
    ctx: Context<ProcessQueue>,
    window_id: u64,
    max_requests: u8,
) -> Result<()>
```

**Accounts (fixed)**

- `executor` (signer, mut), `pool`, `pool_authority`, `pool_usdc_reserve`, `ipt_mint`, `token_program`

**Remaining**

- Repeating pairs: `user_ipt_account`, `user_usdc_account` for each request handled.

---

### 7. `cancel_withdrawal`

Cancels a **Pending** request by `request_id`.

```rust
pub fn cancel_withdrawal(ctx: Context<CancelWithdrawal>, request_id: u64) -> Result<()>
```

**Accounts**

- `user` (signer, mut), `pool`, `pool_authority`, `user_ipt_account`, `token_program`

---

### 8. `admin_deposit_usdc`

```rust
pub fn admin_deposit_usdc(ctx: Context<AdminDepositUsdc>, amount: u64) -> Result<()>
```

**Accounts**

- `admin` (signer, mut), `pool`, `admin_usdc_account`, `pool_usdc_reserve`, `token_program`

---

### 9. `admin_withdraw_usdc`

```rust
pub fn admin_withdraw_usdc(ctx: Context<AdminWithdrawUsdc>, amount: u64) -> Result<()>
```

**Accounts**

- `admin` (signer, mut), `pool`, `pool_authority`, `admin_usdc_account`, `pool_usdc_reserve`, `token_program`

---

### 10. `fee_collector_withdraw`

```rust
pub fn fee_collector_withdraw(ctx: Context<FeeCollectorWithdraw>, amount: u64) -> Result<()>
```

**Accounts**

- `fee_collector` (signer, mut), `pool`, `pool_authority`, `fee_collector_usdc_account`, `pool_usdc_reserve`, `token_program`

---

### 11. `admin_update_config`

```rust
pub fn admin_update_config(
    ctx: Context<AdminUpdateConfig>,
    new_config: PoolConfig,
    new_wallet_config: Option<WalletConfig>,
    new_lr_config: Option<LRConfig>,
) -> Result<()>
```

**Accounts**

- `admin` (signer, mut), `pool` (mut)

---

### 12. `update_exchange_rate`

```rust
pub fn update_exchange_rate(ctx: Context<UpdateExchangeRate>, new_rate: u64) -> Result<()>
```

**Accounts**

- `oracle` (signer, mut), `pool` (mut)

---

### 13. `withdraw_pending_fees`

```rust
pub fn withdraw_pending_fees(ctx: Context<WithdrawPendingFees>, amount: u64) -> Result<()>
```

**Accounts**

- `admin` (signer, mut), `pool`, `pool_authority`, `admin_usdc_account`, `pending_fee_reserve`, `token_program`

---

### 14. `update_illiquid_fit_assets`

```rust
pub fn update_illiquid_fit_assets(
    ctx: Context<UpdateIlliquidFitAssets>,
    new_illiquid_fit_assets: u64,
) -> Result<()>
```

**Accounts**

- `oracle` (signer, mut), `pool` (mut)

---

## Account Structures

### `Pool`

**PDA seeds:** `["pool", usdc_mint]`

Key fields (see `states.rs` for full layout):

```rust
pub struct Pool {
    pub pool_authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub ipt_mint: Pubkey,
    pub usdc_reserve: Pubkey,
    pub stable_assets_total: u64,
    pub illiquid_fit_assets: u64,
    pub liquidity_reserve_bps: u16,
    pub withdraw_queue: Vec<WithdrawRequest>,
    pub next_request_id: u64,
    pub current_window_id: u64,
    pub window_open_timestamp: i64,
    pub last_execution_timestamp: i64,
    pub current_exchange_rate: u64,
    pub total_ipt_supply: u64,
    pub total_usdc_reserves: u64,
    pub total_accumulated_fees: u64,
    pub max_total_supply: u64,
    pub config: PoolConfig,
    pub pool_state: PoolState,
    pub last_rate_update: i64,
    pub created_at: i64,
    pub bump: u8,
    pub wallet_config: WalletConfig,
    pub pending_fee_reserve: Pubkey,
    pub total_pending_fees: u64,
    pub lr_config: LRConfig,
}
```

**Derived:** `nav_total() = stable_assets_total + illiquid_fit_assets`.

---

### `PoolConfig`

```rust
pub struct PoolConfig {
    pub admin_authority: Pubkey,
    pub oracle_authority: Pubkey,
    pub fee_collector: Pubkey,
    pub deposit_fee_bps: u16,
    pub withdrawal_fee_bps: u16,
    pub management_fee_bps: u16,
    pub initial_exchange_rate: u64,
    pub max_total_supply: u64,
    pub max_queue_size: u32,
    pub nav_allocation_bps: u16,
}
```

---

### `WalletConfig`

```rust
pub struct WalletConfig {
    pub nav_wallet: Pubkey,
}
```

---

### `LRConfig`

Thresholds for ILR, marginal **fee tiers** (LR bands), and **ELR → window delay** tiers. Defaults: `LRConfig::default_volt()`.

---

### `WithdrawRequest` / `QueueSlice` / `WithdrawStatus`

- **`WithdrawRequest`** — `request_id`, `user`, `requested_amount`, slices `queued_slices: [QueueSlice; 5]`, `ipt_amount`, `min_usdc_amount`, `status`, etc.
- **`QueueSlice`** — `amount`, `scheduled_window_id`, `executed`
- **`WithdrawStatus`** — `Pending`, `PartiallyExecuted`, `Executed`, `Cancelled`, `Deferred`

---

### `PoolState`

`Active`, `Paused`, `Frozen`, `DepositOnly`, `WithdrawOnly`

---

## Pool Mechanics

- **NAV** = stable + illiquid (illiquid set by oracle).
- **LR (bps)** ≈ stable / NAV × 10 000; **ELR** accounts for pending withdrawals in the queue.
- **Deposits** increase `stable_assets_total` by **gross** USDC; USDC goes to NAV + pending fee vaults (not to `usdc_reserve` unless you use admin deposit / process flow).
- **Withdrawals** are **100% queued**; `process_queue` burns IPT (delegate) and sends USDC from `usdc_reserve`; may **pro-rata** if liquidity is insufficient.
- **Weekly windows** and **22h cutoff** logic are implemented in `utils/lr_utils.rs` (used when building slices).

---

## Deployment

Typical **new pool** sequence on-chain:

1. `init_pool`
2. `init_pool_step2`
3. `init_wallets`

Automated **devnet** script (creates or uses USDC mint, runs all three, writes JSON):

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
npx ts-node --transpile-only -P ./tsconfig.json scripts/init-pool-devnet.ts
```

See `scripts/init-pool-devnet.ts` for env vars (`EXISTING_USDC_MINT`, `NAV_PUBLIC_KEY`, `OUTPUT_JSON`, etc.).

---

## Testing

```bash
anchor test
```

Tests live under `tests/` (e.g. `volt-mechanism.ts`).

---

## PDA Reference

```typescript
import { PublicKey } from "@solana/web3.js";

const programId = new PublicKey("HpPJBUex6FdSw7CGvYzjtUmM1629RNTqgCyu6pfcyNBx");

// Pool
const [poolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), usdcMint.toBuffer()],
  programId
);

// IPT mint & USDC reserve (use pool PDA bytes)
const [iptMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("ipt_mint"), poolPda.toBuffer()],
  programId
);
const [usdcReserve] = PublicKey.findProgramAddressSync(
  [Buffer.from("usdc_reserve"), poolPda.toBuffer()],
  programId
);

// Pending fee reserve
const [pendingFeeReserve] = PublicKey.findProgramAddressSync(
  [Buffer.from("pending_fee_reserve"), poolPda.toBuffer()],
  programId
);
```

`pool_authority` in accounts is the **pool PDA** (`pool.key()` equals stored `pool_authority`).

---

## Constants

```rust
// programs/refi-ipt/src/constants.rs
pub const PPS_SCALE: u64 = 10_000;
pub const MIN_USDC_AMOUNT: u64 = 10_000; // 0.01 USDC (6 decimals)
pub const SHARES_TRUNCATE_UNIT: u64 = 10_000; // IPT 2 decimals rounding
```

---

## Error Codes

Custom errors are in `PoolError` (`programs/refi-ipt/src/errors.rs`). Anchor assigns **codes at compile time**; clients should match by **name / message**, not hard-coded numbers.

Examples:

| Variant | Message (abridged) |
|---------|---------------------|
| `UnauthorizedAdmin` | Only admin |
| `UnauthorizedOracle` | Only oracle |
| `PoolPaused` / `PoolFrozen` | Pool state |
| `SlippageExceeded` | Slippage |
| `WalletsNotInitialized` | Wallets not initialized |
| `LiquidityRecoveryMode` | LR = 0% |
| `ELRWouldReachZero` | Withdraw would zero ELR |
| `WithdrawQueueFull` | Queue full |
| `RequestNotFound` | Request not found |
| `CannotCancelExecutedRequest` | Cancel only when Pending |
| `InvalidLRConfig` | LR config invalid |

See `errors.rs` for the full list.

---

## mdBook (this folder)

This directory contains:

| Path | Purpose |
|------|---------|
| **`README.md`** (this file) | Full narrative documentation |
| `book.toml` | mdBook configuration |
| `src/SUMMARY.md` | Book chapters |
| `src/introduction.md`, `quickstart.md`, `accounts.md`, `instructions.md` | Shorter structured pages |

Build static HTML from the **repository root**:

```bash
cd docs/refi-ipt-mdbook
mdbook build    # output: book/
mdbook serve
```

Install mdBook once: `cargo install mdbook`.

---

**Built with Anchor on Solana.**