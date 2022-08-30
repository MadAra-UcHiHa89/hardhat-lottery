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

error Lottery_NotEnoughEthEntered();
error TransferFailed();

contract Lottery is VRFConsumerBaseV2 {
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

    // Events
    event RaffleEnter(address indexed player); // Event to be emitted when a player enters the lottery
    event RequestRaffleWinner(uint256 indexed requestId); // Event to be emitted when a request is made to pick a winner
    event WinnerPicked(address indexed winnerPicked); // Event to be emitted when a winner is picked, here we are using the logs of events  as a data storage in order to keep track of previous winners

    constructor(
        address vrfCoordinatorV2,
        uint256 _entranceFee,
        bytes32 _keyHash,
        uint64 _subscriptionId,
        uint32 _callbackGasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        // vrfCoordinatorV2 -> addres of the vrf coordinator contract , which gets and verifies the randomness
        // VRFConsumerBaseV2(vrfCoordinatorV2) -> constructor of the base contract which needs the addres of the coordinator contract
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2); // Now we have the coordinator contract, to call the functions
        i_entranceFee = _entranceFee;
        i_keyHash = _keyHash;
        i_subscriptionId = _subscriptionId;
        i_callbackGasLimit = _callbackGasLimit;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Lottery_NotEnoughEthEntered(); // using custom erros instead of ervert with message to avoid storing the message in the storage
        }
        s_participants.push(payable(msg.sender)); // Adding the sender to the array of participants , doing explicit typecasting to make address to  address payable
        emit RaffleEnter(msg.sender); // Emitting the event
    }

    function requestRandmomWinner() external {
        // Requent random number from the VRF coordinator contract
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

    // fulfills the request from the coordinator contract , randomWords -> array containing the random words , requestId -> id of the request
    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        // This function is declared in the VRFConsumerBaseV2 contract , and we have to override it
        // Now the random number we get is going to be huge so , we'll use ranom number % number of participants to get an index of winner
        uint256 winnerIndex = randomWords[0] % s_participants.length;
        address payable RecentWinner = s_participants[winnerIndex]; // winner is the address of the winner
        // Now we'll send the ether to the winner
        (bool success, ) = RecentWinner.call{value: address(this).balance}(""); // sending the ether to the winner
        if (!success) {
            revert TransferFailed();
        }
        emit WinnerPicked(RecentWinner); // Emitting the event , so that a log is created for the event and hence storing the winner
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee; // Cheap gas wise since its a immutable variable and not a storage variable
    }

    function getParticipant(uint256 _index) public view returns (address) {
        return s_participants[_index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }
}
