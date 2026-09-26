const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { suggestPayout } = require("../utils/payout");
const { id } = require("../utils/ids");
const { campaignSummary } = require("./projects");

const router = express.Router();
router.use(requireAuth(["admin"]));

router.get("/overview", (req, res) => {
  res.json({
    pendingVerificationCount: db.countCampaignsAwaitingVerification(),
    pendingPayoutCount: db.countPendingPayouts(),
    totalPaidToCreators: db.sumCreatorTotalEarned(),
    totalCampaigns: db.countCampaigns(),
  });
});

/** The suggested-payout formula's current rates, so the front end's
 * calculator matches whatever's actually configured on the server
 * instead of guessing its own numbers. */
router.get("/rates", (req, res) => {
  res.json({
    ratePer1000Views: Number(process.env.RATE_PER_1000_VIEWS || 2),
    ratePer500Likes: Number(process.env.RATE_PER_500_LIKES || 1),
  });
});
router.post("/suggest-payout", (req, res) => {
  const { views, likes } = req.body || {};
  res.json({ suggested: suggestPayout(views, likes) });
});

router.get("/campaigns", (req, res) => {
  const campaigns = db.listAllCampaigns();
  res.json(
    campaigns.map((c) => {
      const project = db.findProjectById(c.project_id);
      return { ...campaignSummary(c), projectName: project ? project.name : "—", projectEmail: project ? project.email : null, assignments: db.getCampaignAssignmentsView(c.id) };
    })
  );
});

router.get("/campaigns/:id", (req, res) => {
  const c = db.findCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: "Not found." });
  const project = db.findProjectById(c.project_id);
  res.json({ ...campaignSummary(c), projectName: project ? project.name : "—", projectEmail: project ? project.email : null, assignments: db.getCampaignAssignmentsView(c.id) });
});

/** Admin has checked the chain by hand and confirmed the money actually
 * arrived. Returns the project's email so the front end can offer a
 * pre-filled mailto: link — no email service to configure or maintain. */
router.post("/campaigns/:id/verify-payment", (req, res) => {
  const c = db.findCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: "Not found." });
  if (c.payment_verified) return res.status(409).json({ error: "Already verified." });
  const updated = db.markCampaignPaymentVerified(c.id, Date.now());
  const project = db.findProjectById(c.project_id);
  res.json({ ok: true, campaign: campaignSummary(updated), projectEmail: project ? project.email : null, projectName: project ? project.name : null });
});

router.get("/creators", (req, res) => {
  res.json(db.listAllCreators().map((c) => ({ id: c.id, name: c.name, email: c.email, walletAddress: c.wallet_address, socials: { twitter: c.social_twitter, tiktok: c.social_tiktok, instagram: c.social_instagram, youtube: c.social_youtube } })));
});

router.post("/campaigns/:id/assign", (req, res) => {
  const { creatorId } = req.body || {};
  const c = db.findCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: "Campaign not found." });
  if (!db.findCreatorById(creatorId)) return res.status(404).json({ error: "Creator not found." });
  const added = db.assignCreator(c.id, creatorId, Date.now());
  res.json({ ok: true, alreadyAssigned: !added });
});
router.post("/campaigns/:id/unassign", (req, res) => {
  const { creatorId } = req.body || {};
  db.unassignCreator(req.params.id, creatorId);
  res.json({ ok: true });
});

/** All submissions still needing admin attention, across every campaign —
 * a single work queue instead of clicking into each campaign separately. */
router.get("/submissions/pending", (req, res) => {
  res.json(db.getAllSubmissionsView().filter((s) => s.status === "submitted" || s.status === "verified"));
});
router.get("/submissions/all", (req, res) => res.json(db.getAllSubmissionsView()));

/** Step 1: admin has looked at the actual post and enters what they saw,
 * plus the amount they've decided to pay. Doesn't move any money yet. */
