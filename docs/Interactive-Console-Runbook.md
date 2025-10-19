# 交互演示完整流程（一步一命令）

本指南将“交互演示（Hardhat Console）”的所有步骤整理为一份可直接照着执行的文档，适合现场演示与新人上手。每条命令敲一下就能看到对应结果。示例地址仅供参考，请以你本机部署输出为准。

## 一、环境准备
- 启动本地链（终端 1，保持运行）：
```bash
npx hardhat node
```
- 编译与部署（终端 2）：
```bash
npm ci
npx hardhat compile
npx hardhat run --network localhost scripts/deploy-erc3643-kyc.js
```
部署脚本会打印 Issuer/多类投资者地址、Mock 注册表与 DebtToken 地址。请记录 `DebtToken` 地址以供后续控制台使用。

## 二、进入控制台并附着合约
```bash
npx hardhat console --network localhost
```
```js
// 1) 获取账户（与部署脚本一致）
const [issuer, ok, noKYC, noACC, badCountry, unverified] = await ethers.getSigners();

// 2) 使用你的 DebtToken 合约地址替换占位符
const addr = "<替换为实际的 DebtToken 地址>";

// 3) 地址校验与合约存在性检查（避免把占位符当成 ENS 名称）
ethers.getAddress(addr);
await ethers.provider.getCode(addr); // 返回值不应为 "0x"

// 4) 获取合约实例
const debtToken = await ethers.getContractAt("DebtToken", addr);
```

## 三、基础查询
```js
await debtToken.name();                 // 代币名称
await debtToken.symbol();               // 代币符号
await debtToken.decimals();             // 小数位（通常 18）
await debtToken.totalSupply();          // 总发行量（最小单位）
await debtToken.balanceOf(issuer.address); // 发行方余额
await debtToken.balanceOf(ok.address);     // 投资者余额
// 人类可读：
ethers.formatUnits(await debtToken.balanceOf(ok.address), await debtToken.decimals());
```

## 四、ERC‑3643 合规检查
```js
// 严格合规（KYC/ACC/国家） → true/false
await debtToken.isERC3643Compliant(ok.address);
await debtToken.isERC3643Compliant(noKYC.address);
await debtToken.isERC3643Compliant(noACC.address);
await debtToken.isERC3643Compliant(badCountry.address);
await debtToken.isERC3643Compliant(unverified.address);

// 传统白名单（回退模式兼容；使用注册表时仅作参考）
await debtToken.isWhitelisted(issuer.address);
```

## 五、角色与国家管理
```js
// 角色查询
await debtToken.complianceOfficer();   // 合规官（默认=owner）
await debtToken.transferAgent();       // 转账代理（预留扩展）

// 设置新合规官（只有发行方/owner 可设）
await debtToken.connect(issuer).setComplianceOfficer(ok.address);

// 国家白名单（ISO 3166‑1 alpha‑2 → keccak256 哈希）
const US = ethers.keccak256(ethers.toUtf8Bytes("US")); // 美国（United States）
const SG = ethers.keccak256(ethers.toUtf8Bytes("SG")); // 新加坡（Singapore）
const CH = ethers.keccak256(ethers.toUtf8Bytes("CH")); // 瑞士（Switzerland）
const CN = ethers.keccak256(ethers.toUtf8Bytes("CN")); // 中国（China）
await debtToken.allowedCountries(US);  // true（合约构造器已允许）
await debtToken.allowedCountries(SG);  // true
await debtToken.allowedCountries(CH);  // true
await debtToken.allowedCountries(CN);  // 可能为 false（默认未允许）

// 允许/封禁国家（只有合规官/owner 可设）
await debtToken.connect(issuer).allowCountry("CN"); // 允许中国（CN）
await debtToken.connect(issuer).blockCountry("XX"); // 演示用占位码（非官方国家码）
```

## 六、持仓限制（集中度）
```js
// 最大持仓百分比（基点：1000 = 10%）
await debtToken.maxHoldingPercentage();

// 检查本次转账是否会超过上限（示例：1000 个）
await debtToken.checkHoldingLimit(ok.address, ethers.parseUnits("1000", await debtToken.decimals()));

// 计算“刚好超限 1 wei”以演示回退
const total = await debtToken.totalSupply();
const max = (total * 1000n) / 10000n; // 10%
const cur = await debtToken.balanceOf(ok.address);
const exceedBy1 = (max - cur + 1n);
```

