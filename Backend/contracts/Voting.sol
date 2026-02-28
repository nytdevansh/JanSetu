// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Voting {
    struct Vote {
        string voterHash;   // Hashed voter ID for anonymity
        uint256 electionId; // ID of the election
        string candidate;   // Chosen candidate/party
        uint256 timestamp;  // Time vote was cast
    }

    // Array of all cast votes
    Vote[] public votes;

    // Mapping to check if a voterHash has already voted in a specific election
    // voterHash => (electionId => hasVoted)
    mapping(string => mapping(uint256 => bool)) public hasVoted;

    // Event emitted when a vote is successfully cast
    event VoteCast(string indexed voterHash, uint256 indexed electionId, string candidate, uint256 timestamp);

    /**
     * @dev Cast a vote on the blockchain
     * @param _voterHash The anonymized hash of the voter's identity
     * @param _electionId The ID of the primary election
     * @param _candidate The chosen party/candidate
     */
    function castVote(string memory _voterHash, uint256 _electionId, string memory _candidate) public {
        require(!hasVoted[_voterHash][_electionId], "Voter has already cast a vote in this election");

        Vote memory newVote = Vote({
            voterHash: _voterHash,
            electionId: _electionId,
            candidate: _candidate,
            timestamp: block.timestamp
        });

        votes.push(newVote);
        hasVoted[_voterHash][_electionId] = true;

        emit VoteCast(_voterHash, _electionId, _candidate, block.timestamp);
    }

    /**
     * @dev Get total number of votes cast across all elections
     */
    function getTotalVotes() public view returns (uint256) {
        return votes.length;
    }

    /**
     * @dev Fetch a specific vote by its index
     */
    function getVote(uint256 index) public view returns (string memory, uint256, string memory, uint256) {
        require(index < votes.length, "Vote index out of bounds");
        Vote memory v = votes[index];
        return (v.voterHash, v.electionId, v.candidate, v.timestamp);
    }
}
