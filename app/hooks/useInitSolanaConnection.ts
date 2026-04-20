// SPDX-License-Identifier: Apache-2.0
import { useMemo } from 'react';
import { Connection } from '@solana/web3.js';

export function useSolanaConnection() {
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;

  const connection = useMemo(() => {
    if (!RPC_URL) {
      throw new Error('NEXT_PUBLIC_RPC_URL not set');
    }

    return new Connection(RPC_URL, 'confirmed');
  }, [RPC_URL]);

  return connection;
}