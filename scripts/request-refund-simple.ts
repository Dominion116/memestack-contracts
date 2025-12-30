#!/usr/bin/env node

/**
 * Simple script to request refund - finds your contribution and requests refund
 * 
 * Usage:
 *   npm run request-refund-simple -- <contract-address> [network]
 * 
 * Example:
 *   npm run request-refund-simple -- SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y.block-lotto mainnet
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  uintCV,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { createNetwork, StacksNetwork } from "@stacks/network";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import * as readline from "readline";

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error("Usage: npm run request-refund-simple -- <contract-address> [network]");
  console.error("Example: npm run request-refund-simple -- SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y.block-lotto mainnet");
  process.exit(1);
}

const contractAddress = args[0];
const networkArg = args[1] || "mainnet";

// Determine network
const network = createNetwork(networkArg === "mainnet" ? "mainnet" : "testnet");
const apiUrl = networkArg === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

// Parse contract address
const [address, contractName] = contractAddress.split(".");
if (!address || !contractName) {
  console.error("Error: Contract address must be in format: <address>.<contract-name>");
  process.exit(1);
}

const derivePrivateKeyFromMnemonic = (mnemonic: string): string => {
  // Stacks uses BIP32 derivation path: m/44'/5757'/0'/0/0
  const seed = mnemonicToSeedSync(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed);
  const derived = hdkey.derive("m/44'/5757'/0'/0/0");
  const privateKey = derived.privateKey;
  if (!privateKey) {
    throw new Error("Failed to derive private key from mnemonic");
  }
  // Convert to hex string and append 01 for compressed public key
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

async function findContribution(userAddress: string): Promise<number | null> {
  console.log("Searching for your contributions...");
  
  // Check launch IDs 1-20
  for (let launchId = 1; launchId <= 20; launchId++) {
    try {
      const contributionUrl = `${apiUrl}/v2/contracts/call-read/${address}/${contractName}/get-user-contribution`;
      const response = await fetch(contributionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: userAddress,
          arguments: [
            { type: "uint", value: launchId.toString() },
            { type: "principal", value: userAddress },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.okay && data.result) {
          const stxContributed = data.result.value?.["stx-contributed"]?.value || "0";
          const claimed = data.result.value?.claimed?.value || false;
          
          if (stxContributed !== "0") {
            const amountInSTX = (BigInt(stxContributed) / BigInt(1000000)).toString();
            console.log(`\n✅ Found contribution in Launch ID ${launchId}:`);
            console.log(`   Amount: ${amountInSTX} STX`);
            console.log(`   Already claimed/refunded: ${claimed ? "Yes" : "No"}`);
            
            // Check launch status
            const launchUrl = `${apiUrl}/v2/contracts/call-read/${address}/${contractName}/get-launch`;
            const launchResponse = await fetch(launchUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sender: userAddress,
                arguments: [{ type: "uint", value: launchId.toString() }],
              }),
            });

            if (launchResponse.ok) {
              const launchData = await launchResponse.json();
              if (launchData.okay && launchData.result) {
                const launch = launchData.result.value;
                const isFinalized = launch["is-finalized"]?.value || false;
                const isSuccessful = launch["is-successful"]?.value || false;
                
                console.log(`   Launch finalized: ${isFinalized ? "Yes" : "No"}`);
                console.log(`   Launch successful: ${isSuccessful ? "Yes" : "No"}`);
                
                if (isFinalized && !isSuccessful && !claimed) {
                  console.log(`   ✅ Can request refund!`);
                  return launchId;
                } else if (claimed) {
                  console.log(`   ⚠️  Already claimed/refunded`);
                } else if (!isFinalized) {
                  console.log(`   ⚠️  Launch not finalized yet`);
                } else if (isSuccessful) {
                  console.log(`   ⚠️  Launch was successful - claim tokens instead`);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }
  
  return null;
}

async function main() {
  try {
    console.log("=== Memestack Refund Request ===");
    console.log(`Network: ${networkArg}`);
    console.log(`Contract: ${contractAddress}`);
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

    // Find contribution
    const launchId = await findContribution(senderAddress);
    
    if (!launchId) {
      console.log("\n❌ No refundable contribution found.");
      console.log("\nPossible reasons:");
      console.log("1. Launch hasn't been finalized yet");
      console.log("2. Launch was successful (you should claim tokens instead)");
      console.log("3. You've already claimed/refunded");
      console.log("4. Launch ID is beyond 20 (contact support)");
      process.exit(1);
    }

    console.log(`\nProceeding with refund for Launch ID ${launchId}...\n`);

    // Get nonce
    console.log("Fetching account nonce...");
    const accountInfoResponse = await fetch(`${apiUrl}/v2/accounts/${senderAddress}?proof=0`);
    if (!accountInfoResponse.ok) {
      throw new Error(`Failed to fetch account info: ${accountInfoResponse.statusText}`);
    }
    const accountInfo = await accountInfoResponse.json();
    const nonce = accountInfo.nonce || 0;
    console.log(`Nonce: ${nonce}\n`);

    // Build transaction
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
    const broadcastResponse = await broadcastTransaction(tx, network);

    if (broadcastResponse.error) {
      console.error("\n❌ Error broadcasting transaction:", broadcastResponse.error);
      if (broadcastResponse.reason) {
        console.error("Reason:", broadcastResponse.reason);
      }
      process.exit(1);
    }

    console.log("\n✅ Transaction broadcasted successfully!");
    console.log(`Transaction ID: ${broadcastResponse.txid}`);
    console.log(`View on explorer: ${network.getTxUrl(broadcastResponse.txid)}`);
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

