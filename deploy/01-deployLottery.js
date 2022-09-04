const { network, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../helper-hardhat-config");
const { verify } = require("../utils/verify.js");
require("dotenv").config();

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  let VRFCoordinatorV2Address, subscriptionId;
  const VRF_SUB_FUND_AMT = ethers.utils.parseEther("10");
  const chainId = network.config.chainId;

  if (developmentChains.includes(network.name)) {
    // => development chain => mocks address needed
    const VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
    VRFCoordinatorV2Address = VRFCoordinatorV2Mock.address;
    // For development chains we do not have subscription , so we'll have to create it in order to fund the requests for vrf
    const txnRes = await VRFCoordinatorV2Mock.createSubscription();
    const txnReceipt = await txnRes.wait(1);
    // An event is emiited when subscription is created , so we'll get the subscription id from the event, which is returned in txn receipt
    subscriptionId = txnReceipt.events[0].args.subId; // since only one event is emitted in that txn, and as the subscription id is returned in the event args, we'll get it from the event
    // After creating a subscription , we need to fund the subscription with some LINK
    // In mocks its funded wit some fake LINK
    await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMT);
    // funds the subscription with some LINK , which can be used by our contract consumer , to make requests to vrf coordinator
  } else {
    // => Mainnet / testnet
    VRFCoordinatorV2Address = networkConfig[network.config.chainId].vrfCoordinatorV2;
    subscriptionId = networkConfig[network.config.chainId].subscriptionId;
  }
  // console.log(networkConfig);
  // console.log(network.config.chainId);
  // console.log(networkConfig[chainId]);
  const entranceFee = networkConfig[network.config.chainId]["entranceFee"];
  const gasLane = networkConfig[network.config.chainId].gasLane;
  const callbackGasLimit = networkConfig[network.config.chainId].callbackGasLimit;
  const interval = networkConfig[network.config.chainId].interval; // interval bw each lottery result
  const args = [
    VRFCoordinatorV2Address,
    entranceFee,
    gasLane,
    subscriptionId,
    callbackGasLimit,
    interval,
  ];

  const Lottery = await deploy("Lottery", {
    from: deployer,
    args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
    // => not on a dev chain ,  && there's an etherscan api key which is required to verify the contract then only verify the contract
    console.log("Verifying Lottery contract on etherscan...");
    verify(Lottery.address, args);
  }
  console.log("----------------------------------------------------");
};

module.exports.tags = ["all", "lottery"];

// For deployement on testnet we need:
// 0. Create subscription for both VRF and Keepers (can do all these steps either programatically or through a UI)
// 1. get the subscription id from the vrf coordinator
// 2. deploy contract with the subscription id
// 3. Resgister the contract with chainLink VRF ( SO THAT it can make requests to vrf coordinator) & its sub id (so the subscription can finance the requests)
// 4. Register the contract with chainlink keepers once deployed ( so that theyll call the checkUpkeep function of our contract)
// 5. Run Staging Tests
