// SPDX-License-Identifier: Apache-2.0
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import CustomWalletBtn from './components/CustomWalletBtn';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { sleep, toFixedBytes, USDC_MINT } from './sdk';
import { toast } from 'react-toastify';
import { useInitProgramToken } from './hooks/useInitProgramToken';
import { useInitProgramSdk } from './hooks/useInitProgramSdk';
import TokenDashboard from './components/TokenDashboard';

export interface PoolConfig {
  adminAuthority: string;
  oracleAuthority: string;
  feeCollector: string;
  depositFeeBps: number;
  withdrawalFeeBps: number;
  managementFeeBps: number;
  initialExchangeRate: string; // hex
  maxTotalSupply: string; // hex
  maxQueueSize: number;
  navAllocationBps: number;
  poolName: number[]; // byte array
  tokenSymbol: number[]; // byte array
  targetApyBps: number;
}

export interface WalletConfig {
  navWallet: string;
}

export interface PoolState {
  active?: Record<string, never>;
}

export interface Pool {
  poolAuthority: string;
  usdcMint: string;
  poolId: string;
  iptMint: string;
  usdcReserve: string;
  pendingQueue: unknown[];
  currentExchangeRate: string; // hex
  totalIptSupply: BN; // hex
  totalUsdcReserves: string; // hex
  totalAccumulatedFees: string; // hex
  maxTotalSupply: string; // hex
  config: PoolConfig;
  poolState: PoolState;
  lastRateUpdate: string; // hex
  createdAt: string; // hex
  bump: number;
  walletConfig: WalletConfig;
  pendingFeeReserve: PublicKey | undefined;
  totalPendingFees: string; // hex
}

