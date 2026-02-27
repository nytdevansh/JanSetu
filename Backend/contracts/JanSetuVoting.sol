// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title JanSetuVoting
 * @notice Hybrid blockchain voting contract for JanSetu.
 *         Votes are submitted by a trusted relayer; results are publicly verifiable.
 */
contract JanSetuVoting {

    // ─── State ───────────────────────────────────────────────
    address public admin;
    bool public electionActive;
    uint256 public electionEnd;

    string[] public candidateNames;
    mapping(string => bool) public validCandidate;
    mapping(string => uint256) public candidateVotes;
    mapping(bytes32 => bool) public hasVoted;

    uint256 public totalVotes;

    // ─── Events ──────────────────────────────────────────────
    event VoteCast(bytes32 indexed hashedUserId, string candidate, uint256 timestamp);
    event ElectionEnded(uint256 timestamp, uint256 totalVotes);

    // ─── Modifiers ───────────────────────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this");
        _;
    }

    modifier whenActive() {
        require(electionActive, "Election is not active");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────
    /**
     * @param _candidates List of valid candidate/option names
     * @param _durationSeconds How long the election runs (seconds from now)
     */
    constructor(string[] memory _candidates, uint256 _durationSeconds) {
        require(_candidates.length > 0, "Must have at least one candidate");

        admin = msg.sender;
        electionActive = true;
        electionEnd = block.timestamp + _durationSeconds;

        for (uint256 i = 0; i < _candidates.length; i++) {
            candidateNames.push(_candidates[i]);
            validCandidate[_candidates[i]] = true;
        }
    }

    // ─── Vote Functions ──────────────────────────────────────

    /**
     * @notice Submit a single vote (called by relayer)
     * @param hashedUserId keccak256(userId + salt) — privacy preserving
     * @param candidate The candidate/option name
     */
    function submitVote(bytes32 hashedUserId, string calldata candidate)
        external
        onlyAdmin
        whenActive
    {
        require(!hasVoted[hashedUserId], "User has already voted");
        require(validCandidate[candidate], "Invalid candidate");

        hasVoted[hashedUserId] = true;
        candidateVotes[candidate]++;
        totalVotes++;

        emit VoteCast(hashedUserId, candidate, block.timestamp);
    }

    /**
     * @notice Submit a batch of votes in one transaction (gas optimised)
     * @param hashedUserIds Array of hashed user IDs
     * @param candidates Array of candidate names (same length)
     */
    function submitBatch(
        bytes32[] calldata hashedUserIds,
        string[] calldata candidates
    ) external onlyAdmin whenActive {
        require(hashedUserIds.length == candidates.length, "Array length mismatch");
        require(hashedUserIds.length > 0, "Empty batch");

        for (uint256 i = 0; i < hashedUserIds.length; i++) {
            if (hasVoted[hashedUserIds[i]]) continue; // Skip duplicates silently
            require(validCandidate[candidates[i]], "Invalid candidate in batch");

            hasVoted[hashedUserIds[i]] = true;
            candidateVotes[candidates[i]]++;
            totalVotes++;

            emit VoteCast(hashedUserIds[i], candidates[i], block.timestamp);
        }
    }

    // ─── Election Control ────────────────────────────────────

    /**
     * @notice End the election. Admin can call anytime; anyone can call after deadline.
     */
    function endElection() external {
        require(
            msg.sender == admin || block.timestamp >= electionEnd,
            "Only admin or after deadline"
        );
        require(electionActive, "Already ended");

        electionActive = false;
        emit ElectionEnded(block.timestamp, totalVotes);
    }

    // ─── View Functions ──────────────────────────────────────

    /**
     * @notice Get all candidates and their vote counts
     * @return names Array of candidate names
     * @return votes Array of vote counts (same order)
     */
    function getResults()
        external
        view
        returns (string[] memory names, uint256[] memory votes)
    {
        names = candidateNames;
        votes = new uint256[](candidateNames.length);

        for (uint256 i = 0; i < candidateNames.length; i++) {
            votes[i] = candidateVotes[candidateNames[i]];
        }
    }

    /**
     * @notice Get number of candidates
     */
    function getCandidateCount() external view returns (uint256) {
        return candidateNames.length;
    }

    /**
     * @notice Check if a hashed user ID has already voted
     */
    function checkVoted(bytes32 hashedUserId) external view returns (bool) {
        return hasVoted[hashedUserId];
    }
}
