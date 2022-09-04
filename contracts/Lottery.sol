//SPDX-License-identifier: MIT
// Raffle
// Want people to:
// Enter the lottery (by paying some ether)
// Pick a random winner( but verifiable randomness)
// Winner to be selected every X minutes => Completely automated (no human interventiononce contract is deployed)
// We'll need to use : Chainlink oracle -> Verifiable randomness , Automated Execution of picking winner -> Chainlink keepers

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol"; // interface of vrf coordinator , so that we can interact with the vrf coordinator contract
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol"; // The vrf Consumer base contract, contarcts that consume vrfs must inherit this contract
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol"; // KeeperCompatible.sol imports the functions from both ./KeeperBase.sol and ./interfaces/KeeperCompatibleInterface.sol
import "hardhat/console.sol";

error Lottery_NotEnoughEthEntered();
error TransferFailed();
error LotteryNotOpen();
error UpKeepNotNeeded(uint256 currentBalance, uint256 currentPlayers, uint256 currenRaffleState);

/**
 * @title A contract for lottery
 * @author Aadil Saudagar
 * @notice This contract is for a decetralised lottery
 * @dev This implements chainlink vrf v2 for random words and keepers for execution of lottery winner function after regular interval
 */
contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
    // Type declarations
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    /* State Vairables */
    uint256 private immutable i_entranceFee; // is configurable at the time of contract deployment
    address payable[] private s_participants; // type -> address payable since we will have to pay a player if he wins the lottery
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator; // VRF coordinator contract
    bytes32 private immutable i_keyHash; // bytes32 => 32 bytes
    uint64 private immutable i_subscriptionId; // subscription id of the subscription that provides funds for the requests to this contract ( only if this contract is a subscriber)
    uint32 private immutable i_callbackGasLimit; // sets the gas limit the callback after the random number is returned , will be able to use at max
    uint16 private constant REQUEST_CONFIRMATIONS = 3; //: How many confirmations the Chainlink node should wait before responding. The longer the node waits, the more secure the random value is.
    uint32 private constant NUM_WORDS = 1; // number of random words to be generated

    // Lottery Variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp; // Store the last lottery's result time (in seconds), we'll update it to new value only when a lottery's result is declared
    uint256 private immutable i_interval; // interval between lottery results (in seconds)

    // Events
    event RaffleEnter(address indexed player); // Event to be emitted when a player enters the lottery
    event RequestRaffleWinner(uint256 indexed requestId); // Event to be emitted when a request is made to pick a winner
    event WinnerPicked(address indexed winnerPicked); // Event to be emitted when a winner is picked, here we are using the logs of events  as a data storage in order to keep track of previous winners

    //functions
    constructor(
        address vrfCoordinatorV2, // contract
        uint256 _entranceFee,
        bytes32 _keyHash,
        uint64 _subscriptionId,
        uint32 _callbackGasLimit,
        uint256 _interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        // vrfCoordinatorV2 -> addres of the vrf coordinator contract , which gets and verifies the randomness
        // VRFConsumerBaseV2(vrfCoordinatorV2) -> constructor of the base contract which needs the addres of the coordinator contract
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2); // Now we have the coordinator contract, to call the functions
        i_entranceFee = _entranceFee;
        i_keyHash = _keyHash;
        i_subscriptionId = _subscriptionId;
        i_callbackGasLimit = _callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp; // Since we have to initialse it with the current block time stamp at the time of contract deployment , so it can be a refernce for future interval calculations
        i_interval = _interval;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Lottery_NotEnoughEthEntered(); // using custom erros instead of ervert with message to avoid storing the message in the storage
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert LotteryNotOpen();
        }
        s_participants.push(payable(msg.sender)); // Adding the sender to the array of participants , doing explicit typecasting to make address to  address payable

        emit RaffleEnter(msg.sender); // Emitting the event
    }

    // fulfills the request from the coordinator contract , randomWords -> array containing the random words , requestId -> id of the request
    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        // This function is declared in the VRFConsumerBaseV2 contract , and we have to override it
        // Now the random number we get is going to be huge so , we'll use ranom number % number of participants to get an index of winner
        uint256 winnerIndex = randomWords[0] % s_participants.length;
        address payable RecentWinner = s_participants[winnerIndex]; // winner is the address of the winner
        s_recentWinner = RecentWinner;

        s_raffleState = RaffleState.OPEN; // Raffle is open again , since we have selcetd a winner
        // Reset the players array , so that we can start the lottery again
        s_participants = new address payable[](0);
        s_lastTimeStamp = block.timestamp; // Update the last time stamp to the current time stamp, so that we can calculate the next lottery result time
        // Now we'll send the ether to the winner
        (bool success, ) = RecentWinner.call{value: address(this).balance}(""); // sending the ether to the winner
        if (!success) {
            revert TransferFailed();
        }
        emit WinnerPicked(RecentWinner); // Emitting the event , so that a log is created for the event and hence storing the winner
    }

    // The function which we need to define / implement from the KeeperCompatibleInterface , in order to check if the performUpKeep should be called or not
    /**
     * @dev This function is called by Chain Link Keeper nodes to check if the , the should call the performUpKeep function or not, if upKeepNeeded is true then performUpKeep is called
     * Return tru if:
     * 1] Defined time interval has passed
     * 2] Lottery should have at least 1 player and eth
     * 3] our subsrciption (for keeper nodes to use when calling the checkUpKeep) is funded with enough LINK tokens
     * The lottery should be in "open" state => when we have called the requestRandomWinner function no other player should regoster / enter the raffle
     * So we'll create a state variable for it. of type enum
     */
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData  */ /* performData is returned if some data performUpKeep erquired from the computation performed in checkUpKeep */
        )
    {
        bool isOpen = RaffleState.OPEN == s_raffleState; // checking if the raffle is open or not
        bool hasTimePassed = block.timestamp - s_lastTimeStamp > i_interval; // checking if the time interval has passed or not
        bool enoughPlayers = s_participants.length > 0; // checking if there are enough players or not
        bool hasBalance = address(this).balance > 0; // checking if the contract has enough balance or not
        bool isUpKeepNeeded = isOpen && hasTimePassed && enoughPlayers && hasBalance; // checking if the upkeep i.e declare winner is needed or not , will only be needed if all conditions are true.
        // if function has sane variable name as ibe defined in return , then its retuned automatically , we do not need to explicitly return it
        return (isUpKeepNeeded, bytes(""));
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        // First check if upKeep is needed
        (bool upkeepNeeded, ) = checkUpkeep(""); // calldata does not work with strings , so we changed storage to memory of parameter of checkUpKeep
        if (!upkeepNeeded) {
            revert UpKeepNotNeeded(
                address(this).balance,
                s_participants.length,
                uint256(s_raffleState)
            );
        }
        // The requestRandomWinner function needs to be called if checkUpKeep returns true. so we'll chnage name to performUpKeep in order to prvenet further function calls
        // Requent random number from the VRF coordinator contract
        s_raffleState = RaffleState.CALCULATING; // So that other players can't enter the lottery while we are calculating the winner
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash, // gasLane
            i_subscriptionId, // subscriptionId -> id of subsciption the contract is subscribed to , which funds the requests (with LINK tokens)
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        // requestRandomWords() -> does not return the random number , it returns the request id , the fulfilRandom Number is called by the coordinator contract , which is our callback function ( callbackGasLimit is for this function) which gets passed the random number as the 2nd parameter
        emit RequestRaffleWinner(requestId); // Emitting the event , so that the keeper listening to this event can pick a winner
    }

    // View / pure functions
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee; // Cheap gas wise since its a immutable variable and not a storage variable
    }

    function getParticipant(uint256 _index) public view returns (address) {
        return s_participants[_index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getTime() public view returns (uint256) {
        return block.timestamp;
    }

    function getRaffleState() public view returns (uint256) {
        return uint256(s_raffleState);
    }

    function getNumWords() public pure returns (uint256) {
        // pure -> since NUM_WORDS  is a constant , and stored in the bytecode and not int storage , so although we are reading it , its not view
        return NUM_WORDS;
    }

    function getNumPlayer() public view returns (uint256) {
        return s_participants.length;
    }

    function getLatestTimestamp() public view returns (uint256) {
        return s_lastTimeStamp; // last time stamp is the time stamp of the last time the lottery's result was calculated
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS; // the number of confirmations vrf coordinator needs to get the random number
    }

    function getInterval() public view returns (uint256) {
        return i_interval; // the time interval between the time the lottery result is calculated
    }
}