export default function ReFiApp() {
  const [poolAddress, setPoolAddress] = useState<PublicKey | null | undefined>();
  const { initProgram } = useInitProgramToken();
  const { publicKey, signTransaction } = useWallet();
  const program = useMemo(() => {
    return initProgram();
  }, []);
  const sdk = useInitProgramSdk(program, { publicKey, signTransaction: signTransaction || (async (tx) => tx) });
  const [step, setStep] = useState<1 | 2 | 'deploy'>(1);
  const [view, setView] = useState<'wizard' | 'dashboard' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !program) return;
    try {
      const data = localStorage.getItem('vaultDeployment');
      if (!data){
         setView('wizard');
         return;
      }
      const parsed = JSON.parse(data);
      const vaultContractAddress = parsed?.vaultContractAddress
      if (vaultContractAddress) {
        setPoolAddress(new PublicKey(vaultContractAddress));
        console.log('called here')
        setView('dashboard');
      }
    } catch (err) {
      console.error('Error reading poolAddress from localStorage:', err);
    }
  }, [program, sdk]);

  const [form, setForm] = useState({
    name: '',
    symbol: '',
    apy: 1,
    poolId: 1,
  });

  const [deploying, setDeploying] = useState(false);

  const handleDeploy = async () => {
    try {
      if (!publicKey) {
        throw new Error('Connect your wallet first');
      }
      if (!sdk) {
        throw new Error('SDK not initialized');
      }
      setStep('deploy');
      setDeploying(true);
      const config = {
        adminAuthority: publicKey,
        oracleAuthority: publicKey,
        feeCollector: publicKey,
        depositFeeBps: 100,    // 1%
        withdrawalFeeBps: 200, // 2%
        managementFeeBps: 50,  // 0.5%
        initialExchangeRate: new BN(1000000), // 1:1
        maxTotalSupply: new BN(0), // Unlimited
        maxQueueSize: 20,
        navAllocationBps: 10000, // 100% to NAV
        poolName: toFixedBytes(form.name, 50),
        tokenSymbol: toFixedBytes(form.symbol, 10),
        targetApyBps: form.apy * 1000, // convert to bps
      }

      const { poolPda } = await sdk.initPool(USDC_MINT, form.poolId, config);
      console.log('Pool PDA:', poolPda);
      setPoolAddress(poolPda);
      await sleep(10000); // wait for transactions to confirm
      await sdk.initPoolStep2(USDC_MINT, poolPda);

      //disable because we no longer need this step
      // const { sig } = await sdk.initWallets(
      //   poolPda,
      // );
      setDeploying(false);

      const deployData = {
        walletAddress: publicKey.toString(),
        vaultContractAddress: poolPda.toString(),
      };

      localStorage.setItem('vaultDeployment', JSON.stringify(deployData));

    } catch (err: any) {
      toast.error(err?.message || 'Deployment failed');
      setStep(1);
      console.log(err);
      setDeploying(false);
    }
  };

  return (
    <div className="app">

      {/* TOPBAR */}
      <div className="topbar">
        <div className="logo">ReFi Hub</div>

        <CustomWalletBtn />
      </div>

      {/* ===== WIZARD ===== */}
      {view === 'wizard' && (
        <div className="card">
          <div className="wiz-h">
            <h2>Launch a pool</h2>
            <p>Deploy a yield pool on Solana in minutes</p>
          </div>

          <div className="steps">
            <div>
              <div className={`sd ${step === 1 ? 'on' : ''}`} id="sd1">1</div>
              <div className="slbl">Configure</div>
            </div>

            <div className="sl" id="sl1"></div>
            <div>
              <div className={`sd ${step === 2 ? 'on' : ''}`} id="sd1">2</div>
              <div className="slbl">Review</div>
            </div>

            <div className="sl" id="sl1"></div>

            <div>
              <div className={`sd ${step === 'deploy' ? 'on' : ''}`} id="sd2">3</div>
              <div className="slbl">Deploy</div>
            </div>
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div id="step1">
              <div className="fr mb-5">
                <div className="fg">
                  <label>Pool name</label>
                  <input type="text" id="poolName" placeholder="e.g. SolarYield Pool" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="fg">
                  <label>Token symbol</label>
                  <input type="text" id="tokenSymbol" placeholder="e.g. sYLD" value={form.symbol} className='uppercase' onChange={(e) => setForm(prev => ({ ...prev, symbol: e.target.value }))} />
                  <div className="fhint">Max 6 characters</div>
                </div>
              </div>
              <div className="fr mb-5">
                <div className="fg">
                  <label>Target APY</label>
                  <div className="iw">
                    <input type="number" id="targetAPY" value={form.apy} min="0.1" max="50" step="0.1" onChange={(e) => setForm(prev => ({ ...prev, apy: parseFloat(e.target.value) }))} />
                    <span className="sf">%</span>
                  </div>
                  <div className="fhint">Annualized target return displayed to investors</div>
                </div>
                <div className="fg">
                  <label>Pool ID</label>
                  <div className="iw">
                    <input type="number" id="poolId" value={form.poolId} min="1" onChange={(e) => setForm(prev => ({ ...prev, poolId: parseInt(e.target.value) }))} />
                  </div>
                </div>
              </div>

              <div className="bg-[#F7F8FA] rounded-lg p-4 mt-5" style={{ padding: '20px' }}>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.5px] mb-2.5">
                  Fixed parameters
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="text-[13px]">
                    <span className="text-gray-400">Base asset:</span> USDC
                  </div>
                  <div className="text-[13px]">
                    <span className="text-gray-400">Seed PPS:</span> $1.0000
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <div className="text-[13px]">
                    <span className="text-gray-400">Network:</span> Solana
                  </div>
                  <div className="text-[13px]">
                    <span className="text-gray-400">Withdrawals:</span> Instant at PPS
                  </div>
                </div>
              </div>
              <div className="brow">
                <div></div>
                <button className="bp" onClick={() => setStep(2)}>Review & deploy →</button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <div id="step2">
                <div className="rg">
                  <div className="ri"><div className="rl">Pool name</div><div className="rv" id="rName">{form.name}</div></div>
                  <div className="ri"><div className="rl">Token symbol</div><div className="rv" id="rSymbol">{form.symbol}</div></div>
                  <div className="ri"><div className="rl">Target APY</div><div className="rv gr" id="rAPY">{form.apy.toFixed(1)}%</div></div>
                  <div className="ri"><div className="rl">Pool ID</div><div className="rv gr" id="rPoolId">{form.poolId}</div></div>
                  <div className="ri"><div className="rl">Seed PPS</div><div className="rv">$1.0000</div></div>
                  <div className="ri"><div className="rl">Base asset</div><div className="rv">USDC</div></div>
                  <div className="ri"><div className="rl">Network</div><div className="rv">Solana (Devnet)</div></div>
                </div>
                <div className="note">⚡ Deploying will create a new pool on Solana devnet. You&apos;ll sign one transaction in your wallet.</div>
                {/* <pre style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', fontSize: '14px' }}>
                  <code>
                    {`const hardCodedConfig = {
  depositFeeBps: 100,    // 1%
  withdrawalFeeBps: 200, // 2%
  managementFeeBps: 50,  // 0.5%
  initialExchangeRate: new BN(1000000), // 1:1
  maxTotalSupply: new BN(0), // Unlimited
  maxQueueSize: 20,
  navAllocationBps: 10000, // 100% to NAV
}`}
                  </code>
                </pre> */}
                <div className="brow">
                  <button className="bs" onClick={() => setStep(1)}>← Back</button>
                  <button className="bp" onClick={() => handleDeploy()}>Deploy pool</button>
                </div>
              </div>
            </>
          )}

          {/* DEPLOY */}
          {step === 'deploy' && (
            <div>
              {deploying ? (
                <>
                  {/* LOADING */}
                  <div className="text-center py-12" id="dLoading">
                    <div className="m-auto mt-5 w-10 h-10 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>

                    <p className="text-[15px] font-semibold">
                      Deploying your pool...
                    </p>
                    <p className="text-[13px] text-gray-500 mt-1.5">
                      Confirm the transaction in your wallet. Please do not close this window while deployment is in progress.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div id="stepDeploy">


                    {/* SUCCESS */}
                    <div className="text-center py-12" id="dSuccess">
                      <div className="w-13 h-13 bg-green-50 m-auto rounded-full flex items-center justify-center mx-auto mb-3.5">
                        <svg
                          height="26"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#22C55E"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>

                      <p className="text-[18px] font-semibold mb-1">
                        Pool deployed
                      </p>
                      <p className="text-[13px] text-gray-500">
                        Your pool is live on Solana devnet
                      </p>

                      <div className="font-mono text-[13px] bg-gray-100 px-4 py-2 rounded-md text-gray-500 inline-block my-2 border border-gray-200" style={{ padding: '10px' }}>
                        {poolAddress?.toString() || 'No address'}
                      </div>

                      <br />

                      <a
                        target='_blank'
                        href={`https://solscan.io/address/${poolAddress?.toString()}?cluster=devnet`}
                        className="text-[12px] text-purple-500 no-underline"
                      >
                        View on Solana Explorer ↗
                      </a>

                      <div className="mt-6">
                        <button
                          className="bp"
                          onClick={() => {
                            window.location.reload();
                          }}
                        >
                          Open pool dashboard →
                        </button>
                      </div>
                    </div>
                  </div>

                </>
              )}
            </div>
          )}
        </div>
      )
      }

      {/* ===== DASHBOARD ===== */}
      {
        view === 'dashboard' && (
          <TokenDashboard poolAddress={poolAddress} />
        )
      }
      {view === null && (
        <div className="text-center py-12" id="dLoading">
          <div className="m-auto mt-5 w-10 h-10 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[15px] font-semibold">
            Fetching Pool Info
          </p>
        </div>
      )}
    </div >
  )
}