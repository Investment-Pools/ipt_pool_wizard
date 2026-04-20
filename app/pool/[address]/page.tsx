// SPDX-License-Identifier: Apache-2.0
'use client';

import { useParams } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import TokenDashboard from '../../components/TokenDashboard'
import CustomWalletBtn from '../../components/CustomWalletBtn'
export default function PoolPage() {
  const params = useParams();
  const address = params.address as string;
  let poolAddress: PublicKey | null = null;
  try {
    poolAddress = new PublicKey(address);
  } catch (err: unknown) {
    console.log(err);
  }

  return (
    <div className='app'>

      <div className="topbar">
        <div className="logo">ReFi Hub</div>

        <CustomWalletBtn />
      </div>
      {poolAddress ? <TokenDashboard poolAddress={poolAddress} /> : 'Invalid Pool Address'}
    </div>

  );
}