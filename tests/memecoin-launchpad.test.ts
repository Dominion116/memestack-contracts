import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

describe("Memecoin Launchpad Tests", () => {
  it("creates launch successfully", () => {
    const accounts = simnet.getAccounts();
    const wallet1 = accounts.get("wallet_1")!;
    
    const { result } = simnet.callPublicFn(
      "memecoin-launchpad",
      "create-launch",
      [
        Cl.stringAscii("DOGE 2.0"),
        Cl.stringAscii("DOGE2"),
        Cl.stringUtf8("https://doge2.com"),
        Cl.uint(1000000000000),
        Cl.uint(100),
        Cl.uint(50000000),
        Cl.uint(100000000),
        Cl.uint(1000000),
        Cl.uint(10000000),
        Cl.uint(1000),
      ],
      wallet1
    );
    
    expect(result).toBeOk(Cl.uint(1));
    
    // Verify launch data
    const launch = simnet.callReadOnlyFn(
      "memecoin-launchpad",
      "get-launch",
      [Cl.uint(1)],
      wallet1
    );
    
    expect(launch.result).toBeDefined();
  });

  it("buys tokens successfully", () => {
    const accounts = simnet.getAccounts();
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    
    // Create launch
    simnet.callPublicFn(
      "memecoin-launchpad",
      "create-launch",
      [
        Cl.stringAscii("PEPE"),
        Cl.stringAscii("PEPE"),
        Cl.stringUtf8("https://pepe.com"),
        Cl.uint(1000000000000),
        Cl.uint(100),
        Cl.uint(50000000),
        Cl.uint(100000000),
        Cl.uint(1000000),
        Cl.uint(10000000),
        Cl.uint(1000),
      ],
      wallet1
    );
    
    // Advance to start block
    simnet.mineEmptyBlocks(10);
    
    // Buy tokens
    const { result } = simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(5000000)],
      wallet2
    );
    
    expect(result).toBeOk(Cl.tuple({
      tokens: Cl.uint(50000000000),
      "stx-spent": Cl.uint(5000000),
    }));
    
    // Check contribution
    const contribution = simnet.callReadOnlyFn(
      "memecoin-launchpad",
      "get-user-contribution",
      [Cl.uint(1), Cl.principal(wallet2)],
      wallet2
    );
    
    expect(contribution.result).toBeDefined();
  });

  it("enforces minimum purchase", () => {
    const accounts = simnet.getAccounts();
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    
    // Create launch with min 2 STX
    simnet.callPublicFn(
      "memecoin-launchpad",
      "create-launch",
      [
        Cl.stringAscii("SHIB"),
        Cl.stringAscii("SHIB"),
        Cl.stringUtf8("https://shib.com"),
        Cl.uint(1000000000000),
        Cl.uint(100),
        Cl.uint(50000000),
        Cl.uint(100000000),
        Cl.uint(2000000),
        Cl.uint(10000000),
        Cl.uint(1000),
      ],
      wallet1
    );
    
    simnet.mineEmptyBlocks(10);
    
    // Try to buy below minimum
    const { result } = simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(1000000)],
      wallet2
    );
    
    expect(result).toBeErr(Cl.uint(106));
  });

  it("enforces maximum purchase per wallet", () => {
    const accounts = simnet.getAccounts();
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    
    // Create launch with max 5 STX
    simnet.callPublicFn(
      "memecoin-launchpad",
      "create-launch",
      [
        Cl.stringAscii("FLOKI"),
        Cl.stringAscii("FLOKI"),
        Cl.stringUtf8("https://floki.com"),
        Cl.uint(1000000000000),
        Cl.uint(100),
        Cl.uint(50000000),
        Cl.uint(100000000),
        Cl.uint(1000000),
        Cl.uint(5000000),
        Cl.uint(1000),
      ],
      wallet1
    );
    
    simnet.mineEmptyBlocks(10);
    
    // Buy up to max
    simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(5000000)],
      wallet2
    );
    
    // Try to buy more
    const { result } = simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(1000000)],
      wallet2
    );
    
    expect(result).toBeErr(Cl.uint(107));
  });

  it("finalizes successful launch", () => {
    const accounts = simnet.getAccounts();
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    const wallet3 = accounts.get("wallet_3")!;
    
    // Create launch
    simnet.callPublicFn(
      "memecoin-launchpad",
      "create-launch",
      [
        Cl.stringAscii("BONK"),
        Cl.stringAscii("BONK"),
        Cl.stringUtf8("https://bonk.com"),
        Cl.uint(1000000000000),
        Cl.uint(100),
        Cl.uint(50000000),
        Cl.uint(100000000),
        Cl.uint(1000000),
        Cl.uint(30000000),
        Cl.uint(100),
      ],
      wallet1
    );
    
    simnet.mineEmptyBlocks(10);
    
    // Multiple purchases to meet soft cap
    simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(30000000)],
      wallet2
    );
    
    simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(25000000)],
      wallet3
    );
    
    // Advance past end block
    simnet.mineEmptyBlocks(100);
    
    // Finalize
    const { result } = simnet.callPublicFn(
      "memecoin-launchpad",
      "finalize-launch",
      [Cl.uint(1)],
      wallet1
    );
    
    expect(result).toBeOk(Cl.bool(true));
    
    // Check launch is successful
    const stats = simnet.callReadOnlyFn(
      "memecoin-launchpad",
      "get-launch-stats",
      [Cl.uint(1)],
      wallet1
    );
    
    expect(stats.result).toBeOk(Cl.tuple({
      "total-raised": Cl.uint(55000000),
      "tokens-sold": Cl.uint(550000000000),
      "progress-bps": Cl.uint(5500),
      "is-active": Cl.bool(false),
      "is-finalized": Cl.bool(true),
      "is-successful": Cl.bool(true),
      "is-cancelled": Cl.bool(false),
    }));
  });

  it("allows claiming tokens after successful launch", () => {
    const accounts = simnet.getAccounts();
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    const wallet3 = accounts.get("wallet_3")!;
    
    // Create and complete launch
    simnet.callPublicFn(
      "memecoin-launchpad",
      "create-launch",
      [
        Cl.stringAscii("WOJAK"),
        Cl.stringAscii("WOJAK"),
        Cl.stringUtf8("https://wojak.com"),
        Cl.uint(1000000000000),
        Cl.uint(100),
        Cl.uint(50000000),
        Cl.uint(100000000),
        Cl.uint(1000000),
        Cl.uint(30000000),
        Cl.uint(100),
      ],
      wallet1
    );
    
    simnet.mineEmptyBlocks(101);
    
    // Buy tokens from wallet2 (30 STX)
    simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(30000000)],
      wallet2
    );
    
    // Buy tokens from wallet3 (25 STX) - total 55 STX > soft cap
    simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(25000000)],
      wallet3
    );
    
    simnet.mineEmptyBlocks(100);
    
    simnet.callPublicFn(
      "memecoin-launchpad",
      "finalize-launch",
      [Cl.uint(1)],
      wallet1
    );
    
    // Claim tokens for wallet2 (bought 30 STX)
    const { result } = simnet.callPublicFn(
      "memecoin-launchpad",
      "claim-tokens",
      [Cl.uint(1)],
      wallet2
    );
    
    // Expected tokens: 30 STX * 1000000 / 100 price = 300,000,000,000 tokens
    expect(result).toBeOk(Cl.uint(300000000000));
    
    // Verify claimed status
    const contribution = simnet.callReadOnlyFn(
      "memecoin-launchpad",
      "get-user-contribution",
      [Cl.uint(1), Cl.principal(wallet2)],
      wallet2
    );
    
    expect(contribution.result).toBeDefined();
  });

  it("processes refund on failed launch", () => {
    const accounts = simnet.getAccounts();
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    
    // Create launch with high soft-cap
    simnet.callPublicFn(
      "memecoin-launchpad",
      "create-launch",
      [
        Cl.stringAscii("FAIL"),
        Cl.stringAscii("FAIL"),
        Cl.stringUtf8("https://fail.com"),
        Cl.uint(1000000000000),
        Cl.uint(100),
        Cl.uint(100000000),
        Cl.uint(200000000),
        Cl.uint(1000000),
        Cl.uint(30000000),
        Cl.uint(100),
      ],
      wallet1
    );
    
    simnet.mineEmptyBlocks(10);
    
    // Buy but don't meet soft cap
    simnet.callPublicFn(
      "memecoin-launchpad",
      "buy-tokens",
      [Cl.uint(1), Cl.uint(30000000)],
      wallet2
    );
    
    simnet.mineEmptyBlocks(100);
    
    // Finalize (will fail)
    simnet.callPublicFn(
      "memecoin-launchpad",
      "finalize-launch",
      [Cl.uint(1)],
      wallet1
    );
    
    // Request refund
    const { result } = simnet.callPublicFn(
      "memecoin-launchpad",
      "request-refund",
      [Cl.uint(1)],
      wallet2
    );
    
    expect(result).toBeOk(Cl.uint(30000000));
  });
});
