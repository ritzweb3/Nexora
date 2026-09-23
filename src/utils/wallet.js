const { ethers } = require("ethers");
const crypto = require("crypto");

/**
 * "Connect with seed phrase" in the front-end demo typed a phrase into a text
 * box — that is NOT something a real product should ever do; a real seed
 * phrase decrypts to a private key, and a private key typed into a web page
 * is a private key a web page can steal.
 *
 * The correct real-world flow (this file) is "Sign-In With Ethereum"-style:
 *   1. The browser wallet (MetaMask, Rainbow, Coinbase Wallet, WalletConnect,
 *      etc.) already holds the private key and never exposes it.
 *   2. The server hands the browser a one-time nonce.
 *   3. The wallet extension signs a short message containing that nonce —
 *      the private key is used locally, inside the wallet, and never leaves it.
 *   4. The server recovers the signing address from the signature and checks
 *      it matches the address the person claims to own. If it matches, they
 *      have proven control of that wallet without ever revealing a key.
 *
 * This module implements steps 2 and 4 for real. Steps 1 and 3 happen in a
 * browser with a wallet extension or WalletConnect modal — see the README
 * for exactly which front-end library call replaces the seed-phrase textbox.
 */

// In-memory nonce store. Fine for a single-instance demo; move this to Redis
// or a DB table (with a TTL/cleanup job) before running more than one
// server instance, since nonces must be visible to whichever instance
// handles the follow-up verify call.
const nonces = new Map(); // address(lowercase) -> { nonce, issuedAt }
const NONCE_TTL_MS = 5 * 60 * 1000;

function buildMessage(address, nonce, issuedAtIso) {
  return (
    `Sign in to Nexora.\n\n` +
    `This request will not trigger a blockchain transaction or cost any gas.\n\n` +
    `Address: ${address}\n` +
    `Nonce: ${nonce}\n` +
    `Issued: ${issuedAtIso}`
  );
}

function issueNonce(address) {
  const addr = address.toLowerCase();
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAtIso = new Date().toISOString();
  nonces.set(addr, { nonce, issuedAt: Date.now(), issuedAtIso });
  return buildMessage(address, nonce, issuedAtIso);
}

function verifySignedMessage(address, signature) {
  const addr = address.toLowerCase();
  const entry = nonces.get(addr);
  if (!entry) throw new Error("No pending sign-in request for this address — request a new message first.");
  if (Date.now() - entry.issuedAt > NONCE_TTL_MS) {
    nonces.delete(addr);
    throw new Error("This sign-in request expired — request a new message and sign again.");
  }
  const message = buildMessage(address, entry.nonce, entry.issuedAtIso);
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (e) {
    throw new Error("Malformed signature.");
  }
  nonces.delete(addr); // one-time use, prevents replay
  if (recovered.toLowerCase() !== addr) {
    throw new Error("Signature does not match the claimed address.");
  }
  return true;
}

module.exports = { issueNonce, verifySignedMessage, buildMessage };
