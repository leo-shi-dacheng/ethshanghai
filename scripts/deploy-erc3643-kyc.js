const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  const [
    issuer,
    investorOK,        // 合规：KYC + ACC + US
    investorNoKYC,     // 不合规：缺少 KYC
    investorNoACC,     // 不合规：缺少 ACCREDITED
    investorBadCountry,// 不合规：国家不在允许名单（CN）
    investorUnverified // 不合规：未通过身份验证
  ] = await ethers.getSigners();
  console.log("Issuer:", issuer.address);
  console.log("OK (KYC+ACC+US):", investorOK.address);
  console.log("NoKYC:", investorNoKYC.address);
  console.log("NoACC:", investorNoACC.address);
  console.log("BadCountry (CN):", investorBadCountry.address);
  console.log("Unverified:", investorUnverified.address);

  // 1) 部署 Mock 注册表
  const IR = await ethers.getContractFactory("MockIdentityRegistry");
  const CR = await ethers.getContractFactory("MockClaimsRegistry");
  const ir = await IR.deploy();
  await ir.waitForDeployment();
  const cr = await CR.deploy();
  await cr.waitForDeployment();
  console.log("MockIdentityRegistry:", await ir.getAddress());
  console.log("MockClaimsRegistry:", await cr.getAddress());

  // 2) 部署 DebtToken（带注册表地址）
  const DebtToken = await ethers.getContractFactory("DebtToken");
  const dt = await DebtToken.deploy(
    "Real Estate Debt Bond",
    "REDB",
    1_000_000,
    await ir.getAddress(),
    await cr.getAddress()
  );
  await dt.waitForDeployment();
  console.log("DebtToken:", await dt.getAddress());

  // === 基础信息 ===
  console.log("\n=== Basic Info ===");
  console.log("name:", await dt.name());
  console.log("symbol:", await dt.symbol());
  console.log("decimals:", await dt.decimals());
  console.log("totalSupply:", (await dt.totalSupply()).toString());

  // 3) 为发行方与多类型投资者设置身份 + 声明（identity = 自身地址）
  await ir.set(issuer.address, issuer.address, true);

  const KYC = await dt.KYC_CLAIM();
  const ACC = await dt.ACCREDITED_CLAIM();
  const COUNTRY = await dt.COUNTRY_CLAIM();
  const US = ethers.keccak256(ethers.toUtf8Bytes("US"));
  const SG = ethers.keccak256(ethers.toUtf8Bytes("SG"));
  const CH = ethers.keccak256(ethers.toUtf8Bytes("CH"));
  const CN = ethers.keccak256(ethers.toUtf8Bytes("CN"));

  // 发行方：完全合规 US
  await cr.setClaim(issuer.address, KYC, US);
  await cr.setClaim(issuer.address, ACC, US);
  await cr.setClaim(issuer.address, COUNTRY, US);

  // 国家白名单现状
  console.log("\n=== Allowed Countries (initial) ===");
  console.log("US:", await dt.allowedCountries(US));
  console.log("SG:", await dt.allowedCountries(SG));
  console.log("CH:", await dt.allowedCountries(CH));
  console.log("CN:", await dt.allowedCountries(CN)); // 可能为 false

  // 3.1 完全合规（KYC + ACC + US）
  await ir.set(investorOK.address, investorOK.address, true);
  await cr.setClaim(investorOK.address, KYC, US);
  await cr.setClaim(investorOK.address, ACC, US);
  await cr.setClaim(investorOK.address, COUNTRY, US);

  // 3.2 缺少 KYC（仅 ACC）
  await ir.set(investorNoKYC.address, investorNoKYC.address, true);
  await cr.setClaim(investorNoKYC.address, ACC, US);
  // 不设置 KYC

  // 3.3 缺少 ACC（仅 KYC）
  await ir.set(investorNoACC.address, investorNoACC.address, true);
  await cr.setClaim(investorNoACC.address, KYC, US);
  // 不设置 ACC

  // 3.4 国家不允许（KYC+ACC 但 COUNTRY=CN）
  await ir.set(investorBadCountry.address, investorBadCountry.address, true);
  await cr.setClaim(investorBadCountry.address, KYC, CN);
  await cr.setClaim(investorBadCountry.address, ACC, CN);
  await cr.setClaim(investorBadCountry.address, COUNTRY, CN);

  // 3.5 未验证身份（verified=false）
  await ir.set(investorUnverified.address, investorUnverified.address, false);

  // 4) 转账检查
  const amt = ethers.parseUnits("1000", 18);

  // 合规检查布尔值
  console.log("\n=== Compliance checks ===");
  console.log("ok:", await dt.isERC3643Compliant(investorOK.address));
  console.log("noKYC:", await dt.isERC3643Compliant(investorNoKYC.address));
  console.log("noACC:", await dt.isERC3643Compliant(investorNoACC.address));
  console.log("badCountry:", await dt.isERC3643Compliant(investorBadCountry.address));
  console.log("unverified:", await dt.isERC3643Compliant(investorUnverified.address));

  // 注册表与声明概览
  console.log("\n=== Registries & Claims ===");
  console.log("IdentityRegistry:", await dt.identityRegistry());
  console.log("ClaimsRegistry:", await dt.claimsRegistry());
  console.log("isVerified(OK):", await ir.isVerified(investorOK.address));
  console.log("hasClaim(OK,KYC):", await cr.hasClaim(investorOK.address, KYC));
  console.log("getClaim(OK,COUNTRY):", await cr.getClaim(investorOK.address, COUNTRY));

  // 持仓限制检查
  console.log("\n=== Holding Limit ===");
  console.log("maxHoldingPercentage:", (await dt.maxHoldingPercentage()).toString());
  console.log("checkHoldingLimit(OK,1000):", await dt.checkHoldingLimit(investorOK.address, amt));

  async function tryTransfer(to, label) {
    try {
      await dt.connect(issuer).transfer(to, amt);
      const bal = await dt.balanceOf(to);
      console.log(`Transfer to ${label}: OK, balance=${bal}`);
    } catch (e) {
      console.log(`Transfer to ${label}: REVERT ->`, e.shortMessage || e.message);
    }
  }

  console.log("\n=== Transfer checks ===");
  await tryTransfer(investorOK.address, "OK (KYC+ACC+US)");            // 预期成功
  await tryTransfer(investorNoKYC.address, "NoKYC");                   // 预期失败
  await tryTransfer(investorNoACC.address, "NoACC");                   // 预期失败
  await tryTransfer(investorBadCountry.address, "BadCountry (CN)");    // 预期失败
  await tryTransfer(investorUnverified.address, "Unverified");         // 预期失败

  // 尝试触发持仓上限（10%）
  const total = await dt.totalSupply();
  const max = (total * 1000n) / 10000n;
  const cur = await dt.balanceOf(investorOK.address);
  const exceedBy1 = max - cur + 1n;
  console.log("\nExceed limit attempt...");
  await tryTransfer(investorOK.address, `Exceed by 1 wei (${exceedBy1})`);

  // 5) 可选：演示利息/本金函数
  console.log("\nPay interest and redeem principal (owner only)...");
  await dt.connect(issuer).payInterest();
  await dt.connect(issuer).redeemPrincipal();
  console.log("Lifecycle events executed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
