const hre = require("hardhat");

async function main() {
  // Get signers. The first signer is the deployer (issuer).
  const [issuer, investor1, investor2, nonInvestor] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", issuer.address);

  // Deploy the DebtToken contract
  const tokenName = "Real Estate Debt Bond";
  const tokenSymbol = "REDB";
  const initialSupply = 1000000; // 1,000,000 tokens
  const DebtToken = await hre.ethers.getContractFactory("DebtToken");
  const debtToken = await DebtToken.deploy(tokenName, tokenSymbol, initialSupply);

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

  console.log("\n--- 2. Testing Compliant Transfers ---");
  const transferAmount = hre.ethers.parseUnits("1000", 18); // Transfer 1000 tokens

  // Scenario 2a: Successful transfer from Issuer to a whitelisted investor
  console.log(`\nTransferring ${hre.ethers.formatEther(transferAmount)} tokens from Issuer to Investor 1...`);
  await debtToken.connect(issuer).transfer(investor1.address, transferAmount);
  console.log("Transfer successful!");
  console.log(`Investor 1 balance: ${await debtToken.balanceOf(investor1.address)}`);

  // Scenario 2b: Successful transfer between two whitelisted investors
  console.log(`\nTransferring ${hre.ethers.formatEther(transferAmount)} tokens from Investor 1 to Investor 2...`);
  await debtToken.connect(investor1).transfer(investor2.address, transferAmount);
  console.log("Transfer successful!");
  console.log(`Investor 2 balance: ${await debtToken.balanceOf(investor2.address)}`);

  // Scenario 2c: Failed transfer to a non-whitelisted address
  console.log(`\nAttempting to transfer tokens from Issuer to a non-whitelisted address (${nonInvestor.address})...`);
  try {
    await debtToken.connect(issuer).transfer(nonInvestor.address, transferAmount);
  } catch (error) {
    console.log("Transfer failed as expected!");
    console.log("Error message:", error.message.slice(0, 100) + "..."); // Show a snippet of the error
  }

  console.log("\n--- 3. Demonstrating Debt Lifecycle ---");
  
  // Scenario 3a: Issuer pays interest
  console.log("\nIssuer is paying interest...");
  const payInterestTx = await debtToken.connect(issuer).payInterest();
  const payInterestReceipt = await payInterestTx.wait();
  // Find the event in the transaction receipt
  const interestEvent = payInterestReceipt.logs.find(log => {
      try {
          const parsedLog = debtToken.interface.parseLog(log);
          return parsedLog && parsedLog.name === "InterestPaid";
      } catch(e) { return false; }
  });
  if (interestEvent) {
      console.log(`InterestPaid event emitted: "${interestEvent.args[1]}" at timestamp ${interestEvent.args[0]}`);
  }

  // Scenario 3b: Issuer redeems principal
  console.log("\nIssuer is redeeming principal...");
  const redeemPrincipalTx = await debtToken.connect(issuer).redeemPrincipal();
  const redeemPrincipalReceipt = await redeemPrincipalTx.wait();
  // Find the event in the transaction receipt
  const redeemEvent = redeemPrincipalReceipt.logs.find(log => {
    try {
        const parsedLog = debtToken.interface.parseLog(log);
        return parsedLog && parsedLog.name === "PrincipalRedeemed";
    } catch(e) { return false; }
  });
  if (redeemEvent) {
      console.log(`PrincipalRedeemed event emitted: "${redeemEvent.args[1]}" at timestamp ${redeemEvent.args[0]}`);
  }

  console.log("\n--- Workshop Demonstration Complete ---");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
