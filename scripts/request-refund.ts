#!/usr/bin/env node

/**
 * Script to request a refund from a deployed memecoin launchpad contract
 * 
 * Usage:
 *   npm run request-refund -- <contract-address> <launch-id> [network]
 * 
 * Example:
 *   npm run request-refund -- ST30VGN68PSGVWGNMD0HH2WQMM5T486EK3WBNTHCY.memecoin-launchpad 1 testnet
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  StacksNetwork,
  StacksTestnet,
  StacksMainnet,
  uintCV,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import * as readline from "readline";

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: npm run request-refund -- <contract-address> <launch-id> [network]");
  console.error("Example: npm run request-refund -- ST30VGN68PSGVWGNMD0HH2WQMM5T486EK3WBNTHCY.memecoin-launchpad 1 testnet");
  process.exit(1);
}

const contractAddress = args[0];
const launchId = parseInt(args[1], 10);
const networkArg = args[2] || "testnet";

if (isNaN(launchId)) {
  console.error("Error: launch-id must be a number");
  process.exit(1);
}

// Determine network
let network: StacksNetwork;
let apiUrl: string;

if (networkArg === "mainnet") {
  network = new StacksMainnet();
  apiUrl = "https://api.hiro.so";
} else {
  network = new StacksTestnet();
  apiUrl = "https://api.testnet.hiro.so";
}

// Parse contract address
const [address, contractName] = contractAddress.split(".");
if (!address || !contractName) {
  console.error("Error: Contract address must be in format: <address>.<contract-name>");
  console.error("Example: ST30VGN68PSGVWGNMD0HH2WQMM5T486EK3WBNTHCY.memecoin-launchpad");
  process.exit(1);
}

// Get private key from environment or prompt
const getPrivateKey = async (): Promise<string> => {
  if (process.env.STACKS_PRIVATE_KEY) {
    return process.env.STACKS_PRIVATE_KEY;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter your private key (or set STACKS_PRIVATE_KEY env var): ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

async function main() {
  try {
    console.log("=== Memestack Refund Request ===");
    console.log(`Network: ${networkArg}`);
    console.log(`Contract: ${contractAddress}`);
    console.log(`Launch ID: ${launchId}`);
    console.log("");

    // Get private key
    const privateKey = await getPrivateKey();
    if (!privateKey) {
      console.error("Error: Private key is required");
      process.exit(1);
    }

    // Derive sender address from private key
    const senderAddress = getAddressFromPrivateKey(privateKey, network.version);
    console.log(`Sender: ${senderAddress}`);
    console.log("");

    // Get nonce from API
    console.log("Fetching account nonce...");
    const accountInfoResponse = await fetch(`${apiUrl}/v2/accounts/${senderAddress}?proof=0`);
    if (!accountInfoResponse.ok) {
      throw new Error(`Failed to fetch account info: ${accountInfoResponse.statusText}`);
    }
    const accountInfo = await accountInfoResponse.json();
    const nonce = accountInfo.nonce || 0;
    console.log(`Nonce: ${nonce}`);
    console.log("");

    // Build the contract call
    console.log("Building transaction...");
    const tx = await makeContractCall({
      contractAddress: address,
      contractName: contractName,
      functionName: "request-refund",
      functionArgs: [uintCV(launchId)],
      senderKey: privateKey,
      network,
      nonce,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 1000, // Base fee, will be adjusted if needed
    });

    console.log("Transaction built successfully!");
    console.log(`Transaction ID: ${tx.txid()}`);
    console.log("");

    // Confirm before broadcasting
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question("Broadcast transaction? (yes/no): ", resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
      console.log("Transaction cancelled.");
      process.exit(0);
    }

    // Broadcast transaction
    console.log("Broadcasting transaction...");
    const broadcastResponse = await broadcastTransaction(tx, network);

    if (broadcastResponse.error) {
      console.error("Error broadcasting transaction:", broadcastResponse.error);
      if (broadcastResponse.reason) {
        console.error("Reason:", broadcastResponse.reason);
      }
      process.exit(1);
    }

    console.log("");
    console.log("✅ Transaction broadcasted successfully!");
    console.log(`Transaction ID: ${broadcastResponse.txid}`);
    console.log(`View on explorer: ${network.getTxUrl(broadcastResponse.txid)}`);
    console.log("");
    console.log("Waiting for confirmation...");
    console.log("You can check the status on the explorer link above.");

  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

