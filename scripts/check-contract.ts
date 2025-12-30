#!/usr/bin/env node

/**
 * Script to check contract functions and find contributions
 */

import { createNetwork } from "@stacks/network";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { getAddressFromPrivateKey } from "@stacks/transactions";

const mnemonic = "add aunt series position trade endless general now end budget cute saddle venue upset welcome crucial castle strike gold icon gentle grunt palm avocado";

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

const privateKey = derivePrivateKeyFromMnemonic(mnemonic);
const network = createNetwork("mainnet");
const userAddress = getAddressFromPrivateKey(privateKey, network.version);

console.log("Your Address:", userAddress);
console.log("Contract: SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y.block-lotto");
console.log("\nChecking contract functions and contributions...\n");

const apiUrl = "https://api.hiro.so";
const contractAddress = "SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y";
const contractName = "block-lotto";

async function checkContract() {
  // Check contract source/ABI
  try {
    const contractUrl = `${apiUrl}/v2/contracts/source/${contractAddress}/${contractName}`;
    const response = await fetch(contractUrl);
    if (response.ok) {
      const source = await response.text();
      console.log("Contract found! Checking for refund function...");
      if (source.includes("request-refund")) {
        console.log("✅ Contract has 'request-refund' function");
      } else {
        console.log("⚠️  Contract does not have 'request-refund' function");
        console.log("Available functions:", source.match(/define-public\s+\(([^)]+)\)/g)?.slice(0, 10).join(", ") || "unknown");
      }
    }
  } catch (e) {
    console.log("Could not fetch contract source");
  }

  // Check more launch IDs (1-50)
  console.log("\nSearching launch IDs 1-50 for contributions...\n");
  let foundAny = false;

  for (let launchId = 1; launchId <= 50; launchId++) {
    try {
      // Try get-user-contribution
      const contributionUrl = `${apiUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/get-user-contribution`;
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
          if (stxContributed !== "0") {
            foundAny = true;
            const amountInSTX = (BigInt(stxContributed) / BigInt(1000000)).toString();
            const claimed = data.result.value?.claimed?.value || false;
            console.log(`Launch ID ${launchId}: ${amountInSTX} STX contributed, claimed: ${claimed}`);
            
            // Check launch status
            try {
              const launchUrl = `${apiUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/get-launch`;
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
                  console.log(`  - Finalized: ${isFinalized}, Successful: ${isSuccessful}`);
                  if (isFinalized && !isSuccessful && !claimed) {
                    console.log(`  ✅ CAN REQUEST REFUND for Launch ID ${launchId}`);
                  }
                }
              }
            } catch (e) {
              // Continue
            }
          }
        }
      }
    } catch (error) {
      // Continue
    }
  }

  if (!foundAny) {
    console.log("\nNo contributions found in launch IDs 1-50.");
    console.log("\nLet's check your transaction history on the explorer:");
    console.log(`https://explorer.stacks.co/address/${userAddress}?chain=mainnet`);
  }
}

checkContract();

