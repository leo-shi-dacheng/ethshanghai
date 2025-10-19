import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("ERC-3643 Compliance (multi-investor demo)", function () {
  async function deployAll() {
    const [
      issuer,
      investorOK,        // 合规：KYC + ACC + US
      investorNoKYC,     // 不合规：缺少 KYC
      investorNoACC,     // 不合规：缺少 ACCREDITED
      investorBadCountry,// 不合规：国家不在允许名单（CN）
      investorUnverified // 不合规：未通过身份验证
    ] = await ethers.getSigners();

    // 1) 部署 Mock 注册表
    const IR = await ethers.getContractFactory("MockIdentityRegistry");
    const CR = await ethers.getContractFactory("MockClaimsRegistry");
    const ir = await IR.deploy();
    const cr = await CR.deploy();
    await ir.waitForDeployment();
    await cr.waitForDeployment();

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

    // 3) 常量与国家码
    const KYC = await dt.KYC_CLAIM();
    const ACC = await dt.ACCREDITED_CLAIM();
    const COUNTRY = await dt.COUNTRY_CLAIM();
    const US = ethers.keccak256(ethers.toUtf8Bytes("US"));
    const CN = ethers.keccak256(ethers.toUtf8Bytes("CN"));

    // 4) 发行方 + 场景化投资者设置
    await ir.set(issuer.address, issuer.address, true);
    await cr.setClaim(issuer.address, KYC, US);
    await cr.setClaim(issuer.address, ACC, US);
    await cr.setClaim(issuer.address, COUNTRY, US);

    // 完全合规（US）
    await ir.set(investorOK.address, investorOK.address, true);
    await cr.setClaim(investorOK.address, KYC, US);
    await cr.setClaim(investorOK.address, ACC, US);
    await cr.setClaim(investorOK.address, COUNTRY, US);

    // 缺少 KYC
    await ir.set(investorNoKYC.address, investorNoKYC.address, true);
    await cr.setClaim(investorNoKYC.address, ACC, US);

    // 缺少 ACC
    await ir.set(investorNoACC.address, investorNoACC.address, true);
    await cr.setClaim(investorNoACC.address, KYC, US);

    // 国家不允许（CN）
    await ir.set(investorBadCountry.address, investorBadCountry.address, true);
    await cr.setClaim(investorBadCountry.address, KYC, CN);
    await cr.setClaim(investorBadCountry.address, ACC, CN);
    await cr.setClaim(investorBadCountry.address, COUNTRY, CN);

    // 未验证身份
    await ir.set(investorUnverified.address, investorUnverified.address, false);

    return { dt, issuer, investorOK, investorNoKYC, investorNoACC, investorBadCountry, investorUnverified };
  }

  it("多地址合规校验 + 生命周期 + 持仓上限", async function () {
    const { dt, issuer, investorOK, investorNoKYC, investorNoACC, investorBadCountry, investorUnverified } = await deployAll();

    const amt = ethers.parseUnits("1000", 18);

    // 成功案例：OK
    await expect(dt.connect(issuer).transfer(investorOK.address, amt)).to.not.be.reverted;
    expect(await dt.balanceOf(investorOK.address)).to.equal(amt);

    // 失败案例：缺少 KYC
    await expect(dt.connect(issuer).transfer(investorNoKYC.address, amt))
      .to.be.revertedWith("DebtToken: 接收方不符合ERC-3643合规要求");

    // 失败案例：缺少 ACC
    await expect(dt.connect(issuer).transfer(investorNoACC.address, amt))
      .to.be.revertedWith("DebtToken: 接收方不符合ERC-3643合规要求");

    // 失败案例：国家不允许（CN）
    await expect(dt.connect(issuer).transfer(investorBadCountry.address, amt))
      .to.be.revertedWith("DebtToken: 接收方不符合ERC-3643合规要求");

    // 失败案例：未验证身份
    await expect(dt.connect(issuer).transfer(investorUnverified.address, amt))
      .to.be.revertedWith("DebtToken: 接收方不符合ERC-3643合规要求");

    // 利息/本金事件
    await expect(dt.connect(issuer).payInterest()).to.emit(dt, "InterestPaid");
    await expect(dt.connect(issuer).redeemPrincipal()).to.emit(dt, "PrincipalRedeemed");

    // 持仓上限：尝试突破 10% 阈值应失败
    const total: bigint = await dt.totalSupply();
    const maxAllowed = (total * 1000n) / 10000n; // 10%
    const current: bigint = await dt.balanceOf(investorOK.address);
    const toExceed = maxAllowed - current + 1n; // 使转入后超出 10%

    await expect(dt.connect(issuer).transfer(investorOK.address, toExceed))
      .to.be.revertedWith("DebtToken: 转账将超过最大持仓限制");
  });
});
