const test = require("node:test");
const assert = require("node:assert");
const { ethers } = require("ethers");
const { issueNonce, verifySignedMessage } = require("../src/utils/wallet");

test("a real wallet signature verifies successfully", async () => {
  const wallet = ethers.Wallet.createRandom();
  const message = issueNonce(wallet.address);
  const signature = await wallet.signMessage(message);
  assert.strictEqual(verifySignedMessage(wallet.address, signature), true);
});

test("a signature from the wrong wallet is rejected", async () => {
  const walletA = ethers.Wallet.createRandom();
  const walletB = ethers.Wallet.createRandom();
  const message = issueNonce(walletA.address);
  const wrongSignature = await walletB.signMessage(message);
  assert.throws(() => verifySignedMessage(walletA.address, wrongSignature));
});

test("a nonce can't be replayed twice", async () => {
  const wallet = ethers.Wallet.createRandom();
  const message = issueNonce(wallet.address);
  const signature = await wallet.signMessage(message);
  assert.strictEqual(verifySignedMessage(wallet.address, signature), true);
  assert.throws(() => verifySignedMessage(wallet.address, signature));
});
