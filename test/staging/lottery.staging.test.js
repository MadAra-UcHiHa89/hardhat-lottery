const { assert, expect } = require("chai");
const { deployments, getNamedAccounts, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");

// i.e we only want to run staging tests when we are on testnets and skip when on a local network
console.log("network.name: ", network.name);
console.log(developmentChains.includes(network.name));
console.log(developmentChains);
developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery", function () {
      console.log("Staging tests");
      let lottery;
      let deployer;
      let lotteryEntranceFee;
      let accounts;
      //   let interval;
      //   const chainId = network.config.chainId;
      beforeEach(async function () {
        deployer = await getNamedAccounts().deployer;
        // await deployments.fixture(["all"]); Not needed since contracts will be deployed already on testnet
        lottery = await ethers.getContract("Lottery", deployer);
        lotteryEntranceFee = await lottery.getEntranceFee();
        accounts = await ethers.getSigners();
      });

      describe("FulfillRandomWords", function () {
        it("works with live chainlink keepers and vrfs and returns a random winner", async function () {
          // We just have to enter the raffle , the rest of the things i.e execution of peformUpkeep and calling fulfillRandomWords will be done by chainlink keepers and vrf on the testnet
          const startingTimestamp = await lottery.getLatestTimestamp();

          // We need to setup the event listener before entering the lottery, otherwise we will miss the event if the blockchain is fast

          //   We are using promises since we want to wait until the event is emitted , so if we do not use promises then the test will finish before the event is emitted
          await new Promise(async (resolve, reject) => {
            // adding listener to the lottery
            lottery.once("WinnerPicked", async function () {
              console.log("WinnerPicked event emitted!");
              try {
                // Now once event is fired we can write our assertions
                const recentWinner = await lottery.getRecentWinner();
                const raffleState = await lottery.getRaffleState();
                const winnerEndingBalance = await accounts[0].getBalance(); // Since only one person has entered the raffle so the winner will be the first account i.e the deployer
                const endingTimeStamp = await lottery.getLatestTimestamp();

                // Assertions
                await expect(lottery.getParticipant(0)).to.be.reverted; // Since the lottery has been restarted, so the participant array will be empty
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(raffleState, 0);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                ); // Since only one person has entered the raffle so the balance will be starting balance + entrance fee
                assert(endingTimeStamp > startingTimestamp);
                resolve();
              } catch (err) {
                reject(err);
              }
            });

            // Now we'll enter the lottery
            await lottery.enterRaffle({ value: lotteryEntranceFee });
            console.log("Entered the raffle");
            const winnerStartingBalance = await accounts[0].getBalance();
            console.log("Starting balance of winner is", winnerStartingBalance.toString());
            // Since we are using promise  , the listener will be active until event is emitted and thus resolved else if we did not use promise then the listener will get won't be active since after entering the raffle , the program will finisn execution since all lines have been executed
          });
        });
      });
    });
