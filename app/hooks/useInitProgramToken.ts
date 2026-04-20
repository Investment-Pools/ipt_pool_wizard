// SPDX-License-Identifier: Apache-2.0
import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

import idlDevNet from '@/app/token/idl.json';
import { REFI_POOL_PROGRAM_ID } from '../sdk';
import { useSolanaConnection } from './useInitSolanaConnection';

export function useInitProgramToken() {
  const wallet = useWallet();
  const connection = useSolanaConnection();
  const initProgram = () => {
    if (!wallet.sendTransaction) {
      throw new Error('Wallet does not support sendTransaction');
    }
   
    // ✅ IMPORTANT: wallet adapter itself, not publicKey
    const provider = new anchor.AnchorProvider(
      connection,
      wallet as unknown as anchor.Wallet, 
      anchor.AnchorProvider.defaultOptions()
    );

    const program = new anchor.Program(
      idlDevNet as anchor.Idl,
      new PublicKey(REFI_POOL_PROGRAM_ID),
      provider
    );

    return {
      program,
      connection,
      wallet,
    };
  };

  return { initProgram };
}