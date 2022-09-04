const { assert, expect } = require("chai");
const { deployments, getNamedAccounts, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");
!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery", function () {
      console.log("unit tests");
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

      describe("Enter Raffle", function () {
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

      describe("FulfillRandomWords", function () {
        beforeEach(async function () {
          // So that someone has already entered the lottery and the time has passed
          await lottery.enterRaffle({ value: lotteryEntranceFee });
          console.log("entered lotery address", lottery.signer.address);
          await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
          await network.provider.send("evm_mine", []);
        });

        it("can obly be called after performUpKeep", async function () {
          // The VRFCoodinator contract has the function fulfillRandomWords which is called by the VRFCoodinator contract, nad takes in the requestID of the request for the random words
          // Since we have made a request we'll get reverted if we call that function directly, without calling performUpkeep (since we arent calling requestRandomWords)
          await expect(
            VRFCoordinatorMockV2.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request"); // 0 is the requestID  , lottery.address is the address of the contract which is requesting the random words i.e consumer address  (which has to be registered with the VRFCoodinator contract)
        });

        it("pick a winner ,reset lottery  and sends money ", async function () {
          const additionalEntrants = 3;
          const startingAccountIndex = 1; // since 0 is the deployer account
          const accounts = await ethers.getSigners();
          for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
            const lotteryConnectedWithThatAccount = lottery.connect(accounts[i]); // with this method lottery contract is connected with the ith account , so methods called on this contract will be signed by the ith account
            await lotteryConnectedWithThatAccount.enterRaffle({ value: lotteryEntranceFee });
            // console.log("entered lotery address", lotteryConnectedWithThatAccount.signer.address);
          }
          const txnRes = await lottery.getParticipant([0]);
          // Now we'll call performUpKeep (Thus thereby mocking keepers since they call performUpKeep)
          // We'll call fulfillRandomWords (Thus thereby mocking the VRFCoodinator contract since it calls fulfillRandomWords WHEN we call requestRandomWords and passed the random numbers to the fulfillRandomWords function)
          // We'll have to wait for fulfullRandomWords to be called by the VRFCoodinator contract on the mainnet or testnet , since the coordinator contract will call it that time and not us when we call the requestRandomWords function
          // So to replicate that functionality , i.e to wait for fulfillRandomWords to be called , we'll have to
          // CREATE A PRMISE WHICH WAITS UNTIL fulfillRandomWords IS CALLED AND THEN RESOLVES IT , so thereby replicating that we wait until the event is emitted by fulfillRandomWords and thus us then resolving the promise  and carrying on the tests
          const startingTimestamp = await lottery.getLatestTimestamp(); // so we can compare that timestamp gets updated after the winner is picked

          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              // setting an event listener to the lottery contract
              // i.e once the WinnerPicked event is emitted by the fulfillRandomWords function , we resolve the promise , thus implementing the functionality of waiting for fulfillRandomWords to be called by the coordinator contract, once perfromUpkeep is called which requests the random words
              // Now we can check if winner is picked , lottery is reset or not
              // const latestWinner

              try {
                const latestWinner = await lottery.getRecentWinner();
                const endingTimestamp = await lottery.getLatestTimestamp();
                const raffleState = await lottery.getRaffleState();
                const numOfPlayers = await lottery.getNumPlayer();
                console.log("latestWinner", latestWinner);
                const winnerEndingBalance = await accounts[1].getBalance();
                console.log("winnerEndingBalance", winnerEndingBalance.toString());
                assert(winnerEndingBalance.toBigInt() > winnerStartingBalance.toBigInt()); // that winner is paid
                assert(latestWinner); // That winner is picked
                assert(endingTimestamp > startingTimestamp); // that timestamp is updated after winner is picked
                assert(raffleState, 0); // that raffle state is reset
                assert(numOfPlayers, 0); // that number of players is reset
              } catch (err) {
                reject(err);
              }
              resolve();
            });
            // But we do not want to wait foerver for the event to be emitted , so we'll set a timeout by setting mocha :{timeout: 10000} in the hardhat.config.js file, so by donig this we set a timeout for a particualr test and if it runs for more than than the test will fail
            // Now we'll call performUpkeep , to trigger the requestRandomWords function which will emit an event which will be caught by the vrfcoordinator which will then call the fulfillRandomWords function
            const txn = await lottery.performUpkeep([]); // Mocking chain link keepers by calling performUpkeep
            const txnReceipt = await txn.wait(1);
            // Getting the winners accoutn address before money / eth is transferred (in testing the same winner is picked since the mock always returns the same number)
            const winnerStartingBalance = await accounts[1].getBalance();
            await VRFCoordinatorMockV2.fulfillRandomWords(
              txnReceipt.events[1].args.requestId,
              lottery.address
            ); // as we are emitting theRequestRandomWinner after requestRandomWords is called in the performUpkeep function , where we are passing the requestId of the request for random words returned by requestRandomWords, we need it since we are mocking the VRFCoodinator contract and calling the fulfillRandomWords function directly ourselves
            // Mocking vrf coordinator by calling fulfillRandomWords
          });
        });
      });
    });
