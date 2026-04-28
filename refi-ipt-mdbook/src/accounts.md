# Accounts

Types used by **refi-ipt**. Amounts are raw units unless stated (USDC: 6 decimals; IPT: 2 decimals; PPS: scale `1e4`).

---

## `Pool`

PDA `["pool", usdc_mint]`. Main on-chain state for one pool.

**Keys & vaults**

1. **`pool_authority`** (`Pubkey`) — Same as the pool PDA; authority for mint and vault CPIs.
2. **`usdc_mint`** (`Pubkey`) — USDC mint for this pool.
3. **`ipt_mint`** (`Pubkey`) — IPT share mint (set after `init_pool_step2`).
4. **`usdc_reserve`** (`Pubkey`) — Pool USDC token account for withdrawals and fee flows.

**NAV & liquidity**

5. **`stable_assets_total`** (`u64`) — Current USDC-denominated stable asset balance, used in liquidity ratio (LR) calculations.
6. **`illiquid_fit_assets`** (`u64`) — Oracle-valued illiquid component (USDC).
7. **`liquidity_reserve_bps`** (`u16`) — Cached LR: stable / NAV × 10 000.

*NAV (not stored):* `stable_assets_total + illiquid_fit_assets`.

**Queue & windows**

8. **`withdraw_queue`** (`Vec<WithdrawRequest>`) — Withdraw requests (max **20**).
9. **`next_request_id`** (`u64`) — Next id for new requests.
10. **`current_window_id`** (`u64`) — Current weekly window id (Tuesday 12:00 UTC).
11. **`window_open_timestamp`** (`i64`) — When the current window opened.
12. **`last_execution_timestamp`** (`i64`) — Last `process_queue` time.

**Supply & fees**

13. **`current_exchange_rate`** (`u64`) — PPS: USDC per IPT, scale **1e4**.
14. **`total_ipt_supply`** (`u64`) — Outstanding IPT (tracked).
15. **`total_usdc_reserves`** (`u64`) — Tracked balance of `usdc_reserve`.
16. **`total_accumulated_fees`** (`u64`) — Fees claimable via `fee_collector_withdraw`.
17. **`max_total_supply`** (`u64`) — IPT cap; `0` = unlimited.

**Config & metadata**

18. **`config`** (`PoolConfig`) — Authorities, fees, caps, NAV split.
19. **`pool_state`** (`PoolState`) — Pause / deposit-only / withdraw-only.
20. **`last_rate_update`** (`i64`) — Last oracle rate update.
21. **`created_at`** (`i64`) — Pool creation time.
22. **`bump`** (`u8`) — PDA bump for the pool.

**Wallets & LR**

23. **`wallet_config`** (`WalletConfig`) — NAV wallet address.
24. **`pending_fee_reserve`** (`Pubkey`) — PDA for non-NAV share of deposits.
25. **`total_pending_fees`** (`u64`) — Accounting for pending fee vault.
26. **`lr_config`** (`LRConfig`) — ELR delays, fee tiers, ILR params.

---

## `PoolConfig`

Inside `Pool.config`: admin, oracle, and economics.

1. **`admin_authority`** (`Pubkey`) — Signer for admin instructions.
2. **`oracle_authority`** (`Pubkey`) — Signer for oracle instructions.
3. **`fee_collector`** (`Pubkey`) — Authorized fee recipient.
4. **`deposit_fee_bps`** (`u16`) — Fee on **net** deposit (bps).
5. **`withdrawal_fee_bps`** (`u16`) — Reserved; exits use LR marginal fees.
6. **`management_fee_bps`** (`u16`) — Reserved / future use.
7. **`initial_exchange_rate`** (`u64`) — Initial PPS at init (scale 1e4).
8. **`max_total_supply`** (`u64`) — IPT cap (`0` = unlimited).
9. **`max_queue_size`** (`u32`) — Configured queue limit (≤ **20** on-chain).
10. **`nav_allocation_bps`** (`u16`) — Fraction of **gross** deposit to NAV; rest to `pending_fee_reserve`.

---

## `WalletConfig`

1. **`nav_wallet`** (`Pubkey`) — NAV owner; must be set before deposits.

---

## `LRConfig`

Tuning for ILR, marginal exit fees, and ELR→window delays (defaults: VOLT-style in code).

**ILR**

1. **`instant_threshold_bps`** (`u16`) — ELR tier for earliest scheduling (legacy name).
2. **`ilr_full_threshold_bps`** (`u16`) — LR above which ILR is capped.
3. **`ilr_zero_threshold_bps`** (`u16`) — LR floor of the linear ILR segment.
4. **`ilr_max_bps`** (`u16`) — Max ILR as fraction of NAV (bps).

**Fee tier thresholds (LR bands)**

