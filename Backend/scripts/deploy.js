const hre = require("hardhat");
const { ethers } = require("ethers");
const fs = require("fs");

async function main() {
    console.log("Compiling contracts...");
    await hre.run("compile");

    console.log("Connecting to Hardhat local node...");
    // Connect to local Hardhat node running via "npx hardhat node"
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    // Hardhat's default standard test account #0
    const deployerPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const wallet = new ethers.Wallet(deployerPrivateKey, provider);

    console.log(`Deploying from account: ${wallet.address}`);

    // Load compiled artifacts manually
    const artifactPath = "./artifacts/contracts/Voting.sol/Voting.json";
    if (!fs.existsSync(artifactPath)) {
        console.error("Compiled artifacts not found. Did compilation fail?");
        process.exit(1);
    }

    const contractArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

    const factory = new ethers.ContractFactory(
        contractArtifact.abi,
        contractArtifact.bytecode,
        wallet
    );

    console.log("Deploying Voting Contract...");
    const votingContract = await factory.deploy();
    await votingContract.waitForDeployment();

    const address = await votingContract.getAddress();

    console.log(`\n✅ Contract deployed successfully!`);
    console.log(`📄 Contract Address: ${address}`);
    console.log(`\n👉 Next Steps:`);
    console.log(`Copy the contract address above and paste it into Backend/.env :`);
    console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
