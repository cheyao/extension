// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title RemoteControlDelegate
 * @notice EIP-7702 delegation target. An EOA delegates to this contract so that a
 *         remote "controller" can execute calls from the EOA, but only after:
 *           1. 2 of 3 hard-coded keys signed an access request for that controller,
 *           2. a 5 minute cooldown elapsed (during which the EOA can cancel/revoke).
 *
 * Design notes
 * - Code runs in the EOA's context: address(this) == the EOA, storage lives in the EOA.
 * - The 3 keys are immutables (embedded in bytecode at deployment). Deploy with CREATE2
 *   and identical constructor args on every chain to get the same delegate address.
 * - The EOA can ALWAYS revoke at protocol level by signing a new EIP-7702 authorization
 *   pointing to address(0). `revoke()` additionally wipes access + invalidates signatures.
 * - The EOA is "notified" via the AccessRequested event (see off-chain watcher note).
 */
contract RemoteControlDelegate {
    using ECDSA for bytes32;

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    /// @dev Namespaced storage (lives in the delegating EOA).
    struct Layout {
        address controller;
        uint64 unlockTime; // earliest time controller may execute
        uint64 expiresAt; // controller access ends here
        uint256 nonce; // replay protection for access requests
    }

    uint256 public constant COOLDOWN = 5 minutes;
    uint256 public constant EXECUTION_WINDOW = 1 hours;

    bytes32 private constant STORAGE_SLOT = keccak256("remotecontrol.delegate.storage.v1");

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ACCESS_TYPEHASH =
        keccak256("AccessRequest(address controller,uint256 nonce,uint256 deadline)");

    address private immutable KEY_A;
    address private immutable KEY_B;
    address private immutable KEY_C;

    event AccessRequested(
        address indexed account,
        address indexed controller,
        address signerA,
        address signerB,
        uint256 unlockTime,
        uint256 expiresAt
    );
    event AccessCancelled(address indexed account);
    event Revoked(address indexed account, uint256 newNonce);
    event Executed(address indexed account, address indexed caller, uint256 calls);

    error NotAuthorized();
    error InvalidKeys();
    error SignatureExpired();
    error NotEnoughDistinctKeys();
    error NotAKey();
    error CallFailed(uint256 index, bytes returndata);

    constructor(address a, address b, address c) {
        if (a == address(0) || b == address(0) || c == address(0)) revert InvalidKeys();
        if (a == b || a == c || b == c) revert InvalidKeys();
        KEY_A = a;
        KEY_B = b;
        KEY_C = c;
    }

    receive() external payable {}

    // ---------------------------------------------------------------------
    // Phase 1: gain access (permissionless to submit, gated by 2-of-3 sigs)
    // ---------------------------------------------------------------------

    /// @notice Start the cooldown for `controller`. Anyone may relay this tx.
    function requestAccess(address controller, uint256 deadline, bytes calldata sigA, bytes calldata sigB) external {
        if (block.timestamp > deadline) revert SignatureExpired();
        Layout storage l = _layout();

        bytes32 digest = _digest(controller, l.nonce, deadline);
        address signerA = digest.recover(sigA);
        address signerB = digest.recover(sigB);

        if (!_isKey(signerA) || !_isKey(signerB)) revert NotAKey();
        if (signerA == signerB) revert NotEnoughDistinctKeys();

        l.nonce++; // consume signatures
        l.controller = controller;
        l.unlockTime = uint64(block.timestamp + COOLDOWN);
        l.expiresAt = uint64(block.timestamp + COOLDOWN + EXECUTION_WINDOW);

        // Notification to the EOA owner (picked up by an off-chain watcher).
        emit AccessRequested(address(this), controller, signerA, signerB, l.unlockTime, l.expiresAt);
    }

    // ---------------------------------------------------------------------
    // Phase 2: execute (after cooldown) — or directly by the EOA itself
    // ---------------------------------------------------------------------

    function execute(Call[] calldata calls) external payable {
        if (msg.sender != address(this)) {
            Layout storage l = _layout();
            if (
                l.controller == address(0) || msg.sender != l.controller || block.timestamp < l.unlockTime
                    || block.timestamp >= l.expiresAt
            ) revert NotAuthorized();
        }

        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
        emit Executed(address(this), msg.sender, calls.length);
    }

    // ---------------------------------------------------------------------
    // EOA-only controls (msg.sender == address(this) means the EOA's own tx)
    // ---------------------------------------------------------------------

    /// @notice Cancel pending/active access (e.g. after seeing an AccessRequested alert).
    function cancelAccess() external {
        if (msg.sender != address(this)) revert NotAuthorized();
        Layout storage l = _layout();
        delete l.controller;
        delete l.unlockTime;
        delete l.expiresAt;
        emit AccessCancelled(address(this));
    }

    /// @notice Wipe access AND bump nonce so any outstanding signatures become useless.
    /// @dev To fully remove the delegation, also send an EIP-7702 authorization to address(0).
    function revoke() external {
        if (msg.sender != address(this)) revert NotAuthorized();
        Layout storage l = _layout();
        delete l.controller;
        delete l.unlockTime;
        delete l.expiresAt;
        l.nonce++;
        emit Revoked(address(this), l.nonce);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function accessState() external view returns (address controller, uint64 unlockTime, uint64 expiresAt, uint256 nonce) {
        Layout storage l = _layout();
        return (l.controller, l.unlockTime, l.expiresAt, l.nonce);
    }

    function domainSeparator() public view returns (bytes32) {
        // Computed dynamically: address(this) is the EOA, chainid varies per chain.
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("RemoteControlDelegate"), keccak256("1"), block.chainid, address(this))
        );
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _digest(address controller, uint256 nonce, uint256 deadline) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(ACCESS_TYPEHASH, controller, nonce, deadline));
        return MessageHashUtils.toTypedDataHash(domainSeparator(), structHash);
    }

    function _isKey(address s) internal view returns (bool) {
        return s == KEY_A || s == KEY_B || s == KEY_C;
    }

    function _layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
