// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    ControlledToken (BNB Chain / BSC) - Single contract
    Features:
    - ERC20/BEP20 token
    - Buy/Sell limits (DEX aware)
    - Whitelist
    - Freeze / blacklist (temporary or permanent)
    - Vesting (in-token)
    - Admin stabilization tool: stable -> token buyback (manual)
    - Pausable (admin emergency)
*/

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPancakeRouter {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;
}

interface IPancakePair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

contract ControlledToken is ERC20, AccessControl, Pausable, ReentrancyGuard {
    // ---------------- ROLES ----------------
    bytes32 public constant OPERATOR_ROLE   = keccak256("OPERATOR_ROLE");   // trading/limits/whitelist/vesting
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE"); // freeze/unfreeze
    bytes32 public constant TREASURY_ROLE   = keccak256("TREASURY_ROLE");   // stabilization tool
    bytes32 public constant PAUSER_ROLE     = keccak256("PAUSER_ROLE");     // pause/unpause

    // ---------------- STATE ----------------
    mapping(address => bool) public ammPairs;
    mapping(address => bool) public isWhitelisted;
    mapping(address => uint256) public freezeUntil;

    bool public tradingEnabled;

    uint256 public maxTxAmount;
    uint256 public maxBuyAmount;
    uint256 public maxSellAmount;
    uint256 public maxWalletAmount;

    bool public cooldownEnabled;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastTxTime;

    // ---------------- VESTING ----------------
    struct Vesting {
        uint256 total;
        uint256 released;
        uint256 start;
        uint256 cliff;
        uint256 duration;
        uint256 slice;   // kept for future; current claim uses linear schedule
        bool revocable;  // kept for future; not used in this minimal version
        bool revoked;    // kept for future; not used in this minimal version
    }

    mapping(address => Vesting) public vesting;
    uint256 public totalVestingLocked;

    // ---------------- STABILIZATION ----------------
    IPancakeRouter public router;
    address public stableToken;
    address public mainPair;

    // ---------------- EVENTS ----------------
    event TradingEnabled(bool enabled);
    event AmmPairUpdated(address pair, bool status);
    event WhitelistUpdated(address wallet, bool status);
    event Frozen(address wallet, uint256 until);
    event Unfrozen(address wallet);

    event VestingCreated(address user, uint256 amount);
    event VestingClaimed(address user, uint256 amount);

    event StabilizeBuyback(uint256 stableIn, uint256 minOut, uint256 deadline);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply,
        address admin
    ) ERC20(name_, symbol_) {
        require(admin != address(0), "admin=0");

        _mint(admin, supply);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        // default limits: no restriction initially
        maxTxAmount = supply;
        maxBuyAmount = supply;
        maxSellAmount = supply;
        maxWalletAmount = supply;
    }

    // ---------------- ADMIN ----------------
    function setTradingEnabled(bool e) external onlyRole(OPERATOR_ROLE) {
        tradingEnabled = e;
        emit TradingEnabled(e);
    }

    function setAmmPair(address pair, bool v) external onlyRole(OPERATOR_ROLE) {
        require(pair != address(0), "pair=0");
        ammPairs[pair] = v;
        emit AmmPairUpdated(pair, v);
    }

    function setWhitelist(address w, bool v) external onlyRole(OPERATOR_ROLE) {
        require(w != address(0), "wallet=0");
        isWhitelisted[w] = v;
        emit WhitelistUpdated(w, v);
    }

    function setLimits(
        uint256 _maxTx,
        uint256 _maxBuy,
        uint256 _maxSell,
        uint256 _maxWallet
    ) external onlyRole(OPERATOR_ROLE) {
        require(_maxTx > 0 && _maxBuy > 0 && _maxSell > 0 && _maxWallet > 0, "bad limits");
        maxTxAmount = _maxTx;
        maxBuyAmount = _maxBuy;
        maxSellAmount = _maxSell;
        maxWalletAmount = _maxWallet;
    }

    function setCooldown(bool enabled, uint256 seconds_) external onlyRole(OPERATOR_ROLE) {
        cooldownEnabled = enabled;
        cooldownSeconds = seconds_;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------- COMPLIANCE ----------------
    function freeze(address w, uint256 sec) external onlyRole(COMPLIANCE_ROLE) {
        require(w != address(0), "wallet=0");
        freezeUntil[w] = sec == 0 ? type(uint256).max : block.timestamp + sec;
        emit Frozen(w, freezeUntil[w]);
    }

    function unfreeze(address w) external onlyRole(COMPLIANCE_ROLE) {
        freezeUntil[w] = 0;
        emit Unfrozen(w);
    }

    function isFrozen(address w) public view returns (bool) {
        uint256 u = freezeUntil[w];
        return u != 0 && (u == type(uint256).max || block.timestamp < u);
    }

    // ---------------- VESTING ----------------
    function createVesting(
        address user,
        uint256 amount,
        uint256 start,
        uint256 cliff,
        uint256 duration
    ) external onlyRole(OPERATOR_ROLE) {
        require(user != address(0), "user=0");
        require(amount > 0, "amount=0");
        require(duration > 0, "duration=0");

        // pull tokens into contract
        _transfer(msg.sender, address(this), amount);

        vesting[user] = Vesting({
            total: amount,
            released: 0,
            start: start,
            cliff: cliff,
            duration: duration,
            slice: 0,
            revocable: false,
            revoked: false
        });

        totalVestingLocked += amount;
        emit VestingCreated(user, amount);
    }

    function claimVested() external nonReentrant {
        Vesting storage v = vesting[msg.sender];
        require(v.total > 0, "no vesting");

        uint256 vested;
        if (block.timestamp < v.start + v.cliff) {
            vested = 0;
        } else if (block.timestamp >= v.start + v.duration) {
            vested = v.total;
        } else {
            vested = (v.total * (block.timestamp - v.start)) / v.duration;
        }

        require(vested >= v.released, "bad state");
        uint256 claim = vested - v.released;
        require(claim > 0, "nothing");

        v.released += claim;
        totalVestingLocked -= claim;

        _transfer(address(this), msg.sender, claim);
        emit VestingClaimed(msg.sender, claim);
    }

    // ---------------- STABILIZATION ----------------
    function setStabilizationConfig(address r, address s, address p) external onlyRole(TREASURY_ROLE) {
        require(r != address(0), "router=0");
        require(s != address(0), "stable=0");
        require(p != address(0), "pair=0");
        router = IPancakeRouter(r);
        stableToken = s;
        mainPair = p;
    }

    function stabilizeBuyback(
    uint256 stableIn,
    uint256 minOut,
    uint256 deadline
) external onlyRole(TREASURY_ROLE) nonReentrant {
    require(address(router) != address(0), "router=0");
    require(stableToken != address(0), "stable=0");
    require(deadline >= block.timestamp, "deadline");

    // Approve stable token to router
    IERC20(stableToken).approve(address(router), stableIn);

    // ✅ Correct declaration + allocation of path array
    address[] memory path = new address[](2);
    path[0] = stableToken;
    path[1] = address(this);

    router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        stableIn,
        minOut,
        path,
        address(this),
        deadline
    );

    emit StabilizeBuyback(stableIn, minOut, deadline);
}

    // ---------------- TRANSFER HOOK ----------------
    function _update(address from, address to, uint256 amount)
        internal
        override
        whenNotPaused
    {
        // mint/burn bypass
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }

        require(!isFrozen(from) && !isFrozen(to), "frozen");

        bool fromWhite = isWhitelisted[from];
        bool toWhite = isWhitelisted[to];

        bool isBuy = ammPairs[from] && !ammPairs[to];
        bool isSell = ammPairs[to] && !ammPairs[from];

        // pre-launch: only whitelisted transfers allowed
        if (!tradingEnabled) {
            require(fromWhite || toWhite, "trading off");
        }

        // cooldown (optional)
        if (cooldownEnabled && !(fromWhite || toWhite)) {
            if (!ammPairs[from]) {
                require(block.timestamp >= lastTxTime[from] + cooldownSeconds, "cooldown");
                lastTxTime[from] = block.timestamp;
            }
        }

        // max tx
        if (!(fromWhite || toWhite)) {
            require(amount <= maxTxAmount, "maxTx");
        }

        // buy/sell limits
        if (isBuy && !toWhite) {
            require(amount <= maxBuyAmount, "maxBuy");
        }
        if (isSell && !fromWhite) {
            require(amount <= maxSellAmount, "maxSell");
        }

        // max wallet
        if (!ammPairs[to] && to != address(this) && !toWhite) {
            require(balanceOf(to) + amount <= maxWalletAmount, "maxWallet");
        }

        super._update(from, to, amount);
    }
}
