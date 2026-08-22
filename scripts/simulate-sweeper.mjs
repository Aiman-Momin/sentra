import { ethers } from "ethers";

/**
 * Controlled sweeper-bot simulation for testing Sentra's detection engine
 * against REAL Polygon Mainnet transactions.
 *
 * This does NOT touch any real attacker or any wallet other than ones you
 * control. It simulates the pattern a sweeper bot produces (deposit, then
 * a near-instant full drain) by scripting both sides yourself, so the
 * test is deterministic instead of depending on whether a real bot
 * happens to be watching and how fast it reacts.
 *
 * REQUIRED environment variables — set these locally, never commit them,
 * never paste them anywhere outside your own machine:
 *
 *   SENTRA_TEST_RPC_URL              - your real Polygon Mainnet RPC URL
 *   SENTRA_TEST_FUNDER_PRIVATE_KEY   - private key of the wallet sending the test deposit
 *   SENTRA_TEST_VICTIM_PRIVATE_KEY   - private key of the wallet being "swept"
 *                                      (this is the address you'll check in Sentra)
 *   SENTRA_TEST_DESTINATION_ADDRESS  - address the drain sends to
 *                                      (can just be the funder's own address, to recycle funds)
 *
 * OPTIONAL:
 *   SENTRA_TEST_AMOUNT_POL - amount to deposit each round, default "0.05"
 *   SENTRA_TEST_ROUNDS     - how many deposit->drain cycles to run, default 1
 *                            (use 2-3 to also trigger the REPEATED_FAST_DRAIN
 *                            and REPEATED_DESTINATION signals)
 *
 * RUN IT (Node 20.6+ supports --env-file natively, no extra dependency needed):
 *   node --env-file=.env.test scripts/simulate-sweeper.mjs
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function nowLabel() {
  return new Date().toISOString();
}

async function main() {
  const RPC_URL = requireEnv("SENTRA_TEST_RPC_URL");
  const FUNDER_KEY = requireEnv("SENTRA_TEST_FUNDER_PRIVATE_KEY");
  const VICTIM_KEY = requireEnv("SENTRA_TEST_VICTIM_PRIVATE_KEY");
  const DESTINATION = requireEnv("SENTRA_TEST_DESTINATION_ADDRESS");
  const AMOUNT_POL = process.env.SENTRA_TEST_AMOUNT_POL ?? "0.05";
  const ROUNDS = parseInt(process.env.SENTRA_TEST_ROUNDS ?? "1", 10);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const funder = new ethers.Wallet(FUNDER_KEY, provider);
  const victim = new ethers.Wallet(VICTIM_KEY, provider);

  console.log(`Funder:      ${funder.address}`);
  console.log(`Victim:      ${victim.address}  <-- check THIS address in Sentra`);
  console.log(`Destination: ${DESTINATION}`);
  console.log(`Amount per round: ${AMOUNT_POL} POL, rounds: ${ROUNDS}`);
  console.log("---");

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\nRound ${round}/${ROUNDS}`);

    // 1. Deposit: funder -> victim
    const depositTx = await funder.sendTransaction({
      to: victim.address,
      value: ethers.parseEther(AMOUNT_POL),
    });
    console.log(`[${nowLabel()}] deposit sent: ${depositTx.hash}`);
    const depositReceipt = await depositTx.wait();
    const depositConfirmedAt = Date.now();
    console.log(`[${nowLabel()}] deposit confirmed in block ${depositReceipt.blockNumber}`);

    // 2. Drain: victim -> destination, immediately, keeping just enough for gas
    const balance = await provider.getBalance(victim.address);
    const feeData = await provider.getFeeData();
    const gasLimit = 21000n;
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    const gasCost = gasPrice * gasLimit;
    const buffer = gasCost * 2n; // safety margin so the tx doesn't get rejected for underfunding
    const drainAmount = balance > buffer ? balance - buffer : 0n;

    if (drainAmount <= 0n) {
      console.error("Not enough balance left to drain after reserving gas — skipping this round.");
      continue;
    }

    const drainTx = await victim.sendTransaction({
      to: DESTINATION,
      value: drainAmount,
      gasLimit,
    });
    console.log(`[${nowLabel()}] drain sent: ${drainTx.hash}`);
    await drainTx.wait();
    const drainConfirmedAt = Date.now();

    const gapSeconds = ((drainConfirmedAt - depositConfirmedAt) / 1000).toFixed(1);
    console.log(`[${nowLabel()}] drain confirmed — gap since deposit confirmed: ${gapSeconds}s`);
  }

  console.log("\nDone. Now go check the VICTIM address in Sentra's Wallet Check screen.");
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});