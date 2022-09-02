const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); // it costs 0.25 LINK // Base fee is the fee in LINK that is charged forrequest to the coordinator
const GAS_PRICE_LINK = 1e9; // Link per gas , calculated based on network traffic
// As the chinalink nodes do external compuation ( by executing checkUpkeep) and pay for gas  ( whenever performUpkeep needs to be called)
//  so these nodes are paid in LINK for gas

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  const args = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    console.log("Deploying Mocks to development chain....");
    // Then we'll deploy the contract
    const VRFCoordinatorV2Mock = await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      args,
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });
    console.log("Mock deployed ");
    console.log("----------------------------------------------------");
  }
};

module.exports.tags = ["all", "mocks"];
