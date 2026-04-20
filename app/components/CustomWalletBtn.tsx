// SPDX-License-Identifier: Apache-2.0

'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export default function ConnectBtn() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <button
      onClick={() => {
        if (connected) return disconnect();
        setVisible(true); // 👈 OPEN WALLET SELECTOR
      }}
      className="bp"
    >
      {connected
        ? `${publicKey?.toBase58().slice(0, 4)}...${publicKey
            ?.toBase58()
            .slice(-4)}`
        : 'Connect Wallet'}
    </button>
  );
}