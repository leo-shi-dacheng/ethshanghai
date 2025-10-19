# 本地快速上手（Hardhat + DebtToken）

仅保留“方式 B（KYC/合规模式）”路径：部署 Mock 注册表并将地址注入 `DebtToken`，一次性演示多地址、多种合规场景（KYC/ACC/国家/身份验证）与利息/本金流程。文档不再包含控制台或合约源码片段，所有演示已封装到脚本中，您只需执行命令。

## 前置条件
- Node.js 18+
- 已安装依赖并完成编译

## 快速开始
在两个终端中依次执行以下命令：

```bash
# 终端 1：启动本地链（保持运行）
npx hardhat node
```

```bash
# 终端 2：安装依赖并编译
npm ci
npx hardhat compile

# 部署并演示 ERC‑3643 多地址合规模式
# （脚本会部署 Mock 注册表 + DebtToken，并对多类投资者逐项转账校验）
npx hardhat run --network localhost scripts/deploy-erc3643-kyc.js
```

## 演示流程说明（脚本自动完成）
- 部署最简 Mock 注册表：`MockIdentityRegistry` 与 `MockClaimsRegistry`。
- 以注册表地址部署 `DebtToken`，开启 ERC‑3643 合规路径。
- 设置身份：为发行方与多个投资者建立“地址 → 身份”的映射；分别配置“已验证/未验证”。
- 写入声明：按场景写入 `KYC`/`ACCREDITED`/`COUNTRY`（国家示例 US、CN；合约内置允许 US/SG/CH，显式封禁 CN）。
- 转账验证（逐项打印）：
  - OK（已验证 + KYC + ACC + 国家=US）→ 成功并更新余额。
  - NoKYC（缺少 KYC）→ 合规失败并回退。
  - NoACC（缺少 ACCREDITED）→ 合规失败并回退。
  - BadCountry（国家=CN，不在允许名单）→ 合规失败并回退。
  - Unverified（身份未验证）→ 合规失败并回退。
- 生命周期演示：调用利息分发与本金赎回函数并打印事件信息。

## 期望输出
- 终端打印各合约地址（注册表、DebtToken）。
- 显示多类场景的“Transfer to ...”结果（OK 或 REVERT）及余额/原因。
- 显示“Pay interest and redeem principal”并打印对应事件已触发。

## 常见问题排查
- 本地链必须先启动：确认 `npx hardhat node` 正在运行后，再执行部署脚本。
- 使用本地网络：命令中包含 `--network localhost`，避免连接到临时内置网络。
- 推荐使用：`scripts/deploy-erc3643-kyc.js`（`scripts/deploy-whitelist-fallback.js` 为白名单回退模式的遗留示例，本流程不使用）。
- 重新编译缓存：
  - `npx hardhat clean`
  - `npx hardhat compile`

## 下一步（可选）
- 需要演示国家白名单或持仓上限的动态调整？可以新增脚本按需展示（例如允许/封禁国家、修改集中度阈值）。如需我补充脚本，请告诉我具体场景。

## 交互演示（Hardhat Console）
按条输入，每次一行即返结果。确保你已按上文脚本完成一次部署，拿到 `DebtToken` 合约地址。完整清单亦见：`docs/Interactive-Console-Runbook.md`。

```bash
# 打开控制台
npx hardhat console --network localhost
```

```js
// 1) 账户与合约实例（替换为你的 DebtToken 合约地址）
const [issuer, ok, noKYC, noACC, badCountry, unverified] = await ethers.getSigners();
const debtToken = await ethers.getContractAt("DebtToken", "<DebtToken_地址>");

// 2) 基础查询
await debtToken.name();
await debtToken.symbol();
await debtToken.decimals();
await debtToken.totalSupply();
await debtToken.balanceOf(issuer.address);
await debtToken.balanceOf(ok.address);

// 3) ERC-3643 合规检查
await debtToken.isERC3643Compliant(ok.address);
await debtToken.isERC3643Compliant(noKYC.address);
// 白名单（回退模式兼容；本演示使用注册表时仅作参考）
await debtToken.isWhitelisted(issuer.address);

// 4) 角色管理
await debtToken.complianceOfficer();
await debtToken.transferAgent();
// 设置新合规官（只有发行方/owner可设，示例设为 ok）
await debtToken.connect(issuer).setComplianceOfficer(ok.address);

// 5) 国家管理
// 允许国家（只有合规官/owner可设）
await debtToken.connect(issuer).allowCountry("CN");
// 禁止特定国家
await debtToken.connect(issuer).blockCountry("XX");

// 6) 持仓限制
await debtToken.maxHoldingPercentage(); // 基点：1000 = 10%
await debtToken.checkHoldingLimit(ok.address, ethers.parseUnits("1000", 18));

// 7) 注册表与声明（进阶）
const irAddr = await debtToken.identityRegistry();
const crAddr = await debtToken.claimsRegistry();
const ir = await ethers.getContractAt("MockIdentityRegistry", irAddr);
const cr = await ethers.getContractAt("MockClaimsRegistry", crAddr);
const KYC = await debtToken.KYC_CLAIM();
const ACC = await debtToken.ACCREDITED_CLAIM();
const COUNTRY = await debtToken.COUNTRY_CLAIM();
const US = ethers.keccak256(ethers.toUtf8Bytes("US"));
const CN = ethers.keccak256(ethers.toUtf8Bytes("CN"));
await ir.isVerified(ok.address);
await cr.hasClaim(ok.address, KYC);
await cr.getClaim(ok.address, COUNTRY);

// 8) 实际转账
// 合规地址（成功）
await debtToken.connect(issuer).transfer(ok.address, ethers.parseUnits("1000", 18));
// 不合规地址（会回退，控制台显示错误消息）
await debtToken.connect(issuer).transfer(noKYC.address, ethers.parseUnits("1000", 18));

// 9) 触发持仓上限回退（计算 10% 阈值后超 1 wei）
const total = await debtToken.totalSupply();
const max = (total * 1000n) / 10000n; // 10%
const cur = await debtToken.balanceOf(ok.address);
await debtToken.connect(issuer).transfer(ok.address, (max - cur + 1n));
```