5. **`fee_tier1_threshold_bps`** (`u16`) — Tier 1 lower bound (highest LR).
6. **`fee_tier2_threshold_bps`** (`u16`) — Tier 2 lower bound.
7. **`fee_tier3_threshold_bps`** (`u16`) — Tier 3 lower bound.
8. **`fee_tier4_threshold_bps`** (`u16`) — Tier 4 lower bound.
9. **`fee_tier5_threshold_bps`** (`u16`) — Tier 5 lower bound (lowest LR).

**Fee tier rates**

10. **`fee_tier1_rate_bps`** (`u16`) — Tier 1 fee rate.
11. **`fee_tier2_rate_bps`** (`u16`) — Tier 2 fee rate.
12. **`fee_tier3_rate_bps`** (`u16`) — Tier 3 fee rate.
13. **`fee_tier4_rate_bps`** (`u16`) — Tier 4 fee rate.
14. **`fee_tier5_rate_bps`** (`u16`) — Tier 5 fee rate.

**Window delay thresholds (ELR)**

15. **`window_1_threshold_bps`** (`u16`) — ELR for +0 extra windows.
16. **`window_2_threshold_bps`** (`u16`) — ELR for +1 extra window.
17. **`window_3_threshold_bps`** (`u16`) — ELR for +3 extra windows.
18. **`window_4_threshold_bps`** (`u16`) — ELR for +5 extra windows.
19. **`window_5_threshold_bps`** (`u16`) — ELR for +8 extra windows.

---

## `PoolState` variants

1. **`Active`** — Deposits and withdrawals allowed (if other checks pass).
2. **`Paused`** — User ops disabled.
3. **`Frozen`** — User ops disabled.
4. **`DepositOnly`** — Deposits only.
5. **`WithdrawOnly`** — Withdrawals only.

---

## `WithdrawRequest`

One item in `withdraw_queue`.

1. **`request_id`** (`u64`) — Unique id.
2. **`user`** (`Pubkey`) — Owner; receives USDC.
3. **`requested_amount`** (`u64`) — Total USDC to settle (6 decimals).
4. **`submission_timestamp`** (`i64`) — Submission time.
5. **`submission_window_id`** (`u64`) — Window at submission.
6. **`estimated_fee_bps`** (`u16`) — Fee bps estimated at submission time(execution cannot exceed).
7. **`final_fee_bps`** (`u16`) — Fee bps from last slice.
8. **`instant_portion`** (`u64`) — Always 0 — instant exits are not supported in the current version; all withdrawals go through the queue.
9. **`executed_amount`** (`u64`) — USDC already processed.
10. **`status`** (`WithdrawStatus`) — Lifecycle.
11. **`queued_slices`** (`[QueueSlice; 5]`) — Up to five slices.
12. **`num_queued_slices`** (`u8`) — Active slice count.
13. **`ipt_amount`** (`u64`) — IPT under delegate for burn (2 decimals).
14. **`min_usdc_amount`** (`u64`) — User min USDC (slippage).

---

## `WithdrawStatus` variants

1. **`Pending`** — Not executed; cancellable.
2. **`PartiallyExecuted`** — Partly paid.
3. **`Executed`** — Fully settled.
4. **`Cancelled`** — Cancelled / removed from queue.
5. **`Deferred`** — Enum value; slice state drives most logic.

---

## `QueueSlice`

One scheduled chunk of a withdraw request.

1. **`amount`** (`u64`) — USDC for this slice.
2. **`scheduled_window_id`** (`u64`) — Window id for execution.
3. **`executed`** (`bool`) — Whether this slice is done.

---

## PDAs (quick reference)

1. **Pool** — Seeds `["pool", usdc_mint]`.
2. **IPT mint** — Seeds `["ipt_mint", pool]`; **2** decimals; mint authority = pool authority.
3. **USDC reserve** — Seeds `["usdc_reserve", pool]`; payouts from pool.
4. **Pending fee reserve** — Seeds `["pending_fee_reserve", pool]`; non-NAV deposit share.

---

## `LockState` (`states.rs`)

Present in source for serialization compatibility; **not used** by any `#[derive(Accounts)]` struct in the current program.

1. **`is_locked`** (`bool`) — Unused in live instructions.

---

## Constants (`constants.rs`)

On-chain constants (not account fields; used in math for deposits / withdrawals / queue).

1. **`PPS_SCALE`** (`u64` = `10_000`) — PPS / exchange-rate fixed-point scale (4 decimal places).
2. **`MIN_USDC_AMOUNT`** (`u64` = `10_000`) — Minimum USDC amount in raw units (**0.01** USDC at 6 decimals).
3. **`SHARES_TRUNCATE_UNIT`** (`u64` = `10_000`) — IPT share rounding (truncate to 2 decimals).
