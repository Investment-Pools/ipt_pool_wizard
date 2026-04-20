// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useMemo, useState } from 'react';
import { useInitProgramSdk } from '../hooks/useInitProgramSdk';
import { useInitProgramToken } from '../hooks/useInitProgramToken';
import { useWallet } from '@solana/wallet-adapter-react';
import { Pool } from '../page';
import { PublicKey } from '@solana/web3.js';
import { copyToClipboard, getFormattedPrice, getPoolState, sleep, USDC_DECIMALS, USDC_MINT } from '../sdk';
import { formatUnits } from 'viem';
import { toast } from 'react-toastify';
import { useTokenActions } from '../hooks/useTokenActions';
type Props = {
  poolAddress: PublicKey | null | undefined;
}
const IptDashboard: React.FC<Props> = ({
  poolAddress
}) => {
  const { publicKey, signTransaction } = useWallet();
  const { initProgram } = useInitProgramToken();

  const program = useMemo(() => {
    return initProgram();
  }, []);
  const sdk = useInitProgramSdk(program, { publicKey, signTransaction: signTransaction || (async (tx) => tx) });
  const [loadingDeposit, setLoadingDeposit] = useState<boolean>(false);
  const [loadingWithdraw, setLoadingWithdraw] = useState<boolean>(false);

  const actions = useTokenActions(
    {
      exchangeRate: 0,
      withdrawFeeBPS: 0,
    },
    { publicKey, signTransaction: signTransaction || (async (tx) => tx) },
    poolAddress || null
  );
  const [pool, setPool] = useState<Pool | null>(null);
  const [loadingPool, setLoadingPool] = useState(true);
  const [depositBalance, setDepositBalance] = useState('0');
  const [balanceTOKEN, setBalanceTOKEN] = useState('0');
  const bytesToString = (arr: number[]) => { return new TextDecoder().decode(new Uint8Array(arr)).replace(/\0/g, ''); }

  const fetchBalances = async () => {
    if (sdk && poolAddress) {
      const iptMint = sdk.deriveIptMintPda(new PublicKey(poolAddress));
      const usdcBalance = await sdk.getTokenBalance(USDC_MINT);
      const iptBalance = await sdk.getTokenBalance(iptMint);
      setDepositBalance(formatUnits(BigInt(usdcBalance), USDC_DECIMALS));
      setBalanceTOKEN(formatUnits(BigInt(iptBalance), USDC_DECIMALS));
      console.log(usdcBalance, iptBalance);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !program) return;
    try {
      const fetchPool = async (address: PublicKey) => {
        try {
          setLoadingPool(true);
          if (!sdk || !address) {
            console.log('SDK not initialized');
            return false;
          }
          const res = await sdk.getPoolState(program, address);
          setPool(res);
          fetchBalances();
        } catch (err) {
          console.error('Error fetching pool:', err);
        } finally {
          setLoadingPool(false);
        }
      };

      if (poolAddress) {
        fetchPool(new PublicKey(poolAddress))
      }
    } catch (err) {
      console.error('Error reading poolAddress from localStorage:', err);
    }
  }, [program, sdk, poolAddress]);


  // ⛔ guard while loading
  if (loadingPool || !pool) {
    console.log(pool);
    return (
      <div className="text-center py-12" id="dLoading">
        <div className="m-auto mt-5 w-10 h-10 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[15px] font-semibold">
          Fetching Pool Info
        </p>
      </div>
    );
  }


  const onConfirmDeposit = async () => {
    try {
      setLoadingDeposit(true);
      const sig = await actions.deposit(); // waits until tx is confirmed
      if (sig) {
        console.log('Deposit successful, signature:', sig);
        toast.success('Deposit successfully!');
        actions.setAmountDeposit(0);
        await sleep(3000);
        console.log('Start fetching balance');
        fetchBalances();
        fetchPoolState();
      }
    } catch (err: unknown) {

      toast.error(`Deposit Failed!`);
      console.error(err);
    }
    finally {
      setLoadingDeposit(false);
    }
  };
  const onConfirmWithdraw = async () => {
    try {
      setLoadingWithdraw(false);
      const sig = await actions.withdraw(); // waits until tx is confirmed
      if (sig) {
        console.log('Withdraw successful, signature:', sig);
        toast.success('Withdraw successfully!');
        await sleep(3000);
        console.log('Start fetching balance');
        fetchBalances();
        fetchPoolState();
        actions.setAmountWithdraw(0);
        setLoadingWithdraw(false);
      }
    } catch (err: unknown) {
      toast.error(`Deposit Failed!`);
      console.error(err);
    }
    finally {
      setLoadingWithdraw(false);
    }
  };

  const fetchPoolState = () => {
    if (!poolAddress || !program) return;
    getPoolState(program, new PublicKey(poolAddress)).then((data) => {
      console.log('On-chain pool data:', data);
      if (data) {
        setPool(data);
      }
    }).catch((err) => {
      console.error('Error fetching pool state:', err);
    });
  }

  return (
    <div id="dashView" className="">

      <div className="dh">

        <div className="dt">

          <div className="di">
            <svg height="18" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
          </div>
          <div>

            <div style={{ fontSize: "18px", fontWeight: "600" }} id="dashName">
              {bytesToString(pool.config.poolName)}
            </div>
            <a
              target='_blank'
              href={`https://solscan.io/address/${poolAddress}?cluster=devnet`}
              className="text-[12px] text-purple-500 no-underline"
            >
              View on Explorer
            </a>
            <div style={{ fontSize: "12px", color: "var(--gt)", cursor: 'pointer' }} onClick={() => copyToClipboard(`${window.location.origin}/pool/${poolAddress?.toString()}`)}>
              Share Pool
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>

          <span className="badge bg">Live on devnet</span>
          <span className="badge bpu" id="dashSym">
            {bytesToString(pool.config.tokenSymbol)}
          </span>
        </div>
      </div>
      <div className="card" style={{ marginBottom: "14px" }}>

        <div className="mg">

          <div className="m">
            <div className="ml">Price per share</div>
            <div className="mv" id="dPPS">
              $
              {pool.config.initialExchangeRate
                ? (
                  parseFloat(pool.config.initialExchangeRate.toString()) / 1e6
                ).toFixed(4)
                : "0.0000"}
            </div>
          </div>
          <div className="m">
            <div className="ml">TVL</div>
            <div className="mv" id="dTVL">
              $0.00
            </div>
          </div>
          <div className="m">
            <div className="ml">Target APY</div>
            <div className="mv gr" id="dAPY">
              {pool.config.targetApyBps / 1000}%
            </div>
          </div>
          <div className="m">
            <div className="ml">Shares in circulation</div>
            <div className="mv" id="dShares">
              {parseFloat(pool.totalIptSupply.toString()) / 10 ** USDC_DECIMALS}
            </div>
          </div>
        </div>
        <div className="ag">
          <div className="ac">
            <h4>Deposit USDC</h4>
            <p className="mb-4 text-sm">
              Balance: {getFormattedPrice(parseFloat(depositBalance))} USDC
            </p>
            <div className="ai">

              <input
                type="number"
                id="depAmt"
                placeholder="Enter amount"
                min="0.01"
                step="0.01"
                value={
                  Number.isFinite(actions.amountDeposit)
                    ? actions.amountDeposit
                    : ""
                }
                onChange={(e) =>
                  actions.setAmountDeposit(parseFloat(e.target.value))
                }
              />
              <button
                className="ab d"
                onClick={onConfirmDeposit}
                disabled={loadingDeposit}
              >

                {loadingDeposit ? "Processing..." : "Deposit"}
              </button>
            </div>
            <div className="pt" id="depP">
              Enter amount to preview
            </div>
          </div>
          <div className="ac">

            <h4>Withdraw</h4>
            <p className="mb-4 text-sm">
              Balance: {getFormattedPrice(parseFloat(balanceTOKEN))} {bytesToString(pool.config.tokenSymbol)}
            </p>
            <div className="ai">

              <input
                type="number"
                id="wdAmt"
                placeholder="Enter shares"
                min="0.01"
                step="0.01"
                value={
                  Number.isFinite(actions.amountWithdraw)
                    ? actions.amountWithdraw
                    : ""
                }
                onChange={(e) =>
                  actions.setAmountWithdraw(parseFloat(e.target.value))
                }
              />
              <button
                disabled={loadingWithdraw}
                className="ab w"
                onClick={() => onConfirmWithdraw()}
              >

                {loadingWithdraw ? "Processing..." : "Withdraw"}
              </button>
            </div>
            <div className="pt" id="wdP">
              Enter shares to preview
            </div>
          </div>
        </div>
        <div className="card" style={{ marginTop: "20px" }}>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >

            <div style={{ fontSize: "15px", fontWeight: "600" }}>
              Your position
            </div>
            {/* <span className="badge bgr" id="posL">No position</span> */}
          </div>
          <div className="fr3">

            <div className="m">
              <div className="ml">Your shares</div>
              <div className="mv" id="uShares">

                {getFormattedPrice(parseFloat(balanceTOKEN))}
              </div>
            </div>
            <div className="m">
              <div className="ml">Current value</div>
              <div className="mv" id="uVal">
                $
                {pool.config.initialExchangeRate
                  ? (
                    parseFloat(pool.config.initialExchangeRate.toString()) / 1e6
                  ).toFixed(4)
                  : "0.0000"}
              </div>
            </div>
            <div className="m">
              <div className="ml">Gain / loss</div>
              <div className="mv" id="uGain" style={{ color: "var(--gl)" }}>
                +$0.00
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IptDashboard;