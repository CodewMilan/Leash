// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IAuthorizedUSDT is IERC20 {
    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter,
        uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;
}

/// @notice Testnet gifting escrow. The attester is trusted to verify World ID off-chain.
contract ShagunVault is EIP712, ReentrancyGuard, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;
    enum State { Missing, Created, Claimed, Settled, Returned }
    struct Terms {
        address from;
        uint256 amount;
        uint256 expiry;
        bytes32 secretHash;
        bytes32 boundHuman;
        bytes32 campaignId;
        bytes32 salt;
    }
    struct Gift {
        address sender;
        uint256 amount;
        uint256 expiry;
        bytes32 secretHash;
        bytes32 boundHuman;
        bytes32 campaignId;
        bytes32 human;
        State state;
        uint256 spent;
    }
    bytes32 public constant TERMS_TYPEHASH = keccak256("GiftTerms(uint256 chainId,address vault,address from,uint256 amount,uint256 expiry,bytes32 secretHash,bytes32 boundHuman,bytes32 campaignId,bytes32 salt)");
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(bytes32 giftId,bytes32 human,bytes32 session,bytes32 nonce,uint256 deadline)");
    uint256 public constant MAX_GIFT = 1_000 * 1e6;
    /// @dev After this delay past expiry, anyone may return a claimed gift's unspent balance.
    uint256 public constant CLOSE_GRACE = 7 days;
    IAuthorizedUSDT public immutable usdt;
    address public relayer;
    address public attester;
    address public operator;
    address public immutable treasury;
    mapping(bytes32 => Gift) public gifts;
    mapping(bytes32 => bool) public campaignClaims;
    mapping(bytes32 => bool) public usedAttestations;
    mapping(bytes32 => bool) public usedSpendRefs;

    error Unauthorized();
    error InvalidGift();
    error WrongState();
    error Expired();
    error InvalidClaim();
    error AlreadyReceived();
    error DuplicateSpend();
    error ExceedsBalance();
    error NotExpired();
    event GiftCreated(bytes32 indexed giftId, address indexed sender, uint256 amount, uint256 expiry, bytes32 campaignId);
    event GiftClaimed(bytes32 indexed giftId, bytes32 indexed human);
    event CashOut(bytes32 indexed giftId, uint256 amount, bytes32 payoutRef);
    event Spent(bytes32 indexed giftId, uint256 amount, bytes32 indexed spendRef, uint256 remaining);
    event Returned(bytes32 indexed giftId, address indexed sender, uint256 amount);
    event RolesUpdated(address relayer, address attester, address operator);

    constructor(address token_, address relayer_, address attester_, address operator_, address treasury_, address admin_) EIP712("ShagunVault", "1") Ownable(admin_) {
        if (token_.code.length == 0 || relayer_ == address(0) || attester_ == address(0) || operator_ == address(0) || treasury_ == address(0)) revert InvalidGift();
        usdt = IAuthorizedUSDT(token_);
        relayer = relayer_; attester = attester_; operator = operator_; treasury = treasury_;
    }

    /// @notice A separate admin (preferably a multisig) can rotate compromised operational keys.
    function setRoles(address relayer_, address attester_, address operator_) external onlyOwner {
        if (relayer_ == address(0) || attester_ == address(0) || operator_ == address(0)) revert InvalidGift();
        relayer = relayer_; attester = attester_; operator = operator_;
        emit RolesUpdated(relayer_, attester_, operator_);
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @dev The EIP-3009 nonce commits to ALL gift terms, preserving one sender signature.
    function authorizationNonce(Terms calldata t) public view returns (bytes32) {
        return keccak256(abi.encode(TERMS_TYPEHASH, block.chainid, address(this), t.from, t.amount,
            t.expiry, t.secretHash, t.boundHuman, t.campaignId, t.salt));
    }

    function createGiftWithAuthorization(Terms calldata t, uint256 validAfter, uint256 validBefore, bytes calldata signature)
        external nonReentrant whenNotPaused returns (bytes32 giftId) {
        if (msg.sender != relayer) revert Unauthorized();
        if (t.from == address(0) || t.amount == 0 || t.amount > MAX_GIFT || t.expiry <= block.timestamp
            || t.expiry > block.timestamp + 30 days || t.secretHash == bytes32(0)) revert InvalidGift();
        giftId = authorizationNonce(t);
        if (gifts[giftId].state != State.Missing) revert WrongState();
        gifts[giftId] = Gift(t.from, t.amount, t.expiry, t.secretHash, t.boundHuman, t.campaignId, bytes32(0), State.Created, 0);
        if (signature.length != 65) revert InvalidGift();
        bytes32 r; bytes32 s; uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        usdt.receiveWithAuthorization(t.from, address(this), t.amount, validAfter, validBefore, giftId, v, r, s);
        emit GiftCreated(giftId, t.from, t.amount, t.expiry, t.campaignId);
    }

    function claim(bytes32 giftId, bytes32 secret, bytes32 human, bytes32 session, bytes32 nonce, uint256 deadline, bytes calldata signature)
        external nonReentrant whenNotPaused {
        if (msg.sender != relayer) revert Unauthorized();
        Gift storage g = gifts[giftId];
        if (g.state != State.Created) revert WrongState();
        if (block.timestamp >= g.expiry || block.timestamp > deadline) revert Expired();
        if (human == bytes32(0) || session == bytes32(0) || keccak256(abi.encodePacked(secret)) != g.secretHash
            || (g.boundHuman != bytes32(0) && g.boundHuman != human)) revert InvalidClaim();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, giftId, human, session, nonce, deadline)));
        if (usedAttestations[digest] || ECDSA.recover(digest, signature) != attester) revert InvalidClaim();
        usedAttestations[digest] = true;
        if (g.campaignId != bytes32(0)) {
            bytes32 key = keccak256(abi.encode(g.sender, g.campaignId, human));
            if (campaignClaims[key]) revert AlreadyReceived();
            campaignClaims[key] = true;
        }
        g.human = human; g.state = State.Claimed;
        emit GiftClaimed(giftId, human);
    }

    /// @notice Whole-gift settlement for a non-card redemption; one redemption mode per gift.
    function cashOut(bytes32 giftId, bytes32 payoutRef) external nonReentrant {
        if (msg.sender != operator) revert Unauthorized();
        Gift storage g = gifts[giftId];
        if (g.state != State.Claimed || g.spent != 0 || payoutRef == bytes32(0)) revert WrongState();
        g.state = State.Settled;
        IERC20(address(usdt)).safeTransfer(treasury, g.amount);
        emit CashOut(giftId, g.amount, payoutRef);
    }

    /// @notice Settles one cleared card transaction to the treasury. Clearings can arrive after
    /// expiry for purchases approved before it, so only closure stops spending.
    function spend(bytes32 giftId, uint256 amount, bytes32 spendRef) external nonReentrant {
        if (msg.sender != operator) revert Unauthorized();
        Gift storage g = gifts[giftId];
        if (g.state != State.Claimed || amount == 0 || spendRef == bytes32(0)) revert WrongState();
        if (usedSpendRefs[spendRef]) revert DuplicateSpend();
        if (amount > g.amount - g.spent) revert ExceedsBalance();
        usedSpendRefs[spendRef] = true;
        g.spent += amount;
        if (g.spent == g.amount) g.state = State.Settled;
        IERC20(address(usdt)).safeTransfer(treasury, amount);
        emit Spent(giftId, amount, spendRef, g.amount - g.spent);
    }

    /// @notice Returns a claimed gift's unspent balance to the sender after expiry. The operator
    /// closes once card holds are reconciled; anyone may close after CLOSE_GRACE.
    function closeClaimed(bytes32 giftId) external nonReentrant {
        Gift storage g = gifts[giftId];
        if (g.state != State.Claimed) revert WrongState();
        if (block.timestamp < g.expiry) revert NotExpired();
        if (msg.sender != operator && block.timestamp < g.expiry + CLOSE_GRACE) revert Unauthorized();
        uint256 remaining = g.amount - g.spent;
        g.state = State.Returned;
        IERC20(address(usdt)).safeTransfer(g.sender, remaining);
        emit Returned(giftId, g.sender, remaining);
    }

    /// @notice Permissionless, but a worker must submit this transaction after expiry.
    function refundExpired(bytes32 giftId) external nonReentrant {
        Gift storage g = gifts[giftId];
        if (g.state != State.Created) revert WrongState();
        if (block.timestamp < g.expiry) revert InvalidGift();
        g.state = State.Returned;
        IERC20(address(usdt)).safeTransfer(g.sender, g.amount);
        emit Returned(giftId, g.sender, g.amount);
    }
}
