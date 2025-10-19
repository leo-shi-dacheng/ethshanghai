# RWA DebtToken (ERC‑3643 Demo)

一个用于演示 ERC‑3643（身份与合规控制）在债权类 ERC20 代币上的最小可用项目，包含：
- 合规模块（KYC、合格投资者、国家白名单、持仓集中度）
- 白名单回退兼容
- 债权生命周期（利息/本金）
- 一键演示脚本与交互式命令清单

## 快速开始
```bash
# 终端 1：启动本地链（保持运行）
npx hardhat node

# 终端 2：安装依赖并编译
npm ci
npx hardhat compile

# 部署并演示（多地址多场景 + 日志输出）
npx hardhat run --network localhost scripts/deploy-erc3643-kyc.js
```

## 交互演示入口
- 完整交互流程（逐条命令 + 快捷函数 + 一键演示）：
  - docs/Interactive-Console-Runbook.md
- 本地快速上手（脚本说明与常见问题）：
  - docs/Local-Quickstart.md

## 合约与模块说明

- 文件结构
  - contracts/IdentityRegistry.sol
  - contracts/ClaimsRegistry.sol
  - contracts/DebtToken.sol（主合约）
  - contracts/modules/DebtTokenCompliance.sol（合规模块）
  - contracts/modules/DebtTokenWhitelist.sol（白名单模块）
  - contracts/modules/DebtTokenLifecycle.sol（生命周期模块）

- 系统架构与依赖

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Identity       │    │  Claims         │    │  DebtToken      │
│  Registry       │◄───┤  Registry       │◄───┤  (ERC-3643)     │
│                 │    │                 │    │                 │
│ • isVerified()  │    │ • hasClaim()    │    │ • _update()     │
│ • getIdentity() │    │ • getClaim()    │    │ • checkCompliance() │
└─────────────────┘    └─────────────────┘    └─────────────────┘

ERC20 + Ownable (OpenZeppelin)
        ▲          ▲
        │          │
DebtToken ──────────────────────────────────────────────┐
   ▲            ▲                     ▲                │
   │            │                     │                │
Compliance   Whitelist            Lifecycle        Interfaces
   │            │                     │                │
IdentityRegistry  ClaimsRegistry  (无外部依赖)   IIdentityRegistry/IClaimsRegistry
```

- 核心角色与状态
  - identityRegistry / claimsRegistry：外部注册表，用于身份与声明校验
  - complianceOfficer / transferAgent：合规官与转账代理（当前代理仅预留）
  - allowedCountries：国家白名单（ISO 3166‑1 alpha‑2 的 keccak256 哈希）
  - maxHoldingPercentage：单地址持仓上限（基点，1000 = 10%）
  - _whitelist：传统白名单（回退/兼容）

- 模块职责（关键方法）
  - DebtTokenCompliance：setComplianceOfficer/allowCountry/checkCompliance/checkHoldingLimit；事件：ComplianceCheckFailed 等
  - DebtTokenWhitelist：addInvestor/removeInvestor/isWhitelisted
  - DebtTokenLifecycle：payInterest/redeemPrincipal；状态位：interestPaid/principalRedeemed

- 合规流程（转账路径）

```
转账请求 → 身份验证 → KYC → 合格投资者 → 国家限制 → 持仓限制 → 执行
    ↓         ↓         ↓         ↓         ↓         ↓         ↓
   from/to   Registry  Claims    Claims    Claims   Balance   Success
```

说明：_update 拦截除铸造/销毁外的转账，若注册表已配置，则按上述顺序检查 from/to 的合规与集中度；否则回退至白名单检查。

- 外部接口与常量
  - IIdentityRegistry：isVerified(address)、getIdentity(address)
  - IClaimsRegistry：hasClaim(identity, bytes32)、getClaim(identity, bytes32)
  - 声明常量：KYC_CLAIM（"KYC_VERIFIED"）、ACCREDITED_CLAIM（"ACCREDITED_INVESTOR"）、COUNTRY_CLAIM（"COUNTRY_ALLOWED"）

## 合约源码：contracts/DebtToken.sol
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IIdentityRegistry} from "./IdentityRegistry.sol";
import {IClaimsRegistry} from "./ClaimsRegistry.sol";
import {DebtTokenCompliance} from "./modules/DebtTokenCompliance.sol";
import {DebtTokenWhitelist} from "./modules/DebtTokenWhitelist.sol";
import {DebtTokenLifecycle} from "./modules/DebtTokenLifecycle.sol";

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

contract DebtToken is ERC20, Ownable, DebtTokenCompliance, DebtTokenWhitelist, DebtTokenLifecycle {
    
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
        addInvestor(msg.sender);
        
        // 设置默认允许的国家（示例：美国、新加坡、瑞士）
        allowedCountries[keccak256(bytes("US"))] = true;
        allowedCountries[keccak256(bytes("SG"))] = true; 
        allowedCountries[keccak256(bytes("CH"))] = true;

        emit IdentityRegistrySet(_identityRegistry);
        emit ClaimsRegistrySet(_claimsRegistry);
    }

    // 实现合规模块访问 ERC20 数据的内部钩子
    function _complianceBalanceOf(address account) internal view override returns (uint256) {
        return super.balanceOf(account);
    }

    function _complianceTotalSupply() internal view override returns (uint256) {
        return super.totalSupply();
    }
    
    // === ERC-3643 合规检查核心逻辑 ===

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
            if (!checkCompliance(from)) {
                emit ComplianceCheckFailed(from, to, unicode"发送方不符合ERC-3643合规要求");
                revert(unicode"DebtToken: 发送方不符合ERC-3643合规要求");
            }
            
            // 检查接收方合规性
            if (!checkCompliance(to)) {
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
```

## 目录
- 合约源码：`contracts/`
- 演示脚本：`scripts/`
- 文档：`docs/`
- 测试：`test/`

> 备注：本项目中的 IdentityRegistry/ClaimsRegistry 为 Mock 合约，仅用于本地/演示场景。生产环境应接入正式的身份/声明系统并通过审计。
