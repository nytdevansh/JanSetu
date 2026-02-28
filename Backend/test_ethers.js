const ethers = require('ethers');

async function testConnection() {
    console.log('ethers version:', ethers.version);

    // Test 2: Can we connect to Hardhat?
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    try {
        const b = await provider.getBlockNumber();
        console.log('✅ Hardhat block:', b);
    } catch (e) {
        console.error('❌ Hardhat error:', e.message);
        return;
    }

    // Test 3: Can we read the contract?
    const abi = [
        "function getTotalVotes() public view returns (uint256)",
        "function hasVoted(string memory, uint256) public view returns (bool)",
        "event VoteCast(string indexed voterHash, uint256 indexed electionId, string candidate, uint256 timestamp)"
    ];

    // Note: User's env CONTRACT_ADDRESS is 0x5FbDB2315678afecb367f032d93F642f64180aa3
    const contractAddr = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    const contract = new ethers.Contract(contractAddr, abi, provider);

    try {
        const t = await contract.getTotalVotes();
        console.log('✅ Total on-chain votes:', t.toString());

        const filter = contract.filters.VoteCast();
        const events = await contract.queryFilter(filter, 0, 'latest');
        console.log('✅ VoteCast events found:', events.length);

        events.forEach(e => console.log('Event candidate:', e.args.candidate));
    } catch (e) {
        console.error('❌ Contract error:', e.message);
    }
}

testConnection();
