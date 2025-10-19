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
