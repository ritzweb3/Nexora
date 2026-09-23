const express = require("express");
const db = require("../db");
const { id } = require("../utils/ids");
const { requireAuth } = require("../middleware/auth");
const { projectPublic } = require("./auth");

const router = express.Router();
router.use(requireAuth(["project"]));

router.get("/me", (req, res) => {
  const row = db.findProjectById(req.auth.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json(projectPublic(row));
});

/**
 * No budget field, no billing balance, no auto-debit — payment happens
 * off-platform, straight to the company wallet, and gets checked by a
 * human. This just records the campaign brief plus whether the owner
 * says they've sent the money yet.
 */
router.post("/campaigns", (req, res) => {
  const { title, description, creatorsNeeded, durationDays, amountSent, paymentSent } = req.body || {};
  const creatorsNeededNum = Number(creatorsNeeded);
  const durationDaysNum = Number(durationDays);
  if (!title || !description) return res.status(400).json({ error: "title and description are required." });
  if (!Number.isFinite(creatorsNeededNum) || creatorsNeededNum <= 0) return res.status(400).json({ error: "creatorsNeeded must be a positive number." });
  if (!Number.isFinite(durationDaysNum) || durationDaysNum <= 0) return res.status(400).json({ error: "durationDays must be a positive number." });

  const campaignId = id("cp");
  const row = db.insertCampaign({
    id: campaignId, projectId: req.auth.id, title, description,
    creatorsNeeded: creatorsNeededNum, durationDays: durationDaysNum,
    amountSent: amountSent ? Number(amountSent) : null,
    paymentSent: !!paymentSent,
    createdAt: Date.now(),
  });
  res.status(201).json({ id: row.id });
});

router.get("/me/campaigns", (req, res) => {
  const rows = db.listCampaignsByProject(req.auth.id);
  res.json(rows.map((c) => ({ ...campaignSummary(c), assignedCount: db.countAssignmentsForCampaign(c.id) })));
});

/** The "I've sent the payment" checkbox, usable any time after creation —
 * not everyone will have sent the funds before filling out the form. */
router.post("/campaigns/:id/mark-payment-sent", (req, res) => {
  const c = db.findCampaignByIdAndProject(req.params.id, req.auth.id);
  if (!c) return res.status(404).json({ error: "Not found." });
  if (c.payment_sent) return res.status(409).json({ error: "Already marked as sent." });
  const { amountSent } = req.body || {};
  const updated = db.markCampaignPaymentSent(c.id, amountSent ? Number(amountSent) : c.amount_sent);
  res.json({ ok: true, campaign: campaignSummary(updated) });
});

router.get("/campaigns/:id", (req, res) => {
  const c = db.findCampaignByIdAndProject(req.params.id, req.auth.id);
  if (!c) return res.status(404).json({ error: "Not found." });
  res.json({ ...campaignSummary(c), assignments: db.getCampaignAssignmentsView(c.id) });
});

function campaignSummary(c) {
  return {
    id: c.id, title: c.title, description: c.description,
    creatorsNeeded: c.creators_needed, durationDays: c.duration_days,
    amountSent: c.amount_sent, paymentSent: c.payment_sent, paymentVerified: c.payment_verified,
    verifiedAt: c.verified_at, createdAt: c.created_at,
  };
}

module.exports = { router, campaignSummary };
