import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { CONTROLLED_TOKEN_ABI } from "./abi";

const TOKEN_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // deploy output
const HARDHAT_CHAIN_ID = 31337;

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);

  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(18);
  const [balance, setBalance] = useState("0");

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  // admin actions
  const [trading, setTrading] = useState(false);
  const [wlAddr, setWlAddr] = useState("");
  const [wlVal, setWlVal] = useState(true);

  const [freezeAddr, setFreezeAddr] = useState("");
  const [freezeSeconds, setFreezeSeconds] = useState("0");

  // vesting
  const [vestAddr, setVestAddr] = useState("");
  const [vestAmount, setVestAmount] = useState("");
  const [vestStart, setVestStart] = useState("");
  const [vestCliff, setVestCliff] = useState("0");
  const [vestDuration, setVestDuration] = useState("0");

  const [busy, setBusy] = useState(false);

  const connected = useMemo(
    () => !!(provider && signer && contract && account),
    [provider, signer, contract, account]
  );

  function prettyError(err) {
    return (
      err?.shortMessage ||
      err?.reason ||
      err?.message ||
      String(err || "Unknown error")
    );
  }

  async function refreshBalance(c = contract, addr = account, dec = decimals) {
    if (!c || !addr) return;
    const b = await c.balanceOf(addr);
    setBalance(ethers.formatUnits(b, dec));
  }

  async function loadTokenMeta(c, addr) {
    const [sym, dec, bal, tr] = await Promise.all([
      c.symbol(),
      c.decimals(),
      c.balanceOf(addr),
      c.tradingEnabled(),
    ]);
    const decN = Number(dec);
    setSymbol(sym);
    setDecimals(decN);
    setBalance(ethers.formatUnits(bal, decN));
    setTrading(Boolean(tr));
  }

  async function connect() {
    try {
      if (!window.ethereum) {
        alert("MetaMask install koro");
        return;
      }
      if (!CONTROLLED_TOKEN_ABI?.length) {
        alert("abi.js এ ABI বসানো হয়নি (CONTROLLED_TOKEN_ABI খালি)");
        return;
      }

      setBusy(true);

      const p = new ethers.BrowserProvider(window.ethereum);
      await p.send("eth_requestAccounts", []);
      const net = await p.getNetwork();

      if (Number(net.chainId) !== HARDHAT_CHAIN_ID) {
        alert("Network Hardhat Local (chainId 31337) select koro");
      }

      const s = await p.getSigner();
      const addr = await s.getAddress();

      const c = new ethers.Contract(TOKEN_ADDRESS, CONTROLLED_TOKEN_ABI, s);

      setProvider(p);
      setSigner(s);
      setAccount(addr);
      setContract(c);

      await loadTokenMeta(c, addr);
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function doTransfer() {
    try {
      if (!contract) return;
      if (!ethers.isAddress(to)) return alert("Invalid 'to' address");
      setBusy(true);

      const v = ethers.parseUnits(amount || "0", decimals);
      const tx = await contract.transfer(to, v);
      await tx.wait();

      await refreshBalance();
      alert("Transfer done");
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTrading() {
    try {
      if (!contract) return;
      setBusy(true);

      const tx = await contract.setTradingEnabled(!trading);
      await tx.wait();

      const tr = await contract.tradingEnabled();
      setTrading(Boolean(tr));
      alert("Trading toggled");
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function updateWhitelist() {
    try {
      if (!contract) return;
      if (!ethers.isAddress(wlAddr)) return alert("Invalid whitelist address");
      setBusy(true);

      const tx = await contract.setWhitelist(wlAddr, wlVal);
      await tx.wait();

      alert("Whitelist updated");
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function freezeWallet() {
    try {
      if (!contract) return;
      if (!ethers.isAddress(freezeAddr)) return alert("Invalid freeze address");
      setBusy(true);

      const sec = BigInt(freezeSeconds || "0");
      const tx = await contract.freeze(freezeAddr, sec);
      await tx.wait();

      alert("Freeze done (0 = permanent)");
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function unfreezeWallet() {
    try {
      if (!contract) return;
      if (!ethers.isAddress(freezeAddr)) return alert("Invalid freeze address");
      setBusy(true);

      const tx = await contract.unfreeze(freezeAddr);
      await tx.wait();

      alert("Unfreeze done");
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function createVesting() {
    try {
      if (!contract) return;
      if (!ethers.isAddress(vestAddr)) return alert("Invalid beneficiary address");
      setBusy(true);

      const startTs = vestStart
        ? BigInt(Math.floor(new Date(vestStart).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000));

      const amt = ethers.parseUnits(vestAmount || "0", decimals);
      const cliff = BigInt(vestCliff || "0");
      const duration = BigInt(vestDuration || "0");

      const tx = await contract.createVesting(vestAddr, amt, startTs, cliff, duration);
      await tx.wait();

      alert("Vesting created");
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function claimVesting() {
    try {
      if (!contract) return;
      setBusy(true);

      const tx = await contract.claimVested();
      await tx.wait();

      await refreshBalance();
      alert("Vesting claimed");
    } catch (e) {
      alert(prettyError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = async (accounts) => {
      try {
        if (!accounts?.length) {
          setAccount("");
          setContract(null);
          setSigner(null);
          setProvider(null);
          return;
        }
        if (!provider) return;

        const s = await provider.getSigner();
        const addr = await s.getAddress();

        const c = new ethers.Contract(TOKEN_ADDRESS, CONTROLLED_TOKEN_ABI, s);

        setSigner(s);
        setAccount(addr);
        setContract(c);

        await loadTokenMeta(c, addr);
      } catch (e) {
        console.error(e);
      }
    };

    const onChainChanged = () => window.location.reload();

    window.ethereum.on?.("accountsChanged", onAccountsChanged);
    window.ethereum.on?.("chainChanged", onChainChanged);

    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", onChainChanged);
    };
  }, [provider]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 900 }}>
      <h2>ControlledToken Local UI (No DAO)</h2>

      <button onClick={connect} disabled={busy}>
        {connected ? "Connected" : "Connect MetaMask"}
      </button>

      {account && (
        <>
          <p><b>Account:</b> {account}</p>
          <p><b>Token:</b> {symbol} (decimals: {decimals})</p>
          <p><b>Balance:</b> {balance} {symbol}</p>

          <button onClick={() => refreshBalance()} disabled={busy}>
            Refresh Balance
          </button>

          <hr />

          <h3>Transfer</h3>
          <input
            placeholder="to address"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: "100%" }}
          />
          <input
            placeholder="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: "100%", marginTop: 8 }}
          />
          <button onClick={doTransfer} style={{ marginTop: 8 }} disabled={busy}>
            Send
          </button>

          <hr />

          <h3>Admin: Trading</h3>
          <p><b>tradingEnabled:</b> {String(trading)}</p>
          <button onClick={toggleTrading} disabled={busy}>
            Toggle Trading
          </button>

          <hr />

          <h3>Admin: Whitelist</h3>
          <input
            placeholder="wallet address"
            value={wlAddr}
            onChange={(e) => setWlAddr(e.target.value)}
            style={{ width: "100%" }}
          />
          <label style={{ display: "block", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={wlVal}
              onChange={(e) => setWlVal(e.target.checked)}
            />
            Whitelist = true
          </label>
          <button onClick={updateWhitelist} style={{ marginTop: 8 }} disabled={busy}>
            Update Whitelist
          </button>

          <hr />

          <h3>Admin: Freeze / Unfreeze</h3>
          <input
            placeholder="wallet address"
            value={freezeAddr}
            onChange={(e) => setFreezeAddr(e.target.value)}
            style={{ width: "100%" }}
          />
          <input
            placeholder="seconds (0 = permanent)"
            value={freezeSeconds}
            onChange={(e) => setFreezeSeconds(e.target.value)}
            style={{ width: "100%", marginTop: 8 }}
          />
          <button onClick={freezeWallet} style={{ marginTop: 8 }} disabled={busy}>
            Freeze
          </button>
          <button onClick={unfreezeWallet} style={{ marginLeft: 8, marginTop: 8 }} disabled={busy}>
            Unfreeze
          </button>

          <hr />

          <h3>Vesting</h3>
          <input
            placeholder="beneficiary address"
            value={vestAddr}
            onChange={(e) => setVestAddr(e.target.value)}
            style={{ width: "100%" }}
          />
          <input
            placeholder="amount"
            value={vestAmount}
            onChange={(e) => setVestAmount(e.target.value)}
            style={{ width: "100%", marginTop: 8 }}
          />
          <input
            placeholder="start datetime (optional) e.g. 2026-01-10T12:00"
            value={vestStart}
            onChange={(e) => setVestStart(e.target.value)}
            style={{ width: "100%", marginTop: 8 }}
          />
          <input
            placeholder="cliff seconds (e.g. 0 or 86400)"
            value={vestCliff}
            onChange={(e) => setVestCliff(e.target.value)}
            style={{ width: "100%", marginTop: 8 }}
          />
          <input
            placeholder="duration seconds (e.g. 2592000)"
            value={vestDuration}
            onChange={(e) => setVestDuration(e.target.value)}
            style={{ width: "100%", marginTop: 8 }}
          />

          <button onClick={createVesting} style={{ marginTop: 8 }} disabled={busy}>
            Create Vesting (admin)
          </button>
          <button onClick={claimVesting} style={{ marginLeft: 8, marginTop: 8 }} disabled={busy}>
            Claim My Vesting
          </button>
        </>
      )}
    </div>
  );
}

