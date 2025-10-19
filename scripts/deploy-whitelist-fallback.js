/**
 * DEPRECATED/LEGACY: Whitelist-only fallback demo
 *
 * 本脚本仅用于“白名单回退模式”的老示例，不展示 KYC/合规路径。
 * 当前推荐脚本：scripts/deploy-erc3643-kyc.js
 */

const hre = require("hardhat");

async function main() {
  const { ethers } = hre;

  console.warn("[Deprecated] 该脚本仅用于白名单回退模式演示，不展示 KYC/合规。");

  // Get signers. The first signer is the deployer (issuer).
  const [issuer, investor1, investor2, nonInvestor] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", issuer.address);

  // Deploy the DebtToken contract with zero registries to trigger whitelist fallback
  const tokenName = "Real Estate Debt Bond";
  const tokenSymbol = "REDB";
  const initialSupply = 1_000_000; // 1,000,000 tokens
  const DebtToken = await ethers.getContractFactory("DebtToken");
  const debtToken = await DebtToken.deploy(
    tokenName,
    tokenSymbol,
    initialSupply,
    ethers.ZeroAddress, // identityRegistry = 0 → fallback to whitelist
    ethers.ZeroAddress  // claimsRegistry   = 0 → fallback to whitelist
  );

  await debtToken.waitForDeployment();
  const debtTokenAddress = await debtToken.getAddress();

  console.log(`\nDebtToken "${tokenName}" (${tokenSymbol}) deployed to:`, debtTokenAddress);
  console.log(`Issuer has an initial supply of ${await debtToken.balanceOf(issuer.address)} tokens.`);

  console.log("\n--- 1. Whitelisting Investors ---");
  console.log(`Adding ${investor1.address} (Investor 1) to whitelist...`);
  await debtToken.connect(issuer).addInvestor(investor1.address);
  console.log(`Adding ${investor2.address} (Investor 2) to whitelist...`);
  await debtToken.connect(issuer).addInvestor(investor2.address);
  console.log("Whitelist setup complete.");
  console.log(`Is Investor 1 whitelisted? ${await debtToken.isWhitelisted(investor1.address)}`);
  console.log(`Is Non-Investor whitelisted? ${await debtToken.isWhitelisted(nonInvestor.address)}`);

  console.log("\n--- 2. Testing Transfers (Whitelist Fallback) ---");
  const transferAmount = ethers.parseUnits("1000", 18); // Transfer 1000 tokens

  // Scenario 2a: Successful transfer from Issuer to a whitelisted investor
  console.log(`\nTransferring ${ethers.formatEther(transferAmount)} tokens from Issuer to Investor 1...`);
  await debtToken.connect(issuer).transfer(investor1.address, transferAmount);
  console.log("Transfer successful!");
  console.log(`Investor 1 balance: ${await debtToken.balanceOf(investor1.address)}`);

  // Scenario 2b: Successful transfer between two whitelisted investors
  console.log(`\nTransferring ${ethers.formatEther(transferAmount)} tokens from Investor 1 to Investor 2...`);
  await debtToken.connect(investor1).transfer(investor2.address, transferAmount);
  console.log("Transfer successful!");
  console.log(`Investor 2 balance: ${await debtToken.balanceOf(investor2.address)}`);

  // Scenario 2c: Failed transfer to a non-whitelisted address
  console.log(`\nAttempting to transfer tokens from Issuer to a non-whitelisted address (${nonInvestor.address})...`);
  try {
    await debtToken.connect(issuer).transfer(nonInvestor.address, transferAmount);
  } catch (error) {
    console.log("Transfer failed as expected!");
    console.log("Error message:", (error.shortMessage || error.message || "").toString().slice(0, 160));
  }

  console.log("\n--- 3. Demonstrating Debt Lifecycle ---");

  // Scenario 3a: Issuer pays interest
  console.log("\nIssuer is paying interest...");
  const payInterestTx = await debtToken.connect(issuer).payInterest();
  await payInterestTx.wait();
  console.log("InterestPaid event should be emitted.");

  // Scenario 3b: Issuer redeems principal
  console.log("\nIssuer is redeeming principal...");
  const redeemPrincipalTx = await debtToken.connect(issuer).redeemPrincipal();
  await redeemPrincipalTx.wait();
  console.log("PrincipalRedeemed event should be emitted.");

  console.log("\n--- Legacy Whitelist Demo Complete ---");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
