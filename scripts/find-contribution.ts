#!/usr/bin/env node

/**
 * Script to find your contributions and launch IDs from a deployed contract
 * 
 * Usage:
 *   npm run find-contribution -- <contract-address> <your-address> [network]
 */

import {
  StacksNetwork,
  StacksTestnet,
  StacksMainnet,
  getAddressFromPrivateKey,
  cvToValue,
} from "@stacks/transactions";
import * as readline from "readline";

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: npm run find-contribution -- <contract-address> <your-address> [network]");
  console.error("Example: npm run find-contribution -- SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y.block-lotto SP2ABC... mainnet");
  process.exit(1);
}

const contractAddress = args[0];
const userAddress = args[1];
const networkArg = args[2] || "mainnet";

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
  process.exit(1);
}

async function main() {
  try {
    console.log("=== Finding Your Contributions ===");
    console.log(`Network: ${networkArg}`);
    console.log(`Contract: ${contractAddress}`);
    console.log(`Your Address: ${userAddress}`);
    console.log("");

    // Try to find contributions by checking common launch IDs
    console.log("Checking launch IDs 1-10 for your contributions...");
    console.log("");

    const contributions: Array<{ launchId: number; amount: string; claimed: boolean }> = [];

    for (let launchId = 1; launchId <= 10; launchId++) {
      try {
        // Try to get user contribution
        const contributionUrl = `${apiUrl}/v2/contracts/call-read/${address}/${contractName}/get-user-contribution`;
        const contributionResponse = await fetch(contributionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: userAddress,
            arguments: [
              {
                type: "uint",
                value: launchId.toString(),
              },
              {
                type: "principal",
                value: userAddress,
              },
            ],
          }),
        });

        if (contributionResponse.ok) {
          const contributionData = await contributionResponse.json();
          
          if (contributionData.okay && contributionData.result) {
            const result = contributionData.result;
            const stxContributed = result.value?.["stx-contributed"]?.value || "0";
            const claimed = result.value?.claimed?.value || false;
            
            if (stxContributed !== "0") {
              const amountInSTX = (BigInt(stxContributed) / BigInt(1000000)).toString();
              contributions.push({
                launchId,
                amount: amountInSTX,
                claimed: claimed === true,
              });
            }
          }
        }

        // Also check if launch exists
        const launchUrl = `${apiUrl}/v2/contracts/call-read/${address}/${contractName}/get-launch`;
        const launchResponse = await fetch(launchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: userAddress,
            arguments: [
              {
                type: "uint",
                value: launchId.toString(),
              },
            ],
          }),
        });

        if (launchResponse.ok) {
          const launchData = await launchResponse.json();
          if (launchData.okay && launchData.result) {
            const launch = launchData.result.value;
            const isFinalized = launch["is-finalized"]?.value || false;
            const isSuccessful = launch["is-successful"]?.value || false;
            
            // Find matching contribution
            const contribution = contributions.find((c) => c.launchId === launchId);
            if (contribution) {
              contribution["finalized"] = isFinalized;
              contribution["successful"] = isSuccessful;
              contribution["canRefund"] = isFinalized && !isSuccessful && !contribution.claimed;
            }
          }
        }
      } catch (error) {
        // Continue to next launch ID
      }
    }

    if (contributions.length === 0) {
      console.log("❌ No contributions found in launch IDs 1-10.");
      console.log("");
      console.log("You may need to check more launch IDs or verify:");
      console.log("1. The contract address is correct");
      console.log("2. Your wallet address is correct");
      console.log("3. You actually contributed to this contract");
      console.log("");
      console.log("You can also check the Stacks Explorer for your transaction history:");
      console.log(`https://explorer.stacks.co/address/${userAddress}?chain=${networkArg}`);
    } else {
      console.log(`✅ Found ${contributions.length} contribution(s):`);
      console.log("");
      
      contributions.forEach((contrib) => {
        console.log(`Launch ID: ${contrib.launchId}`);
        console.log(`  Amount: ${contrib.amount} STX`);
        console.log(`  Claimed/Refunded: ${contrib.claimed ? "Yes" : "No"}`);
        if (contrib["finalized"] !== undefined) {
          console.log(`  Launch Finalized: ${contrib["finalized"] ? "Yes" : "No"}`);
          console.log(`  Launch Successful: ${contrib["successful"] ? "Yes" : "No"}`);
          console.log(`  Can Request Refund: ${contrib["canRefund"] ? "✅ Yes" : "❌ No"}`);
        }
        console.log("");
      });

      const refundable = contributions.filter((c) => c["canRefund"] === true);
      if (refundable.length > 0) {
        console.log("💡 To request a refund, run:");
        refundable.forEach((contrib) => {
          console.log(`   npm run request-refund -- ${contractAddress} ${contrib.launchId} ${networkArg}`);
        });
      }
    }
  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

