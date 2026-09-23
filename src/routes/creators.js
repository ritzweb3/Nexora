const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { isValidEthAddress } = require("../utils/payout");
const { creatorPublic } = require("./auth");

const router = express.Router();
router.use(requireAuth(["creator"]));

router.get("/me", (req, res) => {
  const row = db.findCreatorById(req.auth.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json(creatorPublic(row));
});

router.put("/me/socials", (req, res) => {
  const { twitter = "", tiktok = "", instagram = "", youtube = "" } = req.body || {};
  db.updateCreatorSocials(req.auth.id, { twitter, tiktok, instagram, youtube });
  res.json(creatorPublic(db.findCreatorById(req.auth.id)));
});

/** Needed for creators who signed up with Google, which doesn't collect a
 * wallet address. The front end gates their dashboard on this being set. */
router.put("/me/wallet", (req, res) => {
  const { walletAddress } = req.body || {};
  if (!isValidEthAddress(walletAddress)) return res.status(400).json({ error: "Enter a valid ETH wallet address (0x followed by 40 hex characters)." });
  db.updateCreatorWalletAddress(req.auth.id, walletAddress.trim());
  res.json(creatorPublic(db.findCreatorById(req.auth.id)));
});

router.get("/me/campaigns", (req, res) => {
  res.json(db.getCreatorCampaignsView(req.auth.id));
});

/** Just records the link. Views/likes/payout are filled in later by an
 * admin who's actually looked at the post — there's no automatic scoring. */
router.post("/me/campaigns/:campaignId/submit", (req, res) => {
  const { campaignId } = req.params;
  const { postUrl } = req.body || {};
  if (!postUrl || !/^https?:\/\//i.test(postUrl)) return res.status(400).json({ error: "postUrl must be a valid link starting with http(s)://" });

  const campaign = db.findCampaignById(campaignId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  if (!db.isAssigned(campaignId, req.auth.id)) return res.status(403).json({ error: "You are not assigned to this campaign." });

  db.upsertSubmissionLink(campaignId, req.auth.id, postUrl, Date.now());
  res.json({ ok: true });
});

router.get("/me/payments", (req, res) => {
  const creator = db.findCreatorById(req.auth.id);
  const txs = db.listTransactionsForCreator(req.auth.id);
  res.json({
    walletAddress: creator.wallet_address,
    totalEarned: creator.total_earned,
    payments: txs.map((t) => ({ id: t.id, amount: t.amount, campaignId: t.campaign_id, ts: t.ts })),
  });
});

router.get("/leaderboard", (req, res) => {
  res.json(db.computeLeaderboardRaw());
});

module.exports = { router };
