# RWA 债权资产上链完整说明（本金 + 利息 + 到期赎回 + 合规嵌入）

> 适配当前仓库（ERC‑3643 合规路径 + 生命周期事件占位），不改动任何代码。本文档用于产品、合规与技术团队的对齐说明与演示指引。

## 1. 文档目标
- 将“本金 + 利息 + 到期赎回 + 合规嵌入”的业务逻辑映射到当前代码结构与演示脚本。
- 给出票息计提/分发与到期赎回的目标设计与链下对接约定（保持现有合规模块不变）。
- 提供运行演示与审计留痕规范，便于后续扩展或上线。

## 2. 项目现状概览
- 代币与合规：
  - `contracts/DebtToken.sol`：ERC20 + 合规转让钩子（ERC‑3643 兼容）；发行铸造即“面值总量”的链上映射。
  - 合规核验：身份已验证 + KYC + 合格投资者 + 国家白名单 + 持仓集中度。
  - 白名单回退：未配置注册表时退化为传统白名单检查。
- 生命周期事件占位：
  - `InterestPaid`（票息分配已触发，事件占位）。
  - `PrincipalRedeemed`（本金可赎回，事件占位）。
- 演示/测试：
  - 多场景脚本：`scripts/deploy-erc3643-kyc.js`（身份、声明、国家、集中度与事件）。
  - 测试：`test/test.ts` 覆盖合规路径、事件与集中度限制。

> 说明：当前仓库未实现“票息计提/分发”和“到期赎回资金 + 销毁闭环”的链上逻辑；本文档提供目标设计与对接约定，便于链下流程/托管人协作或后续按需补齐。

## 3. 四要素与仓库映射
- 本金（Principal）
  - 定义：总发行量即面值总额；存续本金 ≈ `totalSupply()`。
  - 现状：构造器铸造给发行方，代表“面值总量”。
- 利息（Interest）
  - 现状：提供 `InterestPaid` 事件占位；未计提/分发资金。
  - 目标：基于利率/日计数计算应付总额，按记录日持仓比例 Pull 领取。
- 到期赎回（Redemption）
  - 现状：提供 `PrincipalRedeemed` 事件占位；未落地资金与销毁闭环。
  - 目标：到期限制普通转让，持有人“烧毁代币 + 领取本金与末期利息”。
- 合规嵌入（Compliance）
  - 已实现：身份 + 声明（KYC/ACC/COUNTRY）+ 国家白名单 + 持仓集中度；失败回退并事件留痕。

## 4. 架构与模块
- `DebtToken`（代币 + 合规钩子）
  - 发行与余额：初始化铸造总量映射本金，后续赎回应配合销毁减少存续本金。
  - 合规转让：在 `_update` 钩子中强制 ERC‑3643 检查，超限回退。
- `DebtTokenCompliance`（身份/声明/国家/集中度）
  - 身份与声明：`isVerified`、`KYC_VERIFIED`、`ACCREDITED_INVESTOR`、`COUNTRY_ALLOWED`。
  - 集中度：`maxHoldingPercentage`（默认 10% 基点 1000）。
- `DebtTokenWhitelist`（白名单回退）
  - 未配置注册表时启用；演示/过渡用。
- `DebtTokenLifecycle`（生命周期事件）
  - 事件占位：`payInterest`、`redeemPrincipal`（未做资金逻辑）。
- Mock 注册表（演示）
  - `MockIdentityRegistry`、`MockClaimsRegistry` 用于本地 KYC/声明演示。

## 5. 合规模块（ERC‑3643）详解
- 必备声明
  - 身份验证：`isVerified(user)` → true。
  - KYC：`KYC_VERIFIED`。
  - 合格投资者：`ACCREDITED_INVESTOR`。
  - 国家白名单：`COUNTRY_ALLOWED` 哈希 ∈ `allowedCountries`。
- 持仓集中度
  - 单地址最大持仓 = `totalSupply * maxHoldingPercentage / 10000`。
- 回退模式
  - 未配置注册表 → 退化为白名单 `isWhitelisted(from/to)` 检查。

## 6. 生命周期与状态（文档约定）
- 建议状态流转：`Draft → Issued → Active → Matured → Redeemed/Defaulted`。
- 建议事件：
  - 已有：`InterestPaid`、`PrincipalRedeemed`（占位）。
  - 建议披露：`Issued`、`Matured`、`Defaulted`、`DocumentURI(uri,hash)`（公告/修订/公司行动）。

## 7. 票息与兑付（目标设计与链下对接）
### 7.1 参数约定
- 利率：`couponBps`（基点，1 bps = 0.01%）。
- 日计数：`dayCount ∈ {Actual/365, 30/360, Actual/Actual}`。
- 周期：月/季/半年/年；关键日：`recordDate`（记录日）、`paymentDate`（兑付日）。

### 7.2 计息与应付总额
- 代表性公式（固定利率）：
  - `accrualFactor = DC(dayCount, startDate, endDate)`；
  - `interestDue = faceValueOutstanding * couponBps/10000 * accrualFactor`。
- 精度建议：以 1e18 和 bps 计算，向下取整；尾差累积 `treasurySurplus`。

### 7.3 分配流程（Pull 领取，推荐）
1) 记录日离链快照“地址→持仓余额”。
2) 按比例计算每地址应得金额；构造 Merkle 树：
   - 叶格式：`keccak256(abi.encode(address account, uint256 amount, uint256 period, uint256 index))`。
