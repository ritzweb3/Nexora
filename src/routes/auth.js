const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { id } = require("../utils/ids");
const { sign } = require("../utils/jwt");
const { isValidEthAddress } = require("../utils/payout");

const router = express.Router();

function creatorPublic(row) {
  return {
    id: row.id, name: row.name, email: row.email, authProvider: row.auth_provider,
    walletAddress: row.wallet_address, totalEarned: row.total_earned,
    socials: { twitter: row.social_twitter, tiktok: row.social_tiktok, instagram: row.social_instagram, youtube: row.social_youtube },
  };
}
function projectPublic(row) {
  return { id: row.id, name: row.name, email: row.email, authProvider: row.auth_provider };
}

/* ---------------------------------------------------------
   Email + password signup / login. Creators must provide a real-looking
   ETH wallet address at signup — that's where campaign payments go.
--------------------------------------------------------- */
router.post("/signup", async (req, res) => {
  const { role, name, email, password, walletAddress } = req.body || {};
  if (!["creator", "project"].includes(role)) return res.status(400).json({ error: "role must be 'creator' or 'project'." });
  if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (role === "creator" && !isValidEthAddress(walletAddress)) {
    return res.status(400).json({ error: "A valid ETH wallet address (0x followed by 40 hex characters) is required to sign up as a creator." });
  }

  const emailLower = email.toLowerCase();
  const existing = role === "creator" ? db.findCreatorByEmail(emailLower) : db.findProjectByEmail(emailLower);
  if (existing) return res.status(409).json({ error: "An account with that email already exists." });

  const hash = await bcrypt.hash(password, 12);
  const newId = id(role === "creator" ? "cr" : "pr");
  const now = Date.now();

  if (role === "creator") {
    db.insertCreator({ id: newId, name, email: emailLower, passwordHash: hash, authProvider: "password", walletAddress: walletAddress.trim(), createdAt: now });
  } else {
    db.insertProject({ id: newId, name, email: emailLower, passwordHash: hash, authProvider: "password", createdAt: now });
  }

  const token = sign({ role, id: newId });
  res.status(201).json({ token, role, id: newId });
});

router.post("/login", async (req, res) => {
  const { role, email, password } = req.body || {};
  if (!["creator", "project"].includes(role)) return res.status(400).json({ error: "role must be 'creator' or 'project'." });
  const row = role === "creator" ? db.findCreatorByEmail((email || "").toLowerCase()) : db.findProjectByEmail((email || "").toLowerCase());
  if (!row || !row.password_hash) return res.status(401).json({ error: "Invalid email or password." });
  const ok = await bcrypt.compare(password || "", row.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });
  const token = sign({ role, id: row.id });
  res.json({ token, role, id: row.id, profile: role === "creator" ? creatorPublic(row) : projectPublic(row) });
});

/* ---------------------------------------------------------
   Admin login — real credential check, not hardcoded in
   client-visible code. Configure ADMIN_EMAIL / ADMIN_PASSWORD
   in .env; the password is bcrypt-hashed on first boot and
   never stored or compared in plaintext.
--------------------------------------------------------- */
router.post("/admin-login", async (req, res) => {
  const { email, password } = req.body || {};
  const row = db.findAdminByEmail((email || "").toLowerCase());
  if (!row) return res.status(401).json({ error: "Invalid email or password." });
  const ok = await bcrypt.compare(password || "", row.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });
  const token = sign({ role: "admin", id: row.id }, "12h");
  res.json({ token, role: "admin", id: row.id });
});

/* ---------------------------------------------------------
   Google OAuth 2.0 — real authorization-code exchange. Needs
   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from a real Google Cloud
   OAuth client to actually complete (see README).

   Google doesn't give us a wallet address, so a NEW creator signing up
   this way has walletAddress = null; the front end gates their dashboard
   behind a "add your wallet address" screen until they set one via
   PUT /creators/me/wallet.
--------------------------------------------------------- */
router.get("/google", (req, res) => {
  const role = req.query.role === "project" ? "project" : "creator";
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ error: "GOOGLE_CLIENT_ID is not configured yet — see README." });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback",
    response_type: "code",
    scope: "openid email profile",
    state: role,
    access_type: "online",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/google/callback", async (req, res) => {
  const { code, state } = req.query;
  const role = state === "project" ? "project" : "creator";
  if (!code) return res.status(400).json({ error: "Missing authorization code." });
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({ error: "Google OAuth is not fully configured — see README." });
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback",
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || "Token exchange failed.");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const emailLower = profile.email.toLowerCase();

    let row = role === "creator" ? db.findCreatorByEmail(emailLower) : db.findProjectByEmail(emailLower);
    if (!row) {
      const newId = id(role === "creator" ? "cr" : "pr");
      if (role === "creator") {
        row = db.insertCreator({ id: newId, name: profile.name || profile.email, email: emailLower, authProvider: "google", walletAddress: null, createdAt: Date.now() });
      } else {
        row = db.insertProject({ id: newId, name: profile.name || profile.email, email: emailLower, authProvider: "google", createdAt: Date.now() });
      }
    }
    const token = sign({ role, id: row.id });
    // Same-origin by default, since the front end is served by this same
    // app. Only set FRONTEND_URL if you deploy the front end separately.
    const front = process.env.FRONTEND_URL || "";
    res.redirect(`${front}/#/oauth-complete?token=${encodeURIComponent(token)}&role=${role}`);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, creatorPublic, projectPublic };
