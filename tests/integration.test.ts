import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Memestack Integration Tests", () => {
  describe("Full Launch Lifecycle with Token Deployment", () => {
    it("creates launch, buys tokens, finalizes, deploys token, and claims", () => {
      // Step 1: Create a launch
      const createResult = simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("PEPE"),
          Cl.stringAscii("PEPE"),
          Cl.stringUtf8("https://pepe.meme"),
          Cl.uint(1000000000000), // 1 trillion tokens
          Cl.uint(100), // price per token (100 micro-STX per million tokens)
          Cl.uint(100000000), // soft cap (100 STX)
          Cl.uint(500000000), // hard cap (500 STX)
          Cl.uint(1000000), // min purchase (1 STX)
          Cl.uint(50000000), // max purchase (50 STX)
          Cl.uint(200), // duration (200 blocks)
        ],
        wallet1
      );
      expect(createResult.result).toBeOk(Cl.uint(1));

      // Step 2: Mine blocks to reach launch start
      simnet.mineEmptyBlocks(15);

      // Step 3: Multiple buyers purchase tokens
      const buy1 = simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(50000000)], // 50 STX
        wallet2
      );
      expect(buy1.result).toBeOk(Cl.tuple({
        tokens: Cl.uint(500000000000),
        "stx-spent": Cl.uint(50000000)
      }));

      const buy2 = simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(50000000)], // 50 STX
        wallet3
      );
      expect(buy2.result).toBeOk(Cl.tuple({
        tokens: Cl.uint(500000000000),
        "stx-spent": Cl.uint(50000000)
      }));

      const buy3 = simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(10000000)], // 10 STX - total 110 STX
        deployer
      );
      expect(buy3.result).toBeOk(Cl.tuple({
        tokens: Cl.uint(100000000000),
        "stx-spent": Cl.uint(10000000)
      }));

      // Step 4: Mine blocks to end launch
      simnet.mineEmptyBlocks(200);

      // Step 5: Finalize the launch
      const finalizeResult = simnet.callPublicFn(
        "memecoin-launchpad",
        "finalize-launch",
        [Cl.uint(1)],
        wallet1
      );
      expect(finalizeResult.result).toBeOk(Cl.bool(true));

      // Step 6: Verify launch is successful
      const launchStats = simnet.callReadOnlyFn(
        "memecoin-launchpad",
        "get-launch-stats",
        [Cl.uint(1)],
        wallet1
      );
      expect(launchStats.result).toBeSome(Cl.tuple({
        "total-raised": Cl.uint(110000000), // 110 STX (50+50+10)
        "tokens-sold": Cl.uint(1100000000000),
        "is-finalized": Cl.bool(true),
        "is-successful": Cl.bool(true),
        "is-active": Cl.bool(false)
      }));

      // Step 7: Deploy token contract (simulated - in real deployment this would be done separately)
      // For testing, we'll register the token with the factory
      const registerResult = simnet.callPublicFn(
        "token-factory",
        "register-token",
        [
          Cl.uint(1),
          Cl.contractPrincipal(deployer, "memecoin-token")
        ],
        wallet1
      );
      expect(registerResult.result).toBeOk(Cl.bool(true));

      // Step 8: Claim tokens
      const claim1 = simnet.callPublicFn(
        "memecoin-launchpad",
        "claim-tokens",
        [Cl.uint(1)],
        wallet2
      );
      expect(claim1.result).toBeOk(Cl.uint(500000000000)); // 50 STX worth

      const claim2 = simnet.callPublicFn(
        "memecoin-launchpad",
        "claim-tokens",
        [Cl.uint(1)],
        wallet3
      );
      expect(claim2.result).toBeOk(Cl.uint(500000000000)); // 50 STX worth

      // Step 9: Verify claimed status
      const contribution1 = simnet.callReadOnlyFn(
        "memecoin-launchpad",
        "get-user-contribution",
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      const contrib1Data = contribution1.result as any;
      expect(contrib1Data.value.value.claimed.value).toBe(true);
    });

    it("handles failed launch with refunds correctly", () => {
      // Create a launch with high soft cap
      simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("DOGE"),
          Cl.stringAscii("DOGE"),
          Cl.stringUtf8("https://doge.meme"),
          Cl.uint(1000000000000),
          Cl.uint(100),
          Cl.uint(200000000), // soft cap (200 STX) - hard to reach
          Cl.uint(500000000),
          Cl.uint(1000000),
          Cl.uint(50000000),
          Cl.uint(200),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(15);

      // Buy only 50 STX (less than soft cap)
      simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(50000000)],
        wallet2
      );

      simnet.mineEmptyBlocks(200);

      // Finalize - should mark as unsuccessful
      const finalizeResult = simnet.callPublicFn(
        "memecoin-launchpad",
        "finalize-launch",
        [Cl.uint(1)],
        wallet1
      );
      expect(finalizeResult.result).toBeOk(Cl.bool(false)); // Returns false because launch failed

      // Get wallet2's STX balance before refund
      const balanceBefore = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0;

      // Request refund
      const refundResult = simnet.callPublicFn(
        "memecoin-launchpad",
        "request-refund",
        [Cl.uint(1)],
        wallet2
      );
      expect(refundResult.result).toBeOk(Cl.uint(50000000));

      // Verify STX was refunded
      const balanceAfter = simnet.getAssetsMap().get("STX")?.get(wallet2) || 0;
      expect(balanceAfter).toBe(balanceBefore + 50000000);

      // Try to claim tokens - should fail since launch unsuccessful
      const claimResult = simnet.callPublicFn(
        "memecoin-launchpad",
        "claim-tokens",
        [Cl.uint(1)],
        wallet2
      );
      expect(claimResult.result).toBeErr(Cl.uint(111)); // err-launch-not-successful
    });
  });

  describe("Token Factory Integration", () => {
    it("verifies token factory read-only functions", () => {
      // Verify no tokens are deployed initially
      const token1 = simnet.callReadOnlyFn(
        "token-factory",
        "get-deployed-token",
        [Cl.uint(1)],
        wallet1
      );
      expect(token1.result).toBeNone();

      // Check deployment counter
      const counter = simnet.callReadOnlyFn(
        "token-factory",
        "get-deployment-count",
        [],
        wallet1
      );
      expect(counter.result).toBeUint(0);

      // Note: register-token can only be called by the launchpad contract,
      // so it's tested as part of the full integration test above
    });

    it("prevents unauthorized token registration", () => {
      // Create a launch with wallet1
      simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("FLOKI"),
          Cl.stringAscii("FLOKI"),
          Cl.stringUtf8("https://floki.meme"),
          Cl.uint(1000000000000),
          Cl.uint(100),
          Cl.uint(50000000),
          Cl.uint(500000000),
          Cl.uint(1000000),
          Cl.uint(50000000),
          Cl.uint(200),
        ],
        wallet1
      );

      // Try to register from wallet2 (not launchpad contract) - should fail
      const unauthorizedResult = simnet.callPublicFn(
        "token-factory",
        "register-token",
        [
          Cl.uint(1),
          Cl.contractPrincipal(deployer, "memecoin-token"),
          Cl.stringAscii("FLOKI"),
          Cl.stringAscii("FLOKI"),
          Cl.uint(1000000000000),
          Cl.standardPrincipal(wallet1)
        ],
        wallet2
      );
      expect(unauthorizedResult.result).toBeErr(Cl.uint(102)); // err-not-authorized
    });
  });

  describe("Platform Fee Distribution", () => {
    it("correctly distributes fees on successful launch", () => {
      // Create launch
      simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("BONK"),
          Cl.stringAscii("BONK"),
          Cl.stringUtf8("https://bonk.meme"),
          Cl.uint(1000000000000),
          Cl.uint(100),
          Cl.uint(50000000), // 50 STX soft cap
          Cl.uint(500000000),
          Cl.uint(1000000),
          Cl.uint(50000000),
          Cl.uint(200),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(15);

      // Buy 100 STX worth
      simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(50000000)],
        wallet2
      );
      simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(50000000)],
        wallet3
      );

      simnet.mineEmptyBlocks(200);

      // Get creator's balance before finalize
      const creatorBalanceBefore = simnet.getAssetsMap().get("STX")?.get(wallet1) || 0;
      const platformBalanceBefore = simnet.getAssetsMap().get("STX")?.get(deployer) || 0;

      // Finalize
      simnet.callPublicFn(
        "memecoin-launchpad",
        "finalize-launch",
        [Cl.uint(1)],
        wallet1
      );

      // Get balances after
      const creatorBalanceAfter = simnet.getAssetsMap().get("STX")?.get(wallet1) || 0;
      const platformBalanceAfter = simnet.getAssetsMap().get("STX")?.get(deployer) || 0;

      // Calculate expected amounts
      const totalRaised = 100000000; // 100 STX
      const platformFee = totalRaised * 200 / 10000; // 2% = 2 STX
      const creatorAmount = totalRaised - platformFee; // 98 STX

      // Verify distributions
      expect(Number(creatorBalanceAfter - creatorBalanceBefore)).toBe(creatorAmount);
      expect(Number(platformBalanceAfter - platformBalanceBefore)).toBe(platformFee);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("prevents double claiming", () => {
      // Create and complete launch
      simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("WEN"),
          Cl.stringAscii("WEN"),
          Cl.stringUtf8("https://wen.meme"),
          Cl.uint(1000000000000),
          Cl.uint(100),
          Cl.uint(50000000),
          Cl.uint(500000000),
          Cl.uint(1000000),
          Cl.uint(50000000),
          Cl.uint(200),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(15);
      simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(50000000)],
        wallet2
      );
      simnet.mineEmptyBlocks(200);
      simnet.callPublicFn(
        "memecoin-launchpad",
        "finalize-launch",
        [Cl.uint(1)],
        wallet1
      );

      // First claim - should succeed
      const claim1 = simnet.callPublicFn(
        "memecoin-launchpad",
        "claim-tokens",
        [Cl.uint(1)],
        wallet2
      );
      expect(claim1.result).toBeOk(Cl.uint(500000000000));

      // Second claim - should fail
      const claim2 = simnet.callPublicFn(
        "memecoin-launchpad",
        "claim-tokens",
        [Cl.uint(1)],
        wallet2
      );
      expect(claim2.result).toBeErr(Cl.uint(112)); // err-already-claimed
    });

    it("prevents double refund", () => {
      // Create failed launch
      simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("RIP"),
          Cl.stringAscii("RIP"),
          Cl.stringUtf8("https://rip.meme"),
          Cl.uint(1000000000000),
          Cl.uint(100),
          Cl.uint(200000000), // High soft cap
          Cl.uint(500000000),
          Cl.uint(1000000),
          Cl.uint(50000000),
          Cl.uint(200),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(15);
      simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(50000000)],
        wallet2
      );
      simnet.mineEmptyBlocks(200);
      simnet.callPublicFn(
        "memecoin-launchpad",
        "finalize-launch",
        [Cl.uint(1)],
        wallet1
      );

      // First refund - should succeed
      const refund1 = simnet.callPublicFn(
        "memecoin-launchpad",
        "request-refund",
        [Cl.uint(1)],
        wallet2
      );
      expect(refund1.result).toBeOk(Cl.uint(50000000));

      // Second refund - should fail
      const refund2 = simnet.callPublicFn(
        "memecoin-launchpad",
        "request-refund",
        [Cl.uint(1)],
        wallet2
      );
      expect(refund2.result).toBeErr(Cl.uint(112)); // err-already-claimed (refund flag uses same field)
    });

    it("prevents operations before launch starts", () => {
      simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("EARLY"),
          Cl.stringAscii("EARLY"),
          Cl.stringUtf8("https://early.meme"),
          Cl.uint(1000000000000),
          Cl.uint(100),
          Cl.uint(50000000),
          Cl.uint(500000000),
          Cl.uint(1000000),
          Cl.uint(50000000),
          Cl.uint(200),
        ],
        wallet1
      );

      // Try to buy immediately (before start-block) - should fail
      const buyResult = simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(10000000)],
        wallet2
      );
      expect(buyResult.result).toBeErr(Cl.uint(103)); // err-launch-not-active
    });

    it("prevents operations after launch ends", () => {
      simnet.callPublicFn(
        "memecoin-launchpad",
        "create-launch",
        [
          Cl.stringAscii("LATE"),
          Cl.stringAscii("LATE"),
          Cl.stringUtf8("https://late.meme"),
          Cl.uint(1000000000000),
          Cl.uint(100),
          Cl.uint(50000000),
          Cl.uint(500000000),
          Cl.uint(1000000),
          Cl.uint(50000000),
          Cl.uint(50), // Short duration
        ],
        wallet1
      );

      // Mine past the end
      simnet.mineEmptyBlocks(100);

      // Try to buy after end - should fail
      const buyResult = simnet.callPublicFn(
        "memecoin-launchpad",
        "buy-tokens",
        [Cl.uint(1), Cl.uint(10000000)],
        wallet2
      );
      expect(buyResult.result).toBeErr(Cl.uint(103)); // err-launch-not-active
    });
  });
});
