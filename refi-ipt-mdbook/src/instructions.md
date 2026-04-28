# Instructions

Program module: **`refi_ipt`**. Each line: **instruction name (parameters)** — short description.

1. **`init_pool(config: PoolConfig)`** — Create the Pool PDA (seeded by USDC mint) and store initial PoolConfig.

2. **`init_pool_step2()`** — Create IPT mint and USDC reserve PDAs; link addresses on the pool account.

3. **`init_wallets()`** — One-time: set NAV wallet and create `pending_fee_reserve` PDA.

4. **`user_deposit`(net_usdc_amount: u64, min_ipt_amount: u64)** — User deposits USDC; split to NAV and pending fee vault; mint IPT (requires wallets initialized).

5. **`user_withdraw`(net_ipt_amount: u64, min_usdc_amount: u64)** — Queue a withdrawal for net_ipt_amount IPT; delegate those tokens to the pool authority for burn at execution.

6. **`process_queue`(window_id: u64, max_requests: u8)** — Execute queued withdraw slices for a window; burn IPT; transfer USDC (Remaining accounts must be provided as consecutive pairs: [user_ipt_ata, user_usdc_ata] for each request being processed.).

7. **`cancel_withdrawal`(request_id: u64)** — Cancel a pending withdraw request; update IPT approve/revoke.

8. **`admin_deposit_usdc`(amount: u64)** — Admin deposits USDC into the pool reserve.

9. **`admin_withdraw_usdc`(amount: u64)** — Admin withdraws USDC from the pool reserve.

10. **`fee_collector_withdraw`(amount: u64)** — Fee collector withdraws accumulated fees from the pool reserve.

11. **`admin_update_config`** (`new_config: PoolConfig`, `new_wallet_config: Option<WalletConfig>`, `new_lr_config: Option<LRConfig>`) — Update pool config; optionally NAV wallet and LR config.

12. **`update_exchange_rate`(new_rate: u64)** — Oracle updates the published price per share (PPS, scale 1e4).

13. **`withdraw_pending_fees`(amount: u64)** — Admin withdraws USDC from `pending_fee_reserve`.

14. **`update_illiquid_fit_assets`(new_illiquid_fit_assets: u64)** — Oracle updates the illiquid FIT asset component of NAV.