3) 上链或公告披露 `merkleRoot`（事件含 `uri, hash`）；发行人将 USDC 存入兑付专账（链上/链下均可）。
4) 投资者自助 `claim(period, amount, proof)` 领取；防重复通过位图/布尔位。

### 7.4 记录日与防套利
- 记录日之后的转让不影响本期领取；建议离链快照（规模更友好）。
- 到期后限制普通转让，仅保留赎回路径，避免赎回期套利。

## 8. 到期赎回（目标设计与对接）
### 8.1 到期控制
- 到期切换 `Matured`，普通转让受限（仅保留赎回/销毁路径）。

### 8.2 赎回闭环（链上或链下均可）
- 发布本金（可含末期利息）分配根与披露文件哈希。
- 用户“烧毁代币 + 领取本金”：
  - 链上路径：`approve(burnAmount)` → 受托人/合约执行 `burnFrom` → 兑付 USDC。
  - 链下路径：受托人核验后兑付，链上只做事件与对账锚点。
- 销毁总额累计等于回收本金总额，实现账实一致。

### 8.3 违约/处置（可选）
- 标记 `Defaulted`，冻结普通转让；进入处置流程（受托人、抵押物）。
- 公告与处置方案以 `DocumentURI` 事件披露（`uri + hash`）。

## 9. 运行与演示（现有仓库即可）
### 9.1 本地快速开始
```bash
# 终端 1：启动本地链（保持运行）
npx hardhat node

# 终端 2：安装 + 编译 + 演示
npm ci
npx hardhat compile
npx hardhat run --network localhost scripts/deploy-erc3643-kyc.js
```

### 9.2 演示覆盖点
- 部署 Mock 注册表与 DebtToken；设置 KYC/ACC/国家场景。
- 输出合规检查结果、转账成功/失败原因、集中度限制与生命周期事件。

### 9.3 控制台交互（节选）
```bash
npx hardhat console --network localhost
```
```js
const [issuer, ok, noKYC, noACC, badCountry, unverified] = await ethers.getSigners();
const addr = "<DebtToken_地址>";
const debt = await ethers.getContractAt("DebtToken", addr);
await debt.isERC3643Compliant(ok.address); // true/false
await debt.maxHoldingPercentage();         // 基点：1000 = 10%
await debt.payInterest();                  // 事件占位：利息已分配
await debt.redeemPrincipal();              // 事件占位：本金可赎回
```

## 10. 数据与事件标准（审计/对账）
- 分配披露（建议事件）：
  - `DistributionCreated(period, total, merkleRoot, uri, hash)`：利息分配。
  - `RedemptionCreated(total, merkleRoot, uri, hash)`：本金分配。
  - `Claimed(period, user, amount)`、`Redeemed(user, amount)`。
- 文件披露：
  - `uri`（HTTP/IPFS）+ `hash`（文档哈希）用于公告与对账固定锚点。
- 精度与尾差：
  - 统一 18 位与 bps；按向下取整；尾差入 `treasurySurplus`，在下一期/结算处理。

## 11. 安全与合规要点
- 访问控制：发行方/合规官/转账代理/服务机构分权；敏感操作需多签/延时（生产）。
- 风险控制：`block.timestamp` 容差；喂价回退策略（若引入浮动利率）。
- 资金保全：代币合约不持有兑付资金；兑付专账仅存当期金额，发完即清。
- 审计足迹：合规失败、参数变更、分配/兑付、文件披露均 emit 事件。

## 12. 测试与验收建议
- 现有：多场景合规、生命周期事件、集中度限制（`test/test.ts`）。
- 建议补充：
  - 记录日快照一致性、分配金额正确性、防重复领取、尾差累积。
  - 到期后的转让限制、赎回闭环（销毁与兑付在链下/链上的一致性）。
  - 非授权角色拒绝与边界金额（最小单位、舍入）。

## 13. 常见问题（FAQ）
- 为什么采用 Pull 分发？
  - Pull 更可扩展、省 gas；Push 需要遍历持有人，链上不可扩展。
- 没有实现链上 `PaymentManager` 如何演示？
  - 使用现有事件（已支付/可赎回）与离链对账表；资金由托管人按表兑付，事件锚点便于审计。
- Mock 注册表能用于生产吗？
  - 不能。生产需接入正式 KYC/声明系统，权限与审计到位。

## 14. 术语表
- 记录日（Record Date）：确定本期应得利息的持仓截面日期。
- 兑付日（Payment Date）：利息/本金到账日期。
- 基点（bps）：1 bps = 0.01%。
- 存续本金：未被赎回/销毁的面值余额（≈ `totalSupply()`）。

## 15. 关键文件参考（代码不改动）
- 发行铸造（本金）：`contracts/DebtToken.sol:46`
- 合规转让钩子：`contracts/DebtToken.sol:83`
- 合规核验（KYC/ACC/国家）：`contracts/modules/DebtTokenCompliance.sol:89`
- 持仓集中度限制：`contracts/modules/DebtTokenCompliance.sol:129`
- 白名单回退：`contracts/DebtToken.sol:110`
- 利息事件占位：`contracts/modules/DebtTokenLifecycle.sol:20`
- 本金事件占位：`contracts/modules/DebtTokenLifecycle.sol:29`

---

> 免责声明：本文档仅为技术实现与产品协作参考，不构成任何法律、证券或投资建议。生产部署需经过安全审计与合规模型评估。

