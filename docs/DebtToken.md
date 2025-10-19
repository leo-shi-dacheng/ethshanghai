# DebtToken 合约与模块说明

本文件合并了原先的“DebtToken 合约说明”和“DebtToken 模块化说明”，统一介绍合约定位、模块拆分、依赖关系与合规流程，便于阅读、扩展与审计。

## 合约定位与继承
- 目标：在 ERC20 上融入 ERC‑3643 身份与合规控制，用于表示合规债权。
- 继承关系：`DebtToken is ERC20, Ownable, DebtTokenCompliance, DebtTokenWhitelist, DebtTokenLifecycle`。
- 初始角色：部署者初始持有全部代币并担任默认角色（合规官、转账代理、白名单）。

## 系统架构与依赖
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
- `DebtToken` 在 `_update` 中驱动全流程合规检查；若注册表指针为空，则退回白名单模式。
- 合规模块依赖外部注册表接口与 `ERC20` 的 `balanceOf/totalSupply` 只读能力。
- 白名单与生命周期模块仅依赖 `Ownable` 的访问控制。

## 文件结构
- `contracts/IdentityRegistry.sol`
- `contracts/ClaimsRegistry.sol`
- `contracts/DebtToken.sol`：主合约，组合各模块，包含构造函数、合规转账钩子 `_update` 与示例预言机函数。
- `contracts/modules/DebtTokenCompliance.sol`：合规模块，封装 ERC‑3643 的身份/声明注册表、角色、国家名单、持仓限制与合规检查逻辑与事件。
- `contracts/modules/DebtTokenWhitelist.sol`：白名单模块，向后兼容的增删查与事件。
- `contracts/modules/DebtTokenLifecycle.sol`：生命周期模块，利息发放与本金赎回及对应事件。

## 模块职责与接口
- 合规模块（`contracts/modules/DebtTokenCompliance.sol`）
  - 状态：`identityRegistry`、`claimsRegistry`、`complianceOfficer`、`transferAgent`、`allowedCountries`、`maxHoldingPercentage`。
  - 事件：`ComplianceOfficerSet`、`TransferAgentSet`、`CountryAllowed`、`CountryBlocked`、`IdentityRegistrySet`、`ClaimsRegistrySet`、`ComplianceCheckFailed`。
  - 方法：
    - `setComplianceOfficer(address)`、`setTransferAgent(address)`
    - `allowCountry(string)`、`blockCountry(string)`
    - `isERC3643Compliant(address)` / `checkCompliance(address)`
    - `checkHoldingLimit(address,uint256)`
  - 声明类型常量：
    - `KYC_CLAIM = keccak256("KYC_VERIFIED")`
    - `ACCREDITED_CLAIM = keccak256("ACCREDITED_INVESTOR")`
    - `COUNTRY_CLAIM = keccak256("COUNTRY_ALLOWED")`
- 白名单模块（`contracts/modules/DebtTokenWhitelist.sol`）
  - 事件：`InvestorWhitelisted`、`InvestorRemoved`
  - 方法：`addInvestor(address)`、`removeInvestor(address)`、`isWhitelisted(address)`
- 生命周期模块（`contracts/modules/DebtTokenLifecycle.sol`）
  - 状态：`interestPaid`、`principalRedeemed`
  - 事件：`InterestPaid`、`PrincipalRedeemed`
  - 方法：`payInterest()`、`redeemPrincipal()`
- 主合约（`contracts/DebtToken.sol`）
  - 构造：设置注册表、默认角色、默认允许国家，将部署者加入白名单，并触发注册表事件。
  - 内部钩子：`_complianceBalanceOf`、`_complianceTotalSupply` 向合规模块暴露 `ERC20` 视图数据。
  - `_update`：铸造/销毁直通；如注册表已配置则进行合规检查和持仓限制；否则回退白名单检查。

