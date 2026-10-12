// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StableCoin.sol";

/// @notice Sepolia lab engine. The loss simulator is an owner-only lab backdoor;
/// it must never be reused in a production or real-value deployment.
contract StableEngine is ReentrancyGuard {
    uint256 public constant PRECISION = 1e18;
    uint256 public constant COLLATERALIZATION_RATIO = 150;
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;
    uint256 public immutable LIQUIDATION_BONUS_PERCENT;
    uint256 public constant MAX_PRICE_AGE = 2 days;

    StableCoin public immutable stablecoin;
    AggregatorV3Interface public immutable priceFeed;
    uint8 public immutable feedDecimals;
    address public immutable labOwner;
    bool public testCollateralLossUsed;
    mapping(address => uint256) public collateralDeposited;
    mapping(address => uint256) public debt;

    event CollateralDeposited(address indexed user, uint256 amount);
    event StablecoinMinted(address indexed user, uint256 amount);
    event StablecoinBurned(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed liquidator, address indexed borrower, uint256 debtRepaid, uint256 collateralSeized);
    event TestCollateralLoss(address indexed borrower, uint256 amount);

    error InvalidPrice();
    error StalePrice();
    error ZeroAmount();
    error UnhealthyPositionRequired();
    error HealthFactorTooLow(uint256 healthFactor);
    error InsufficientCollateral();
    error EthTransferFailed();

    constructor(address token_, address feed_, uint256 bonusPercent_) {
        require(token_ != address(0) && feed_ != address(0), "Invalid address");
        require(bonusPercent_ <= 50, "Bonus too high");
        stablecoin = StableCoin(token_);
        labOwner = msg.sender;
        priceFeed = AggregatorV3Interface(feed_);
        uint8 decimals_ = AggregatorV3Interface(feed_).decimals();
        require(decimals_ <= 18, "Unsupported feed decimals");
        feedDecimals = decimals_;
        LIQUIDATION_BONUS_PERCENT = bonusPercent_;
    }

    function depositCollateral() external payable {
        if (msg.value == 0) revert ZeroAmount();
        collateralDeposited[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function mintStablecoin(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        debt[msg.sender] += amount;
        _revertIfHealthFactorIsBroken(msg.sender);
        stablecoin.mint(msg.sender, amount);
        emit StablecoinMinted(msg.sender, amount);
    }

    function burnStablecoin(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        require(amount <= debt[msg.sender], "Repay exceeds debt");
        debt[msg.sender] -= amount;
        stablecoin.burn(msg.sender, amount);
        emit StablecoinBurned(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > collateralDeposited[msg.sender]) revert InsufficientCollateral();
        collateralDeposited[msg.sender] -= amount;
        _revertIfHealthFactorIsBroken(msg.sender);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function getUsdValue(uint256 ethAmountWei) public view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();
        if (answer <= 0 || roundId == 0 || answeredInRound < roundId) revert InvalidPrice();
        if (updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > MAX_PRICE_AGE) revert StalePrice();
        uint256 normalizedPrice = uint256(answer) * (10 ** (18 - feedDecimals));
        return (ethAmountWei * normalizedPrice) / PRECISION;
    }

    function getCollateralValueUsd(address user) public view returns (uint256) {
        return getUsdValue(collateralDeposited[user]);
    }

    function getHealthFactor(address user) public view returns (uint256) {
        if (debt[user] == 0) return type(uint256).max;
        uint256 adjustedCollateral = (getCollateralValueUsd(user) * 100) / COLLATERALIZATION_RATIO;
        return (adjustedCollateral * PRECISION) / debt[user];
    }

    function maxMintable(address user, uint256 targetHealthFactor) external view returns (uint256) {
        require(targetHealthFactor >= MIN_HEALTH_FACTOR, "Target HF below one");
        uint256 adjustedCollateral = (getCollateralValueUsd(user) * 100) / COLLATERALIZATION_RATIO;
        return (adjustedCollateral * PRECISION) / targetHealthFactor;
    }

    function liquidate(address borrower, uint256 debtToCover) external nonReentrant {
        if (debtToCover == 0) revert ZeroAmount();
        if (getHealthFactor(borrower) >= MIN_HEALTH_FACTOR) revert UnhealthyPositionRequired();
        require(debtToCover <= debt[borrower], "Cover exceeds debt");
        uint256 baseCollateral = (debtToCover * PRECISION) / _getPriceWad();
        uint256 bonusCollateral = (baseCollateral * LIQUIDATION_BONUS_PERCENT) / 100;
        uint256 collateralSeized = baseCollateral + bonusCollateral;
        if (collateralSeized > collateralDeposited[borrower]) revert InsufficientCollateral();
        debt[borrower] -= debtToCover;
        collateralDeposited[borrower] -= collateralSeized;
        stablecoin.burn(msg.sender, debtToCover);
        (bool ok,) = payable(msg.sender).call{value: collateralSeized}("");
        if (!ok) revert EthTransferFailed();
        emit Liquidated(msg.sender, borrower, debtToCover, collateralSeized);
    }

    /// @dev Lab-only controlled fault injection to make an otherwise healthy position liquidatable.
    /// Never deploy or retain this backdoor in a real protocol.
    function simulateCollateralLoss(address borrower, uint256 amount) external {
        require(msg.sender == labOwner, "Only lab owner");
        require(!testCollateralLossUsed, "Lab simulation already used");
        if (amount == 0 || amount >= collateralDeposited[borrower]) revert InsufficientCollateral();
        testCollateralLossUsed = true;
        collateralDeposited[borrower] -= amount;
        emit TestCollateralLoss(borrower, amount);
    }

    function _getPriceWad() internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > MAX_PRICE_AGE) revert StalePrice();
        return uint256(answer) * (10 ** (18 - feedDecimals));
    }

    function _revertIfHealthFactorIsBroken(address user) internal view {
        uint256 factor = getHealthFactor(user);
        if (factor < MIN_HEALTH_FACTOR) revert HealthFactorTooLow(factor);
    }

    receive() external payable { revert("Use depositCollateral"); }
}
