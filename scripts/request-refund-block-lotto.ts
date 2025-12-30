#!/usr/bin/env node

/**
 * Script to request refund from block-lotto contract
 * 
 * Usage:
 *   npm run request-refund-block-lotto -- [network]
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { createNetwork, clientFromNetwork } from "@stacks/network";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import * as readline from "readline";

const args = process.argv.slice(2);
const networkArg = args[0] || "mainnet";

// Determine network
const network = createNetwork(networkArg === "mainnet" ? "mainnet" : "testnet");
const apiUrl = networkArg === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

// Contract details
const contractAddress = "SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y";
const contractName = "block-lotto";

const derivePrivateKeyFromMnemonic = (mnemonic: string): string => {
  const seed = mnemonicToSeedSync(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed);
  const derived = hdkey.derive("m/44'/5757'/0'/0/0");
  const privateKey = derived.privateKey;
  if (!privateKey) {
    throw new Error("Failed to derive private key from mnemonic");
  }
  return Buffer.from(privateKey).toString("hex") + "01";
};

const getPrivateKey = async (): Promise<string> => {
  // Check for mnemonic first
  if (process.env.STACKS_MNEMONIC) {
    return derivePrivateKeyFromMnemonic(process.env.STACKS_MNEMONIC);
  }

  // Check for private key
  if (process.env.STACKS_PRIVATE_KEY) {
    return process.env.STACKS_PRIVATE_KEY;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter your mnemonic (24 words) or private key: ", (answer) => {
      rl.close();
      const input = answer.trim();
      // If it looks like a mnemonic (has spaces), convert it
      if (input.includes(" ")) {
        resolve(derivePrivateKeyFromMnemonic(input));
      } else {
        resolve(input);
      }
    });
  });
};

async function main() {
  try {
    console.log("=== Block Lotto Refund Request ===");
    console.log(`Network: ${networkArg}`);
    console.log(`Contract: ${contractAddress}.${contractName}`);
    console.log("");

    // Get private key
    const privateKey = await getPrivateKey();
    if (!privateKey) {
      console.error("Error: Private key is required");
      process.exit(1);
    }

    // Derive sender address
    const senderAddress = getAddressFromPrivateKey(privateKey, network.version);
    console.log(`Your Address: ${senderAddress}`);
    console.log("");

    // Get nonce
    console.log("Fetching account nonce...");
    const accountInfoResponse = await fetch(`${apiUrl}/v2/accounts/${senderAddress}?proof=0`);
    if (!accountInfoResponse.ok) {
      throw new Error(`Failed to fetch account info: ${accountInfoResponse.statusText}`);
    }
    const accountInfo = await accountInfoResponse.json();
    const nonce = accountInfo.nonce || 0;
    console.log(`Nonce: ${nonce}\n`);

    // Build transaction - refund function takes no arguments
    console.log("Building transaction...");
    const tx = await makeContractCall({
      contractAddress: contractAddress,
      contractName: contractName,
      functionName: "refund",
      functionArgs: [], // No arguments needed
      senderKey: privateKey,
      network,
      nonce,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: 1000,
    });

    console.log("Transaction built successfully!");
    console.log(`Transaction ID: ${tx.txid()}\n`);

    // Confirm
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

    // Broadcast
    console.log("\nBroadcasting transaction...");
    // broadcastTransaction expects the transaction object, not the tx itself
    const broadcastResponse = await broadcastTransaction({ transaction: tx, client: network.client });

    if (broadcastResponse.error) {
      console.error("\n❌ Error broadcasting transaction:", broadcastResponse.error);
      if (broadcastResponse.reason) {
        console.error("Reason:", broadcastResponse.reason);
      }
      process.exit(1);
    }

    console.log("\n✅ Transaction broadcasted successfully!");
    console.log(`Transaction ID: ${broadcastResponse.txid}`);
    const explorerUrl = networkArg === "mainnet" 
      ? `https://explorer.stacks.co/txid/${broadcastResponse.txid}?chain=mainnet`
      : `https://explorer.stacks.co/txid/${broadcastResponse.txid}?chain=testnet`;
    console.log(`View on explorer: ${explorerUrl}`);
    console.log("\nWaiting for confirmation...");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

