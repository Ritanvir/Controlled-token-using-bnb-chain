# ControlledToken Local UI (No DAO)

A simple React + Vite UI to interact with a **ControlledToken** smart contract on a **Hardhat local network (chainId: 31337)** using **MetaMask** and **ethers v6**.

This UI supports:
- View token symbol / decimals / balance
- Transfer tokens
- Admin controls: Trading toggle, Whitelist update, Freeze / Unfreeze wallets
- Vesting: Create vesting (admin), Claim vested tokens (user)

---

## Tech Stack

- Vite + React
- ethers (v6)
- MetaMask
- Hardhat (local node)

---

## Prerequisites

- Node.js (LTS recommended)
- MetaMask installed in browser
- Hardhat node running locally (`chainId = 31337`)
- Deployed `ControlledToken` contract address
- Contract ABI available in the UI project

---

## Project Structure (example)

token-ui/
src/
App.jsx
abi.js # ABI exported from here (recommended)
main.jsx
index.css

yaml
Copy code

>  Recommended: keep ABI in `src/abi.js` instead of importing JSON artifacts directly.

---

## Install & Run

### 1) Install dependencies
```bash
npm install
2) Start the UI
bash
Copy code
npm run dev
Open:

http://localhost:5173

Hardhat Local Setup
1) Run hardhat node
In your smart-contract repo:

bash
Copy code
npx hardhat node
This starts local RPC at:

http://127.0.0.1:8545

chainId: 31337

2) Deploy the contract
Example:

bash
Copy code
npx hardhat run scripts/deploy.js --network localhost
Copy the deployed contract address and set it in src/App.jsx:

js
Copy code
const TOKEN_ADDRESS = "0x..."; // your deployed token address
const HARDHAT_CHAIN_ID = 31337;
MetaMask Setup
Add local network in MetaMask:

Network name: Hardhat Local

RPC URL: http://127.0.0.1:8545

Chain ID: 31337

Currency symbol: ETH

Import a Hardhat test account into MetaMask
Use any private key shown in Hardhat node logs.

ABI Setup (Important)
Option A (Recommended): Use src/abi.js
Create src/abi.js:

js
Copy code
// src/abi.js
export const CONTROLLED_TOKEN_ABI = [
  // Paste your contract ABI array here
];
Then in App.jsx, import like:

js
Copy code
import { CONTROLLED_TOKEN_ABI } from "./abi";
and create contract like:

js
Copy code
const c = new ethers.Contract(TOKEN_ADDRESS, CONTROLLED_TOKEN_ABI, signer);
 This avoids Vite JSON import issues and keeps the UI clean.

Features & How to Use
1) Connect MetaMask

Click Connect MetaMask.

The UI will:

Request account access

Warn if not on chainId 31337

Load token meta + balance

Read tradingEnabled

2) Transfer

Enter recipient address

Enter amount (human format, e.g. 10)

Click Send

3) Admin: Trading Toggle

Shows current tradingEnabled status.

Click Toggle Trading

Requires connected wallet to be contract admin/owner (depending on contract logic).

4) Admin: Whitelist

Enter wallet address

Check/uncheck whitelist boolean

Click Update Whitelist

Only admin can update whitelist.

5) Admin: Freeze / Unfreeze

Freeze:

Enter wallet address

Enter seconds

0 = permanent freeze

Click Freeze

Unfreeze:

Enter same wallet address

Click Unfreeze

Only admin can freeze/unfreeze.

6) Vesting

Create vesting (admin):

beneficiary address

amount

start datetime (optional)

cliff seconds (e.g. 86400)

duration seconds (e.g. 2592000)
Click Create Vesting (admin)

Claim vesting (user):

Click Claim My Vesting

Common Issues
Blank page / nothing renders

Check browser console for errors.
Common reasons:

ABI import/export mismatch

Missing ABI file

Wrong import name in abi.js

Example error:

does not provide an export named 'CONTROLLED_TOKEN_ABI'

Fix:
Ensure abi.js exports exactly:

export const CONTROLLED_TOKEN_ABI = [...]


and App.jsx imports:

import { CONTROLLED_TOKEN_ABI } from "./abi";

Wrong network

If MetaMask is not on 31337, contract calls will fail.
Switch to Hardhat Local network.

Transaction fails (revert)

Likely causes:

Not admin for admin-only functions

Trading disabled and transfer restricted

Address frozen

Whitelist restrictions

Not enough balance

Security Notes

This UI is meant for local development/testing.
Do not use it for mainnet without:

proper RPC config

production security review

verified & audited contract

