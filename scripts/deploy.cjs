const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const ControlledToken = await ethers.getContractFactory("ControlledToken");

  // ✅ এখানে name, symbol, supply, admin address দিচ্ছো
  const token = await ControlledToken.deploy(
    "Test Token",                  // Token Name
    "TT",                         // Token Symbol
    ethers.parseEther("1000000"), // Total Supply (1,000,000)
    deployer.address              // Admin/Owner wallet
  );

  await token.waitForDeployment();

  console.log("Deployer:", deployer.address);
  console.log("Token deployed at:", await token.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
