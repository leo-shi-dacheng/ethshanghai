const debtToken = await ethers.getContractAt("DebtToken", "合约地址");

// === 基础查询 ===
// 查看代币信息
await debtToken.name();
await debtToken.symbol();
await debtToken.totalSupply();

// 查看余额
await debtToken.balanceOf("地址");

// === ERC-3643 合规检查 ===
// 检查是否符合 ERC-3643 合规要求
await debtToken.isERC3643Compliant("投资者地址");

// 检查传统白名单状态（向后兼容）
await debtToken.isWhitelisted("地址");

// === 角色管理 ===
// 查看当前角色
await debtToken.complianceOfficer();
await debtToken.transferAgent();

// 设置新的合规官（只有发行方可以）
await debtToken.setComplianceOfficer("新合规官地址");

// === 国家管理 ===
// 允许新的国家（只有合规官可以）
await debtToken.allowCountry("CN"); // 允许中国投资者

// 禁止特定国家
await debtToken.blockCountry("XX"); // 禁止某国投资者

// === 持仓限制检查 ===
// 检查转账是否会超过持仓限制
await debtToken.checkHoldingLimit("接收方地址", ethers.parseEther("1000"));

// 查看最大持仓百分比（基点表示，1000 = 10%）
await debtToken.maxHoldingPercentage();