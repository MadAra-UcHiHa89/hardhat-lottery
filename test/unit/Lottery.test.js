const { assert, expect } = require("chai");
const { deployments, getNamedAccounts, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");
!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery", function () {
      let lottery;
      let deployer;
      let VRFCoordinatorMockV2;
      let lotteryEntranceFee;
      let interval;
      const chainId = network.config.chainId;
      beforeEach(async function () {
        deployer = await getNamedAccounts().deployer;
        await deployments.fixture(["all"]);
        lottery = await ethers.getContract("Lottery", deployer);
        VRFCoordinatorMockV2 = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
        lotteryEntranceFee = await lottery.getEntranceFee();
        deployer = (await getNamedAccounts()).deployer;
        // lotteryEntranceFee = lotteryEntranceFee.toString() / 1e18;
        console.log(`Lottery Entrance Fee: ${lotteryEntranceFee}`);
        interval = await lottery.getInterval();
      });

      //   Testing the constructor

      describe("Constructor", function () {
        // Ideally an it should only have one assert
        it("Initilazes the state variables correclty", async function () {
          const lotteryState = await lottery.getRaffleState();
          const interval = await lottery.getInterval();
          assert.equal(lotteryState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("Enter Raffle", async function () {
        it("reverts when not enough eth is transferred", async function () {
          await expect(
            lottery.enterRaffle({ value: ethers.utils.parseEther("0.001") })
          ).to.be.revertedWith("Lottery_NotEnoughEthEntered");
        });

        it("records players when they enter the lottery", async function () {
          await lottery.enterRaffle({
            value: lotteryEntranceFee,
          });
          const playerEntered = await lottery.getParticipant(0);
          console.log(playerEntered);
          assert.equal(playerEntered.toString(), deployer);
        });

        it("emits event on entering the lottery", async function () {
          await expect(lottery.enterRaffle({ value: lotteryEntranceFee })).to.emit(
            lottery,
            "RaffleEnter"
          );
          // for testing event emitted or not we have the same syntax as to check revert . i.e expect(funcCall).to.emit(contract, eventName)
        });

        it("should not allow players to enter when contract is calculating state", async function () {
          await lottery.enterRaffle({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]); // Doing so that thetime of the blockchain is increased so that the pickWinner function can be called
          await network.provider.send("evm_mine", []); // this rpc emthod mines a block
          // No since time has passed , the pickWinner function should  be called
          // pretedning to be a keeper and calling the performUpKeep (  checkUpKeep will return true since all conditions are met)
          console.log("axasx");
          await lottery.performUpkeep([]); // empty array as no call data needs to be passed, with this the state is calculating and hence no players can enter
          await expect(lottery.enterRaffle({ value: lotteryEntranceFee })).to.be.revertedWith(
            "LotteryNotOpen"
          );
        });
      });

      describe("CheckUkeep", function () {
        it("retuns false if no player has enerted the lottery", async function () {
          // we'll have to increase the time so that the pickWinner function can be called
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]); // Doing so that thetime of the blockchain is increased so that the pickWinner function can be called
          await network.provider.send("evm_mine", []); // this rpc emthod mines a block
          // Since time has passed we'll prenetd to be aa keeper and call the checkUpKeep
          const checkUpKeep = await lottery.callStatic.checkUpkeep([]); // checkUpkeep returns an array
          assert.equal(checkUpKeep[0], false);
        });

        it("returns false when raffle isn't open", async function () {
          // All parameters excepts raffle open state must be true i.e time has passed , at least 1 participant
          await lottery.enterRaffle({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]); // Doing so that thetime of the blockchain is increased so that the pickWinner function can be called
          await network.provider.send("evm_mine", []); // this rpc emthod mines a block
          // Now call pickWinner/performUpkeep , so state becomes calculating
          await lottery.performUpkeep([]); // another method to send an empty bytes object is by ("0x")
          const checkUpKeep = await lottery.callStatic.checkUpkeep([]); // checkUpkeep returns an array
          assert.equal(checkUpKeep[0], false);
        });

        it("return false if enpugh time hasn't passed ", async function () {
          // all parameters except time passed must be true
          await lottery.enterRaffle({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() - 2]); // Doing so that thetime of the blockchain is increased so that the pickWinner function can be called
          await network.provider.send("evm_mine", []); // this rpc emthod mines a block
          const checkUpKeep = await lottery.callStatic.checkUpkeep([]); // checkUpkeep returns an array
          assert.equal(checkUpKeep[0], false);
        });

        it("returns true if all condition are true i.e time passed ,>=1 participants,>=0 eth", async function () {
          await lottery.enterRaffle({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]); // Doing so that thetime of the blockchain is increased so that the pickWinner function can be called
          await network.provider.send("evm_mine", []); // this rpc emthod mines a block
          const checkUpKeep = await lottery.callStatic.checkUpkeep([]); // checkUpkeep returns an array
          assert.equal(checkUpKeep[0], true);
        });
      });

      describe("PerformUpkeep", function () {
        it("only runs when checkupkeep is true", async function () {
          await lottery.enterRaffle({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]); // Doing so that thetime of the blockchain is increased so that the pickWinner function can be called
          await network.provider.send("evm_mine", []); // this rpc emthod mines a block
          const txn = await lottery.performUpkeep([]); // another method to send an empty bytes object is by ("0x")
          assert(txn, true); // txn will only have truthsy value if checkupkeep is trye and its not reverted.
        });

        it("reverts when checkUpKeep is false", async function () {
          // Since no player has entered the lottery , the checkUpkeep function will return false
          await expect(lottery.performUpkeep([])).to.be.revertedWith("UpKeepNotNeeded");
        });

        it("updates the raffle state , emits event and calls the coordaintor", async function () {
          await lottery.enterRaffle({ value: lotteryEntranceFee });
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]); // Doing so that thetime of the blockchain is increased so that the pickWinner function can be called
          await network.provider.send("evm_mine", []); // this rpc emthod mines a block
          const txnRes = await lottery.performUpkeep([]);
          const txnReceipt = await txnRes.wait(1);
          const raffleState = await lottery.getRaffleState();
          assert(txnReceipt.events[1].event, "RequestRaffleWinner"); // 2ND Event since the first event is emitted by the coordinator's method which was called
          assert(raffleState, 1); // 0-> OPEN , 1-> CALCULATING
        });
      });
    });
