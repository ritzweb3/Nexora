/**
 * Plain JSON-file data store — no native module, nothing to compile.
 * See README for why this is a deliberate choice, not a shortcut.
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "..", "nexora-data.json");

function emptyData() {
  return { admins: [], creators: [], projects: [], campaigns: [], campaignAssignments: [], submissions: [], transactions: [] };
}

let data;
try {
  data = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, "utf8")) : emptyData();
} catch (e) {
  console.warn(`[nexora] Could not read ${DB_PATH} (${e.message}) — starting with a fresh database.`);
  data = emptyData();
}
Object.assign(data, emptyData(), data);

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data), "utf8");
}

/* ---------------------------------------------------------
   admins
--------------------------------------------------------- */
function findAdminByEmail(email) {
  return data.admins.find((a) => a.email === email) || null;
}
function ensureAdminSeed() {
  if (data.admins.length) return;
  const email = (process.env.ADMIN_EMAIL || "jideekeocha@gmail.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "5hZQdK_yTmUw8PQzsa";
  data.admins.push({ id: "admin_" + Date.now(), email, password_hash: bcrypt.hashSync(password, 12), created_at: Date.now() });
  save();
  console.log(`Seeded admin account for ${email}. Set ADMIN_EMAIL / ADMIN_PASSWORD in .env before deploying anywhere public.`);
}
ensureAdminSeed();

/* ---------------------------------------------------------
   creators
--------------------------------------------------------- */
function findCreatorById(id) { return data.creators.find((c) => c.id === id) || null; }
function findCreatorByEmail(email) { return data.creators.find((c) => c.email === email) || null; }
function listAllCreators() { return data.creators.slice().sort((a, b) => b.created_at - a.created_at); }
function insertCreator(c) {
  const row = {
    id: c.id, name: c.name, email: c.email, password_hash: c.passwordHash || null,
    auth_provider: c.authProvider || "password", wallet_address: c.walletAddress || null,
    total_earned: 0,
    social_twitter: "", social_tiktok: "", social_instagram: "", social_youtube: "",
    created_at: c.createdAt || Date.now(),
  };
  data.creators.push(row);
  save();
  return row;
}
function updateCreatorSocials(id, socials) {
  const c = findCreatorById(id);
  if (!c) return null;
  c.social_twitter = socials.twitter || "";
  c.social_tiktok = socials.tiktok || "";
  c.social_instagram = socials.instagram || "";
  c.social_youtube = socials.youtube || "";
  save();
  return c;
}
function updateCreatorWalletAddress(id, address) {
  const c = findCreatorById(id);
  if (!c) return null;
  c.wallet_address = address;
  save();
  return c;
}
function creditCreatorPayout(id, amount) {
  const c = findCreatorById(id);
  if (!c) return null;
  c.total_earned += amount;
  save();
  return c;
}
function countCreators() { return data.creators.length; }
function sumCreatorTotalEarned() { return data.creators.reduce((s, c) => s + c.total_earned, 0); }

/* ---------------------------------------------------------
   projects
--------------------------------------------------------- */
function findProjectById(id) { return data.projects.find((p) => p.id === id) || null; }
function findProjectByEmail(email) { return data.projects.find((p) => p.email === email) || null; }
function insertProject(p) {
  const row = {
    id: p.id, name: p.name, email: p.email, password_hash: p.passwordHash || null,
    auth_provider: p.authProvider || "password", created_at: p.createdAt || Date.now(),
  };
  data.projects.push(row);
  save();
  return row;
}

/* ---------------------------------------------------------
   campaigns — no budget/auto-split. Payment happens off-platform;
   the site only tracks whether the owner says they've sent it and
   whether admin has confirmed that on-chain.
--------------------------------------------------------- */
function insertCampaign(c) {
  const row = {
    id: c.id, project_id: c.projectId, title: c.title, description: c.description,
    creators_needed: c.creatorsNeeded, duration_days: c.durationDays, amount_sent: c.amountSent || null,
    payment_sent: !!c.paymentSent, payment_verified: false, verified_at: null,
    created_at: c.createdAt || Date.now(),
  };
  data.campaigns.push(row);
  save();
  return row;
}
function findCampaignById(id) { return data.campaigns.find((c) => c.id === id) || null; }
function findCampaignByIdAndProject(id, projectId) {
  return data.campaigns.find((c) => c.id === id && c.project_id === projectId) || null;
}
function listCampaignsByProject(projectId) {
  return data.campaigns.filter((c) => c.project_id === projectId).sort((a, b) => b.created_at - a.created_at);
}
function listAllCampaigns() {
  return data.campaigns.slice().sort((a, b) => b.created_at - a.created_at);
}
function markCampaignPaymentSent(id, amountSent) {
  const c = findCampaignById(id);
  if (!c) return null;
  c.payment_sent = true;
  if (amountSent !== undefined && amountSent !== null) c.amount_sent = amountSent;
  save();
  return c;
}
function markCampaignPaymentVerified(id, verifiedAt) {
  const c = findCampaignById(id);
  if (!c) return null;
  c.payment_verified = true;
  c.verified_at = verifiedAt;
  save();
  return c;
}
function countCampaigns() { return data.campaigns.length; }

/* ---------------------------------------------------------
   campaign_assignments — created manually by admin, not an algorithm
--------------------------------------------------------- */
function isAssigned(campaignId, creatorId) {
  return data.campaignAssignments.some((a) => a.campaign_id === campaignId && a.creator_id === creatorId);
}
function assignCreator(campaignId, creatorId, assignedAt) {
  if (isAssigned(campaignId, creatorId)) return false;
  data.campaignAssignments.push({ campaign_id: campaignId, creator_id: creatorId, assigned_at: assignedAt || Date.now() });
  save();
  return true;
}
function unassignCreator(campaignId, creatorId) {
  const before = data.campaignAssignments.length;
  data.campaignAssignments = data.campaignAssignments.filter((a) => !(a.campaign_id === campaignId && a.creator_id === creatorId));
  if (data.campaignAssignments.length !== before) {
    data.submissions = data.submissions.filter((s) => !(s.campaign_id === campaignId && s.creator_id === creatorId));
    save();
  }
}
function countAssignmentsForCampaign(campaignId) {
  return data.campaignAssignments.filter((a) => a.campaign_id === campaignId).length;
}
function listAssignmentsForCreator(creatorId) {
  return data.campaignAssignments.filter((a) => a.creator_id === creatorId);
}
function listAssignedCreatorIdsForCampaign(campaignId) {
  return data.campaignAssignments.filter((a) => a.campaign_id === campaignId).map((a) => a.creator_id);
}

/* ---------------------------------------------------------
   submissions — a creator's post link, plus whatever admin has
   manually entered after looking at it. status: submitted -> verified -> paid
--------------------------------------------------------- */
function findSubmission(campaignId, creatorId) {
  return data.submissions.find((s) => s.campaign_id === campaignId && s.creator_id === creatorId) || null;
}
function listSubmissionsForCampaign(campaignId) {
  return data.submissions.filter((s) => s.campaign_id === campaignId);
}
function upsertSubmissionLink(campaignId, creatorId, postUrl, submittedAt) {
  const existing = findSubmission(campaignId, creatorId);
  if (existing) {
    existing.post_url = postUrl;
    existing.submitted_at = submittedAt;
    // resubmitting a link resets any prior manual review
    existing.views = null;
    existing.likes = null;
    existing.payout = 0;
    existing.status = "submitted";
    existing.verified_at = null;
    existing.paid_at = null;
  } else {
    data.submissions.push({
      campaign_id: campaignId, creator_id: creatorId, post_url: postUrl,
      views: null, likes: null, payout: 0, status: "submitted",
      submitted_at: submittedAt, verified_at: null, paid_at: null,
    });
  }
  save();
}
function saveSubmissionReview(campaignId, creatorId, { views, likes, payout, verifiedAt }) {
  const s = findSubmission(campaignId, creatorId);
  if (!s) return null;
  s.views = views;
  s.likes = likes;
  s.payout = payout;
  s.status = "verified";
  s.verified_at = verifiedAt;
  save();
  return s;
}
function markSubmissionPaid(campaignId, creatorId, paidAt) {
  const s = findSubmission(campaignId, creatorId);
  if (!s) return null;
  s.status = "paid";
  s.paid_at = paidAt;
  save();
  return s;
}

/* ---------------------------------------------------------
   transactions (paid submissions only — a simple audit trail)
--------------------------------------------------------- */
function insertTransaction(t) {
  data.transactions.push({ id: t.id, creator_id: t.creatorId, campaign_id: t.campaignId, amount: t.amount, ts: t.ts || Date.now() });
  save();
}
function listTransactionsForCreator(creatorId) {
  return data.transactions.filter((t) => t.creator_id === creatorId).sort((a, b) => b.ts - a.ts);
}
function listAllTransactions() {
  return data.transactions.slice().sort((a, b) => b.ts - a.ts);
}

/* ---------------------------------------------------------
   Joined / derived views
--------------------------------------------------------- */
function getCreatorCampaignsView(creatorId) {
  return listAssignmentsForCreator(creatorId)
    .map((a) => {
      const c = findCampaignById(a.campaign_id);
      if (!c) return null;
      const project = findProjectById(c.project_id);
      const sub = findSubmission(c.id, creatorId);
      return {
        id: c.id, title: c.title, description: c.description,
        creatorsNeeded: c.creators_needed, durationDays: c.duration_days,
        paymentVerified: c.payment_verified, projectName: project ? project.name : null,
        _createdAt: c.created_at,
        submission: sub
          ? { postUrl: sub.post_url, views: sub.views, likes: sub.likes, payout: sub.payout, status: sub.status }
          : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b._createdAt - a._createdAt)
    .map(({ _createdAt, ...rest }) => rest);
}
function getCampaignSubmissionsView(campaignId) {
  return listSubmissionsForCampaign(campaignId).map((s) => {
    const creator = findCreatorById(s.creator_id);
    return {
      creatorId: s.creator_id, creatorName: creator ? creator.name : "—",
      creatorWallet: creator ? creator.wallet_address : null,
      postUrl: s.post_url, views: s.views, likes: s.likes, payout: s.payout, status: s.status,
    };
  });
}
/** Creators assigned to a campaign who haven't submitted a link at all yet
 * (so admin's assign UI can show "no submission yet" rows too). */
function getCampaignAssignmentsView(campaignId) {
  return listAssignedCreatorIdsForCampaign(campaignId).map((creatorId) => {
    const creator = findCreatorById(creatorId);
    const s = findSubmission(campaignId, creatorId);
    return {
      creatorId, creatorName: creator ? creator.name : "—", creatorWallet: creator ? creator.wallet_address : null,
      postUrl: s ? s.post_url : null, views: s ? s.views : null, likes: s ? s.likes : null,
      payout: s ? s.payout : 0, status: s ? s.status : "no_submission",
    };
  });
}
function computeLeaderboardRaw() {
  return data.creators
    .map((c) => ({ id: c.id, name: c.name, totalEarned: c.total_earned }))
    .sort((a, b) => b.totalEarned - a.totalEarned);
}
function getLedgerView() {
  return listAllTransactions().map((t) => {
    const creator = findCreatorById(t.creator_id);
    const camp = t.campaign_id ? findCampaignById(t.campaign_id) : null;
    return { id: t.id, creatorName: creator ? creator.name : "—", campaignTitle: camp ? camp.title : null, amount: t.amount, ts: t.ts };
  });
}
function countPendingPayouts() {
  return data.submissions.filter((s) => s.status === "verified").length;
}
function countCampaignsAwaitingVerification() {
  return data.campaigns.filter((c) => c.payment_sent && !c.payment_verified).length;
}

module.exports = {
  findAdminByEmail,
  findCreatorById, findCreatorByEmail, listAllCreators, insertCreator,
  updateCreatorSocials, updateCreatorWalletAddress, creditCreatorPayout,
  countCreators, sumCreatorTotalEarned,
  findProjectById, findProjectByEmail, insertProject,
  insertCampaign, findCampaignById, findCampaignByIdAndProject, listCampaignsByProject, listAllCampaigns,
  markCampaignPaymentVerified, markCampaignPaymentSent, countCampaigns,
  isAssigned, assignCreator, unassignCreator, countAssignmentsForCampaign, listAssignedCreatorIdsForCampaign,
  findSubmission, listSubmissionsForCampaign, upsertSubmissionLink, saveSubmissionReview, markSubmissionPaid,
  insertTransaction, listTransactionsForCreator, listAllTransactions,
  getCreatorCampaignsView, getCampaignSubmissionsView, getCampaignAssignmentsView,
  computeLeaderboardRaw, getLedgerView, countPendingPayouts, countCampaignsAwaitingVerification,
};
