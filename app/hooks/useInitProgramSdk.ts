// SPDX-License-Identifier: Apache-2.0
import { useMemo } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createRefiPoolSDK } from '../sdk';
import { useSolanaConnection } from './useInitSolanaConnection';

type WalletLike = {
  publicKey: PublicKey | null | undefined;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

export function useInitProgramSdk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: any,
  wallet: WalletLike
) {
  const connection = useSolanaConnection();
  const sdk = useMemo(() => {
    if( !wallet.publicKey || !wallet.signTransaction){
      return null;
    }
    if (!program) {
      return null;
    }

    return createRefiPoolSDK({
      program,
      connection,
      wallet: {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
      },
    });
  }, [program, wallet.publicKey, wallet.signTransaction, connection]);

  return sdk;
}