// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHorrisUpDownCalldataGuard {
    struct Inspection {
        address market;
        uint256 collateralUsdt;
        uint256 notionalUsdE30;
        uint32 leverageBps;
        uint256 executionFee;
        bool isLong;
    }

    function inspectIncrease(
        address target,
        address expectedReceiver,
        uint256 msgValue,
        bytes calldata multicallData
    ) external view returns (Inspection memory result);
}

interface IHorrisPerpPolicyAuthorization {
    struct Proposal {
        bytes32 marketId;
        uint256 marginUsdE18;
        uint256 notionalUsdE18;
        uint256 accountBalanceUsdE18;
        uint32 leverageBps;
        uint16 stopDistanceBps;
    }

    function validate(Proposal calldata proposal)
        external
        view
        returns (uint16 accountRiskBps, uint16 marginUtilizationBps);
}

/// @title HorrisUpDownAuthorization
/// @notice Replay-safe EIP-712 authorization that binds signed risk context to exact inspected UpDown calldata.
/// @dev Does not execute trades. For policy validation, this contract must be configured as an authorized HorrisPerpPolicy agent.
contract HorrisUpDownAuthorization {
    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "Authorization(bytes32 calldataHash,address receiver,address market,uint256 accountBalanceUsdE18,uint16 stopDistanceBps,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("Horris UpDown Authorization");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public authorizer;
    IHorrisUpDownCalldataGuard public immutable guard;
    IHorrisPerpPolicyAuthorization public immutable policy;
    mapping(address => bytes32) public marketIds;
    mapping(uint256 => bool) public usedNonces;

    address public immutable owner;
    bool public paused;

    event MarketIdUpdated(address indexed market, bytes32 indexed marketId);
    event AuthorizerUpdated(address indexed previousAuthorizer, address indexed newAuthorizer);
    event NonceInvalidated(uint256 indexed nonce);
    event AuthorizationConsumed(
        bytes32 indexed calldataHash,
        uint256 indexed nonce,
        address indexed receiver,
        address market,
        uint256 notionalUsdE30,
        uint32 leverageBps,
        uint16 accountRiskBps,
        uint16 marginUtilizationBps
    );
    event PauseUpdated(bool paused);

    struct Authorization {
        bytes32 calldataHash;
        address receiver;
        address market;
        uint256 accountBalanceUsdE18;
        uint16 stopDistanceBps;
        uint256 nonce;
        uint256 deadline;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address authorizer_, address guard_, address policy_) {
        require(authorizer_ != address(0) && guard_ != address(0) && policy_ != address(0), "ZERO_ADDRESS");
        owner = msg.sender;
        authorizer = authorizer_;
        guard = IHorrisUpDownCalldataGuard(guard_);
        policy = IHorrisPerpPolicyAuthorization(policy_);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseUpdated(value);
    }

    function setAuthorizer(address nextAuthorizer) external onlyOwner {
        require(nextAuthorizer != address(0), "ZERO_AUTHORIZER");
        address previous = authorizer;
        require(nextAuthorizer != previous, "SAME_AUTHORIZER");
        authorizer = nextAuthorizer;
        emit AuthorizerUpdated(previous, nextAuthorizer);
    }

    function invalidateNonce(uint256 nonce) external onlyOwner {
        require(!usedNonces[nonce], "NONCE_USED");
        usedNonces[nonce] = true;
        emit NonceInvalidated(nonce);
    }

    function setMarketId(address market, bytes32 marketId) external onlyOwner {
        require(market != address(0) && marketId != bytes32(0), "BAD_MARKET_ID");
        marketIds[market] = marketId;
        emit MarketIdUpdated(market, marketId);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            NAME_HASH,
            VERSION_HASH,
            block.chainid,
            address(this)
        ));
    }

    function authorizationDigest(Authorization calldata auth) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            AUTHORIZATION_TYPEHASH,
            auth.calldataHash,
            auth.receiver,
            auth.market,
            auth.accountBalanceUsdE18,
            auth.stopDistanceBps,
            auth.nonce,
            auth.deadline
        ));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function consumeIncreaseAuthorization(
        address target,
        uint256 msgValue,
        bytes calldata multicallData,
        Authorization calldata auth,
        bytes calldata signature
    ) external returns (
        IHorrisUpDownCalldataGuard.Inspection memory inspection,
        uint16 accountRiskBps,
        uint16 marginUtilizationBps
    ) {
        require(!paused, "PAUSED");
        require(block.timestamp <= auth.deadline, "AUTH_EXPIRED");
        require(!usedNonces[auth.nonce], "NONCE_USED");
        require(auth.receiver != address(0), "ZERO_RECEIVER");
        require(auth.accountBalanceUsdE18 > 0, "ZERO_ACCOUNT_BALANCE");
        require(auth.stopDistanceBps > 0, "ZERO_STOP_DISTANCE");
        require(keccak256(multicallData) == auth.calldataHash, "CALLDATA_HASH_MISMATCH");
        require(_recover(authorizationDigest(auth), signature) == authorizer, "BAD_SIGNATURE");

        inspection = guard.inspectIncrease(target, auth.receiver, msgValue, multicallData);
        require(inspection.market == auth.market, "MARKET_MISMATCH");
        bytes32 marketId = marketIds[inspection.market];
        require(marketId != bytes32(0), "MARKET_ID_UNSET");

        uint256 marginUsdE18 = inspection.collateralUsdt * 1e12;
        uint256 notionalUsdE18 = inspection.notionalUsdE30 / 1e12;
        require(notionalUsdE18 * 1e12 == inspection.notionalUsdE30, "NOTIONAL_PRECISION");

        IHorrisPerpPolicyAuthorization.Proposal memory proposal = IHorrisPerpPolicyAuthorization.Proposal({
            marketId: marketId,
            marginUsdE18: marginUsdE18,
            notionalUsdE18: notionalUsdE18,
            accountBalanceUsdE18: auth.accountBalanceUsdE18,
            leverageBps: inspection.leverageBps,
            stopDistanceBps: auth.stopDistanceBps
        });

        (accountRiskBps, marginUtilizationBps) = policy.validate(proposal);

        usedNonces[auth.nonce] = true;
        emit AuthorizationConsumed(
            auth.calldataHash,
            auth.nonce,
            auth.receiver,
            inspection.market,
            inspection.notionalUsdE30,
            inspection.leverageBps,
            accountRiskBps,
            marginUtilizationBps
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        require(signature.length == 65, "BAD_SIGNATURE_LENGTH");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require(uint256(s) <= SECP256K1N_HALF, "HIGH_S");
        require(v == 27 || v == 28, "BAD_V");
        signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "ECDSA_ZERO");
    }
}
