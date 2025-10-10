// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DebtToken
 * @dev 增强版ERC-3643合规债权代币，展示真正的ERC-3643核心特性。
 * 此合约演示了身份验证和合规声明系统。
 *
 * 新增的ERC-3643核心特点：
 * 1. 身份注册表 (Identity Registry)：管理投资者的链上身份
 * 2. 合规声明系统 (Claims Registry)：验证投资者的合规资格
 * 3. 角色分离：发行方、合规官、转账代理的权限分离
 * 4. 复杂合规规则：基于声明的多层验证
 *
 * 保留的基础特点：
 * - 债权生命周期管理
 * - 基于身份的转账限制
 * - 发行方特权管理
 */

// 身份注册表接口
interface IIdentityRegistry {
    function isVerified(address user) external view returns (bool);
    function getIdentity(address user) external view returns (address);
}

// 合规声明注册表接口  
interface IClaimsRegistry {
    function hasClaim(address identity, bytes32 claimType) external view returns (bool);
    function getClaim(address identity, bytes32 claimType) external view returns (bytes32);
}

contract DebtToken is ERC20, Ownable {
    // === ERC-3643 核心组件 ===
    IIdentityRegistry public identityRegistry;
    IClaimsRegistry public claimsRegistry;
    
    // 合规声明类型常量
    bytes32 public constant KYC_CLAIM = keccak256("KYC_VERIFIED");
    bytes32 public constant ACCREDITED_CLAIM = keccak256("ACCREDITED_INVESTOR");
    bytes32 public constant COUNTRY_CLAIM = keccak256("COUNTRY_ALLOWED");
    
    // 角色管理
    address public complianceOfficer;
    address public transferAgent;
    
    // 国家限制列表（ISO 3166-1 alpha-2 代码的哈希）
    mapping(bytes32 => bool) public allowedCountries;
    
    // 最大持仓限制（防止过度集中）
    uint256 public maxHoldingPercentage = 1000; // 10.00% (基点表示)
    
    // 传统白名单（向后兼容）
    mapping(address => bool) private _whitelist;

    // 用于跟踪债权生命周期的状态变量。
    bool public interestPaid;
    bool public principalRedeemed;

    // === 事件声明 ===
    event InvestorWhitelisted(address indexed investor);
    event InvestorRemoved(address indexed investor);
    event InterestPaid(uint256 timestamp, string message);
    event PrincipalRedeemed(uint256 timestamp, string message);
    
    // ERC-3643 新增事件
    event ComplianceOfficerSet(address indexed officer);
    event TransferAgentSet(address indexed agent);
    event CountryAllowed(bytes32 indexed countryCode);
    event CountryBlocked(bytes32 indexed countryCode);
    event IdentityRegistrySet(address indexed registry);
    event ClaimsRegistrySet(address indexed registry);
    event ComplianceCheckFailed(address indexed from, address indexed to, string reason);
    
    // 修饰符
    modifier onlyComplianceOfficer() {
        require(msg.sender == complianceOfficer || msg.sender == owner(), unicode"DebtToken: 只有合规官可以执行此操作");
        _;
    }
    
    modifier onlyTransferAgent() {
        require(msg.sender == transferAgent || msg.sender == owner(), unicode"DebtToken: 只有转账代理可以执行此操作");
        _;
    }
    
    /**
     * @dev 设置{name}、{symbol}和初始供应量，并初始化ERC-3643组件。
     * @param name 代币名称
     * @param symbol 代币符号  
     * @param initialSupply 初始供应量
     * @param _identityRegistry 身份注册表地址
     * @param _claimsRegistry 合规声明注册表地址
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address _identityRegistry,
        address _claimsRegistry
    ) ERC20(name, symbol) Ownable(msg.sender) {
        // 将总供应量铸造给发行方
        _mint(msg.sender, initialSupply * (10**decimals()));
        
        // 设置ERC-3643组件
        identityRegistry = IIdentityRegistry(_identityRegistry);
        claimsRegistry = IClaimsRegistry(_claimsRegistry);
        
        // 设置默认角色
        complianceOfficer = msg.sender;
        transferAgent = msg.sender;
        
        // 发行方自动列入白名单（向后兼容）
        _whitelist[msg.sender] = true;
        
        // 设置默认允许的国家（示例：美国、新加坡、瑞士）
        allowedCountries[keccak256("US")] = true;
        allowedCountries[keccak256("SG")] = true; 
        allowedCountries[keccak256("CH")] = true;
        
        emit InvestorWhitelisted(msg.sender);
        emit IdentityRegistrySet(_identityRegistry);
        emit ClaimsRegistrySet(_claimsRegistry);
    }

    // --- 白名单管理 ---

    /**
     * @dev 将地址添加到白名单。只能由拥有者调用。
     * @param _investor 要列入白名单的投资者地址。
     */
    function addInvestor(address _investor) public onlyOwner {
        require(_investor != address(0), unicode"DebtToken: 不能将零地址列入白名单");
        _whitelist[_investor] = true;
        emit InvestorWhitelisted(_investor);
    }

    /**
     * @dev 将地址从白名单中移除。只能由拥有者调用。
     * @param _investor 要从白名单中移除的投资者地址。
     */
    function removeInvestor(address _investor) public onlyOwner {
        _whitelist[_investor] = false;
        emit InvestorRemoved(_investor);
    }

    /**
     * @dev 检查地址是否在白名单中。
     * @param _investor 要检查的地址。
     * @return bool 如果地址在白名单中，则返回true，否则返回false。
     */
    function isWhitelisted(address _investor) public view returns (bool) {
        return _whitelist[_investor];
    }

    // === ERC-3643 角色管理函数 ===
    
    /**
     * @dev 设置合规官地址
     */
    function setComplianceOfficer(address _officer) external onlyOwner {
        complianceOfficer = _officer;
        emit ComplianceOfficerSet(_officer);
    }
    
    /**
     * @dev 设置转账代理地址
     */
    function setTransferAgent(address _agent) external onlyOwner {
        transferAgent = _agent;
        emit TransferAgentSet(_agent);
    }
    
    /**
     * @dev 允许特定国家的投资者
     */
    function allowCountry(string memory countryCode) external onlyComplianceOfficer {
        bytes32 countryHash = keccak256(bytes(countryCode));
        allowedCountries[countryHash] = true;
        emit CountryAllowed(countryHash);
    }
    
    /**
     * @dev 禁止特定国家的投资者
     */
    function blockCountry(string memory countryCode) external onlyComplianceOfficer {
        bytes32 countryHash = keccak256(bytes(countryCode));
        allowedCountries[countryHash] = false;
        emit CountryBlocked(countryHash);
    }

    // === ERC-3643 合规检查核心逻辑 ===

    /**
     * @dev 检查地址是否符合ERC-3643合规要求
     * @param user 要检查的用户地址
     * @return bool 是否合规
     */
    function isERC3643Compliant(address user) public view returns (bool) {
        // 1. 检查身份是否已验证
        if (!identityRegistry.isVerified(user)) {
            return false;
        }
        
        // 2. 获取用户身份合约地址
        address userIdentity = identityRegistry.getIdentity(user);
        
        // 3. 检查KYC声明
        if (!claimsRegistry.hasClaim(userIdentity, KYC_CLAIM)) {
            return false;
        }
        
        // 4. 检查合格投资者声明
        if (!claimsRegistry.hasClaim(userIdentity, ACCREDITED_CLAIM)) {
            return false;
        }
        
        // 5. 检查国家限制
        if (claimsRegistry.hasClaim(userIdentity, COUNTRY_CLAIM)) {
            bytes32 userCountry = claimsRegistry.getClaim(userIdentity, COUNTRY_CLAIM);
            if (!allowedCountries[userCountry]) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * @dev 检查转账是否会违反持仓集中度限制
     */
    function checkHoldingLimit(address to, uint256 amount) public view returns (bool) {
        uint256 newBalance = balanceOf(to) + amount;
        uint256 maxAllowed = (totalSupply() * maxHoldingPercentage) / 10000;
        return newBalance <= maxAllowed;
    }

    /**
     * @dev ERC-3643合规转账钩子 - 这是核心的合规检查逻辑
     */
    function _update(address from, address to, uint256 amount) internal virtual override {
        // 允许铸造和销毁
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }
        
        // 方式1：ERC-3643完整合规检查（推荐）
        if (address(identityRegistry) != address(0) && address(claimsRegistry) != address(0)) {
            // 检查发送方合规性
            if (!isERC3643Compliant(from)) {
                emit ComplianceCheckFailed(from, to, unicode"发送方不符合ERC-3643合规要求");
                revert(unicode"DebtToken: 发送方不符合ERC-3643合规要求");
            }
            
            // 检查接收方合规性
            if (!isERC3643Compliant(to)) {
                emit ComplianceCheckFailed(from, to, unicode"接收方不符合ERC-3643合规要求");
                revert(unicode"DebtToken: 接收方不符合ERC-3643合规要求");
            }
            
            // 检查持仓集中度限制
            if (!checkHoldingLimit(to, amount)) {
                emit ComplianceCheckFailed(from, to, unicode"转账将超过最大持仓限制");
                revert(unicode"DebtToken: 转账将超过最大持仓限制");
            }
        } 
        // 方式2：传统白名单检查（向后兼容）
        else {
            require(isWhitelisted(from), unicode"DebtToken: 发送方不在白名单中");
            require(isWhitelisted(to), unicode"DebtToken: 接收方不在白名单中");
        }

        super._update(from, to, amount);
    }

    // --- 债权生命周期函数 ---

    /**
     * @dev 模拟向代币持有者支付利息。只能由拥有者调用。
     * 在实际实现中，此函数会根据代币持有者的持仓比例，触发向所有代币持有者
     * 分发稳定币（例如 USDC）。
     */
    function payInterest() public onlyOwner {
        require(!interestPaid, unicode"DebtToken: 本期利息已支付。");
        interestPaid = true;
        emit InterestPaid(block.timestamp, unicode"利息已分配给代币持有者。");
    }

    /**
     * @dev 模拟在到期时赎回本金。只能由拥有者调用。
     * 在实际实现中，这将允许代币持有者销毁其代币，
     * 以换取标的本金金额（例如 USDC）。
     */
    function redeemPrincipal() public onlyOwner {
        require(!principalRedeemed, unicode"DebtToken: 本金已赎回。");
        principalRedeemed = true;
        emit PrincipalRedeemed(block.timestamp, unicode"本金现已可供代币持有者赎回。");
    }
    
    // --- 预言机集成伪代码 ---

    /**
     * @dev 伪代码示例：通过预言机获取链下数据。
     * 此函数展示了如何获取标的资产的价值。
     * 它不用于当前的合约逻辑，但作为说明。
     * @return uint256 资产的虚拟价值。
     */
    function getUnderlyingAssetValue() public pure returns (uint256) {
        // 在实际实现中，这将调用Chainlink数据源。
        // 例如：
        // IChainlinkAggregator oracle = IChainlinkAggregator(0x....); // 预言机地址
        // (, int256 price, , , ) = oracle.latestRoundData();
        // return uint256(price);
        
        // 对于研讨会，我们返回一个固定的虚拟值。
        return 1000000; // 例如，代表 $1,000,000.00
    }
}
