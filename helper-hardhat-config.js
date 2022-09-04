const { ethers } = require("hardhat");

const networkConfig = {
  5: {
    name: "goreli",
    vrfCoordinatorV2: "0x2ca8e0c643bde4c2e08ab1fa0da3401adad7734d",
    // When deploying to testnets we'll use real deployed coordinatosr address , while in testing we'll use mock's address
    entranceFee: ethers.utils.parseEther("0.01"),
    gasLane: "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15",
    subscriptionId: 987, // actual subId
    callbackGasLimit: "500000", // 500000 ,500k gas limit
    interval: "30", // 30 seconds
  },
  1337: {
    name: "hardhat",
    entranceFee: ethers.utils.parseEther("0.01"),
    gasLane: "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15", // since using mocks so no effect
    callbackGasLimit: "500000", // 500000 ,500k gas limit
    interval: "30",
  },
};

const developmentChains = ["hardhat", "localhost"]; // Array of chains / networks which are for development , used to check if we are deploying to development chain or testnet/mainnet

module.exports = { networkConfig, developmentChains }; // Exported to be used in other files