## 七、注册表与声明（ir / cr）
```js
// 获取注册表实例
const irAddr = await debtToken.identityRegistry();  // ir: 身份注册表（isVerified / getIdentity）
const crAddr = await debtToken.claimsRegistry();    // cr: 声明注册表（hasClaim / getClaim）
const ir = await ethers.getContractAt("MockIdentityRegistry", irAddr);
const cr = await ethers.getContractAt("MockClaimsRegistry", crAddr);

// 声明类型常量与国家码哈希
const KYC = await debtToken.KYC_CLAIM();            // keccak256("KYC_VERIFIED")
const ACC = await debtToken.ACCREDITED_CLAIM();     // keccak256("ACCREDITED_INVESTOR")
const COUNTRY = await debtToken.COUNTRY_CLAIM();    // keccak256("COUNTRY_ALLOWED")
const US = ethers.keccak256(ethers.toUtf8Bytes("US")); // 美国
const CN = ethers.keccak256(ethers.toUtf8Bytes("CN")); // 中国

// 查看身份与声明（Mock 中 identity=地址本身；cr 中非零值表示存在）
await ir.isVerified(ok.address);                    // 是否通过身份验证
await cr.hasClaim(ok.address, KYC);                 // 是否有 KYC 声明
await cr.getClaim(ok.address, COUNTRY);             // 国家哈希（若设置）

// 撤销/恢复 KYC（0 值表示清除）
await cr.setClaim(ok.address, KYC, ethers.ZeroHash); // 撤销 KYC
await cr.setClaim(ok.address, KYC, US);              // 恢复 KYC=US

// 更改身份验证状态（仅 Demo）
await ir.set(ok.address, ok.address, false);        // 设置为未验证
await ir.set(ok.address, ok.address, true);         // 恢复为已验证
```

## 八、实际转账（成功与失败示例）
```js
const amt = ethers.parseUnits("1000", await debtToken.decimals());

// 合规地址（成功）
await debtToken.connect(issuer).transfer(ok.address, amt);

// 不合规地址（会回退，期望错误为“接收方不符合ERC-3643合规要求”）
await debtToken.connect(issuer).transfer(noKYC.address, amt);      // 缺少 KYC
await debtToken.connect(issuer).transfer(noACC.address, amt);      // 缺少 ACC
await debtToken.connect(issuer).transfer(badCountry.address, amt); // 国家不允许
await debtToken.connect(issuer).transfer(unverified.address, amt); // 未验证身份
```

## 九、触发持仓上限回退
```js
await debtToken.connect(issuer).transfer(ok.address, exceedBy1);
// 期望错误："DebtToken: 转账将超过最大持仓限制"
```

## 十、债权生命周期
```js
await debtToken.connect(issuer).payInterest();      // 触发 InterestPaid 事件
await debtToken.connect(issuer).redeemPrincipal();  // 触发 PrincipalRedeemed 事件
// 状态位查看
await debtToken.interestPaid();
await debtToken.principalRedeemed();
```

## 十一、快捷函数（更快演示）
如果希望封装调用、快速演示，可直接使用控制台“快捷函数”脚本。
```bash
npx hardhat console --network localhost
```
```js
const s = require("./scripts/interactive-console-snippets");
const ctx = await s.attach("<替换为实际的 DebtToken 地址>");
await s.basicInfo(ctx);
await s.compliance(ctx);
await s.roles(ctx);
await s.setComplianceOfficer(ctx, ctx.ok.address);
await s.countryStatus(ctx);
await s.allowCountry(ctx, "CN");
await s.blockCountry(ctx, "XX");
await s.holding(ctx, "1000");
await s.registryClaims(ctx);
await s.toggleKyc(ctx, ctx.ok.address, ethers.ZeroHash);
await s.toggleKyc(ctx, ctx.ok.address, ctx.US);
await s.transferScenarios(ctx, "1000");
await s.calcExceedBy1(ctx);
await s.exceedLimit(ctx);
await s.lifecycle(ctx);
```

## 十二、一键演示（非交互）
如果不想逐条输入命令，可直接运行多场景演示脚本：
```bash
npx hardhat run --network localhost scripts/deploy-erc3643-kyc.js
```
该脚本会自动部署 Mock 与 DebtToken，并打印基础信息、合规检查、国家白名单、持仓上限检查、注册表/声明、转账成功/失败、超限回退与生命周期等关键结果。

## 十三、国家代码说明（示例内置）
- US：美国（United States）
- SG：新加坡（Singapore）
- CH：瑞士（Switzerland）
- CN：中国（China）
- 以上使用 ISO 3166‑1 alpha‑2 两字母代码；在合约里通过 `keccak256(toUtf8Bytes(code))` 哈希后与 `allowedCountries` 映射配合使用。

## 十四、常见问题与排错
- 占位符未替换为真实地址 → 可能触发 `resolveName` 错误；请先 `ethers.getAddress(addr)` 与 `ethers.provider.getCode(addr)` 校验。
- 忘记合约地址 → 重新运行部署脚本打印：`npx hardhat run --network localhost scripts/deploy-erc3643-kyc.js`。
- 本地链未启动或网络不匹配 → 确认已执行 `npx hardhat node` 且控制台/脚本均加 `--network localhost`。
- 金额单位不一致 → 使用 `ethers.parseUnits/formatUnits` 配合 `await debtToken.decimals()`。
- Mock 注册表仅用于 Demo → 生产中身份/声明通常由独立系统与审计流程写入。
