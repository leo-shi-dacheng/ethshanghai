// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IIdentityRegistry} from "../IdentityRegistry.sol";
import {IClaimsRegistry} from "../ClaimsRegistry.sol";

abstract contract DebtTokenCompliance is Ownable {
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

    // 事件
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
     * @dev 设置合规官地址
     */
    function setComplianceOfficer(address officer) external virtual {
        require(msg.sender == owner(), unicode"DebtToken: 只有拥有者可以设置合规官");
        complianceOfficer = officer;
        emit ComplianceOfficerSet(officer);
    }

    /**
     * @dev 设置转账代理地址
     */
    function setTransferAgent(address agent) external virtual {
        require(msg.sender == owner(), unicode"DebtToken: 只有拥有者可以设置转账代理");
        transferAgent = agent;
        emit TransferAgentSet(agent);
    }

    /**
     * @dev 允许特定国家的投资者
     */
    function allowCountry(string memory countryCode) external virtual onlyComplianceOfficer {
        bytes32 countryHash = keccak256(bytes(countryCode));
        allowedCountries[countryHash] = true;
        emit CountryAllowed(countryHash);
    }

    /**
     * @dev 禁止特定国家的投资者
     */
    function blockCountry(string memory countryCode) external virtual onlyComplianceOfficer {
        bytes32 countryHash = keccak256(bytes(countryCode));
        allowedCountries[countryHash] = false;
        emit CountryBlocked(countryHash);
    }

    /**
     * @dev 检查地址是否符合ERC-3643合规要求
     * @param user 要检查的用户地址
     * @return bool 是否合规
     */
    function isERC3643Compliant(address user) public view virtual returns (bool) {
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
     * @dev 别名：checkCompliance 与 isERC3643Compliant 等价，便于文档与演示使用
     */
    function checkCompliance(address user) public view virtual returns (bool) {
        return isERC3643Compliant(user);
    }

    /**
     * @dev 检查转账是否会违反持仓集中度限制
     */
    function checkHoldingLimit(address to, uint256 amount) public view virtual returns (bool) {
        uint256 newBalance = _complianceBalanceOf(to) + amount;
        uint256 maxAllowed = (_complianceTotalSupply() * maxHoldingPercentage) / 10000;
        return newBalance <= maxAllowed;
    }

    // 由上层合约实现，以便模块不直接依赖 ERC20
    function _complianceBalanceOf(address account) internal view virtual returns (uint256);
    function _complianceTotalSupply() internal view virtual returns (uint256);
}
