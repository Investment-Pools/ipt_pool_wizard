// SPDX-License-Identifier: Apache-2.0
import { PublicKey, Transaction } from '@solana/web3.js';
import { useState, useMemo, useCallback } from 'react';
import { useInitProgramToken } from './useInitProgramToken';
import { useInitProgramSdk } from './useInitProgramSdk';
// import { USDC_MINT } from '../sdk';

export interface WalletContext {
  publicKey: PublicKey | null | undefined;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
}

export interface PoolContext {
  exchangeRate: number;   // already parsed
  withdrawFeeBPS: number;
}
export function useTokenActions(
  poolCtx: PoolContext,
  walletCtx: WalletContext,
  poolPda: PublicKey | null
) {
  const USDC_DECIMALS = 6;

  const program = useInitProgramToken().initProgram();
  const sdk = useInitProgramSdk(program, walletCtx);

  const [amountDeposit, setAmountDeposit] = useState(0);
  const [amountWithdraw, setAmountWithdraw] = useState(0);
  const [loading, setLoading] = useState(false);

  // ✅ SAFE: hooks always run
  const minReceiveDeposit = useMemo(() => {
    if (!poolPda) return 0;

    return (
      (amountDeposit * 10 ** USDC_DECIMALS) /
      Number(poolCtx.exchangeRate || 1)
    );
  }, [amountDeposit, poolCtx.exchangeRate, poolPda]);

  const minReceiveWithdraw = useMemo(() => {
    if (!poolPda) return 0;

    const gross =
      (amountWithdraw * Number(poolCtx.exchangeRate)) /
      10 ** USDC_DECIMALS;

    const fee = (gross * poolCtx.withdrawFeeBPS) / 10_000;

    return gross - fee;
  }, [amountWithdraw, poolCtx.exchangeRate, poolCtx.withdrawFeeBPS, poolPda]);

  // =========================
  // Deposit
  // =========================
  const deposit = useCallback(async () => {
    if (!poolPda) {
      throw new Error('Pool PDA is required');
    }
    if (amountDeposit <= 0) return;
    setLoading(true);
    try {
      if (!sdk) {
        throw new Error('SDK not initialized');
      }
      const signature = await sdk.userDeposit(
        poolPda,
        BigInt(amountDeposit * 10 ** USDC_DECIMALS),
      );

      return signature;
    } finally {
      setLoading(false);
    }
  }, [amountDeposit, poolPda, sdk]);

  const withdraw = useCallback(async () => {
    if (!poolPda) {
      throw new Error('Pool PDA is required');
    }
    if (amountWithdraw <= 0) return;
    setLoading(true);
    try {
      if (!sdk) {
        throw new Error('SDK not initialized');
      }
      const signature = await sdk.userWithdraw(
        poolPda,
        Math.floor(amountWithdraw * 10 ** USDC_DECIMALS).toString(),
      );
      return signature;
    } finally {
      setLoading(false);
    }
  }, [amountWithdraw, poolPda, sdk]);

  // ✅ Optional: early return AFTER hooks
  if (!poolPda) {
    return {
      amountDeposit,
      setAmountDeposit,
      amountWithdraw,
      setAmountWithdraw,
      minReceiveDeposit: 0,
      minReceiveWithdraw: 0,
      deposit: async () => {
        throw new Error('Pool not initialized');
      },
      withdraw: async () => {
        throw new Error('Pool not initialized');
      },
      loading: false,
    };
  }

  return {
    amountDeposit,
    setAmountDeposit,
    amountWithdraw,
    setAmountWithdraw,
    minReceiveDeposit,
    minReceiveWithdraw,
    deposit,
    withdraw,
    loading,
  };
}