require('dotenv').config();
const { ethers } = require('ethers');

// 1. Connect to the Polygon Amoy Testnet
// We can use a public RPC URL if one isn't in the .env
const rpcUrl = process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

async function checkBalance() {
    console.log(`\n🔍 Checking balance on Polygon Amoy Testnet...`);
    console.log(`🌐 RPC: ${rpcUrl}`);

    // 2. Get the wallet address
    // We derive it from the private key if provided, or use a public address if provided
    let addressToCheck = process.env.RELAYER_PUBLIC_ADDRESS;
    let privateKey = process.env.RELAYER_PRIVATE_KEY;

    if (!addressToCheck && privateKey) {
        try {
            const wallet = new ethers.Wallet(privateKey);
            addressToCheck = wallet.address;
        } catch (e) {
            console.error('❌ Error: Invalid RELAYER_PRIVATE_KEY format in .env');
            return;
        }
    }

    if (!addressToCheck) {
        console.error('❌ Error: Please provide either RELAYER_PUBLIC_ADDRESS or RELAYER_PRIVATE_KEY in your .env file.');
        return;
    }

    console.log(`📫 Wallet Address: ${addressToCheck}`);

    // 3. Fetch the balance
    try {
        const balanceWei = await provider.getBalance(addressToCheck);

        // Convert from Wei (smallest unit, 18 decimals) to POL
        const balancePOL = ethers.utils.formatEther(balanceWei);

        console.log(`\n💰 Balance: ${balancePOL} POL`);

        if (parseFloat(balancePOL) === 0) {
            console.log(`\n⚠️  Warning: Your balance is 0. Transactions will fail.`);
            console.log(`👉 Get free Testnet POL from: https://faucet.polygon.technology/`);
        } else {
            console.log(`\n✅ Your wallet is funded and ready for transactions!`);
        }

    } catch (error) {
        console.error(`\n❌ Error fetching balance:`, error.message);
    }
}

checkBalance();