## 核心角色与状态变量
- `identityRegistry`：身份注册表，验证地址并映射到链上身份合约。
- `claimsRegistry`：声明注册表，存储 KYC、合格投资者、国家等声明。
- `complianceOfficer` / `transferAgent`：合规官维护国家名单；转账代理留作扩展（可在 `_update` 增加特权路径）。
- `allowedCountries`：国家哈希白名单（ISO 3166‑1 alpha‑2 代码的 `keccak256`）。
- `maxHoldingPercentage`：单账户最大持仓占比（基点，默认 1000 = 10%）。
- `_whitelist`：传统白名单，确保旧流程可用。

## 合规流程
```
转账请求 → 身份验证 → KYC检查 → 投资者资格 → 地理限制 → 持仓限制 → 执行转账
    ↓         ↓         ↓         ↓         ↓         ↓         ↓
   from/to   Registry  Claims    Claims    Claims   Balance   Success
```
- 转账入口：`_update(from, to, amount)` 捕获所有代币流动，铸造/销毁之外的路径必须合规。
- 身份验证：`identityRegistry.isVerified(user)` 为真，否则拒绝。
- KYC 检查：`claimsRegistry.hasClaim(identity, KYC_CLAIM)`。
- 投资者资格：`claimsRegistry.hasClaim(identity, ACCREDITED_CLAIM)`。
- 地理限制：若有 `COUNTRY_CLAIM`，则 `allowedCountries[getClaim(identity, COUNTRY_CLAIM)]` 必须为真。
- 持仓限制：`checkHoldingLimit(to, amount)` 不得超过 `maxHoldingPercentage`。
- 执行转账：校验全部通过后调用 `super._update` 完成余额更新。

## 合规校验逻辑（合约要点）
- `_update(from, to, amount)`：统一拦截转账；铸造/销毁直通；常规转账依次执行 `checkCompliance(from)`、`checkCompliance(to)` 与 `checkHoldingLimit(to, amount)`；失败触发 `ComplianceCheckFailed` 并 `revert`；如未配置注册表则回退白名单。
- `checkCompliance(user)`：等价 `isERC3643Compliant(user)`，逐项检查身份、KYC、合格投资者与国家白名单。

## 白名单与生命周期
- 白名单（回退/兼容）：`addInvestor`、`removeInvestor`、`isWhitelisted`。
- 生命周期：`payInterest` 一次性标记利息已发放；`redeemPrincipal` 一次性标记本金可赎回；对应事件可供前端订阅呈现。

## 外部接口与常量
- `IIdentityRegistry`：`isVerified(address)`、`getIdentity(address)`
- `IClaimsRegistry`：`hasClaim(address,bytes32)`、`getClaim(address,bytes32)`
- 声明类型常量：`KYC_CLAIM`、`ACCREDITED_CLAIM`、`COUNTRY_CLAIM`

## 使用与部署示例
- 部署（构造）：`name`、`symbol`、`initialSupply`、`identityRegistry`、`claimsRegistry`
- 角色与名单：`setComplianceOfficer(addr)`、`setTransferAgent(addr)`、`allowCountry("US")`、`blockCountry("CN")`
- 白名单（回退/兼容）：`addInvestor(addr)`、`removeInvestor(addr)`、`isWhitelisted(addr)`
- 生命周期：`payInterest()`、`redeemPrincipal()`

## 构建与测试
- 环境：Node 18+、Hardhat、OpenZeppelin Contracts 5.x
- 构建：`npm ci`；`npx hardhat compile`
- 测试：`npx hardhat test`

## 扩展与安全注意事项
- 国家白名单由合规官维护：`allowCountry` / `blockCountry`。
- 通过 `maxHoldingPercentage` 控制单地址集中度，可考虑增加可配置事件。
- `getUnderlyingAssetValue` 为示例函数，实际部署需接入真实预言机。
- 部署时需设置正确的注册表地址，否则合规检查会拒绝常规转账。