router.post("/submissions/:campaignId/:creatorId/review", (req, res) => {
  const { campaignId, creatorId } = req.params;
  const { views, likes, payout } = req.body || {};
  const payoutNum = Number(payout);
  if (!Number.isFinite(payoutNum) || payoutNum < 0) return res.status(400).json({ error: "payout must be a non-negative number." });
  const matching = db.listSubmissionsForCampaign(campaignId).filter((s) => s.creator_id === creatorId);
  if (matching.length > 1) return res.status(409).json({ error: "Use the submission ID endpoint when this creator has multiple campaign links." });
  const sub = matching[0];
  if (!sub) return res.status(404).json({ error: "Submission not found." });
  if (sub.status === "paid") return res.status(409).json({ error: "Paid submissions cannot be reviewed again." });
  const metrics = submissionMetrics(views, likes);
  if (metrics.error) return res.status(400).json({ error: metrics.error });
  const updated = db.saveSubmissionReviewById(sub.id, { ...metrics, payout: payoutNum, verifiedAt: Date.now() });
  res.json({ ok: true, submission: updated });
});
router.post("/submissions/:submissionId/review", (req, res) => {
  const { submissionId } = req.params;
  const { views, likes, payout } = req.body || {};
  const payoutNum = Number(payout);
  if (!Number.isFinite(payoutNum) || payoutNum < 0) return res.status(400).json({ error: "payout must be a non-negative number." });
  const sub = db.findSubmissionById(submissionId);
  if (!sub) return res.status(404).json({ error: "Submission not found." });
  if (sub.status === "paid") return res.status(409).json({ error: "Paid submissions cannot be reviewed again." });
  const metrics = submissionMetrics(views, likes);
  if (metrics.error) return res.status(400).json({ error: metrics.error });
  const updated = db.saveSubmissionReviewById(submissionId, { ...metrics, payout: payoutNum, verifiedAt: Date.now() });
  res.json({ ok: true, submission: updated });
});

/** Step 2: admin has actually sent the crypto to the creator's registered
 * wallet address (outside this app) and confirms it here. This is what
 * credits the creator's total-earned and writes the ledger entry. Returns
 * the creator's email/wallet so the front end can offer a pre-filled
 * confirmation email link. */
router.post("/submissions/:campaignId/:creatorId/mark-paid", (req, res) => {
  const { campaignId, creatorId } = req.params;
  const matching = db.listSubmissionsForCampaign(campaignId).filter((s) => s.creator_id === creatorId);
  if (matching.length > 1) return res.status(409).json({ error: "Use the submission ID endpoint when this creator has multiple campaign links." });
  const sub = matching[0];
  if (!sub) return res.status(404).json({ error: "Submission not found." });
  if (sub.status === "paid") return res.status(409).json({ error: "Already marked paid." });
  if (sub.status !== "verified") return res.status(409).json({ error: "Review and set a payout amount before marking it paid." });

  completeSubmissionPayment(sub);
  res.json(paymentConfirmation(sub));
});
router.post("/submissions/:submissionId/mark-paid", (req, res) => {
  const sub = db.findSubmissionById(req.params.submissionId);
  if (!sub) return res.status(404).json({ error: "Submission not found." });
  if (sub.status === "paid") return res.status(409).json({ error: "Already marked paid." });
  if (sub.status !== "verified") return res.status(409).json({ error: "Review and set a payout amount before marking it paid." });
  completeSubmissionPayment(sub);
  res.json(paymentConfirmation(sub));
});

function submissionMetrics(views, likes) {
  const parsedViews = Number(views);
  const parsedLikes = Number(likes);
  if (views === undefined || views === "" || !Number.isFinite(parsedViews) || parsedViews < 0) {
    return { error: "views must be a non-negative number." };
  }
  if (likes === undefined || likes === "" || !Number.isFinite(parsedLikes) || parsedLikes < 0) {
    return { error: "likes must be a non-negative number." };
  }
  return { views: parsedViews, likes: parsedLikes };
}
function completeSubmissionPayment(sub) {
  db.markSubmissionPaidById(sub.id, Date.now());
  db.creditCreatorPayout(sub.creator_id, sub.payout);
  db.insertTransaction({ id: id("tx"), creatorId: sub.creator_id, campaignId: sub.campaign_id, amount: sub.payout, ts: Date.now() });
}
function paymentConfirmation(sub) {
  const creator = db.findCreatorById(sub.creator_id);
  const campaign = db.findCampaignById(sub.campaign_id);
  const project = campaign ? db.findProjectById(campaign.project_id) : null;
  return {
    ok: true,
    creatorEmail: creator ? creator.email : null,
    creatorName: creator ? creator.name : null,
    campaignTitle: campaign ? campaign.title : null,
    projectEmail: project ? project.email : null,
    projectName: project ? project.name : null,
    amount: sub.payout,
  };
}

router.get("/rankings", (req, res) => res.json(db.computeLeaderboardRaw()));
router.get("/ledger", (req, res) => res.json(db.getLedgerView()));
router.get("/financials", (req, res) => {
  const campaigns = db.listAllCampaigns();
  res.json({
    totalCampaigns: campaigns.length,
    pendingVerificationCount: db.countCampaignsAwaitingVerification(),
    pendingPayoutCount: db.countPendingPayouts(),
    totalStatedBudget: campaigns.reduce((s, c) => s + (c.amount_sent || 0), 0),
    totalPaidToCreators: db.sumCreatorTotalEarned(),
  });
});

module.exports = { router };
