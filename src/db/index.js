/**
 * Plain JSON-file data store — no native module, nothing to compile.
 * See README for why this is a deliberate choice, not a shortcut.
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { id } = require("../utils/ids");

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
let migratedSubmissionIds = false;
data.submissions.forEach((submission) => {
  if (!submission.id) {
    submission.id = id("sb");
    migratedSubmissionIds = true;
  }
});
if (migratedSubmissionIds) save();

/* ---------------------------------------------------------
   admins
--------------------------------------------------------- */
function findAdminByEmail(email) {
  return data.admins.find((a) => a.email === email) || null;
}
function ensureAdminSeed() {
  if (data.admins.length) return;
  const email = (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAIL1).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD1;
  if (!email || !password) {
    console.warn("[nexora] WARNING: No admin account seeded because ADMIN_EMAIL / ADMIN_PASSWORD are not set in .env.");
    return;
  }
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
    project_about: c.projectAbout || "",
    social_twitter: c.socials && c.socials.twitter || "", social_tiktok: c.socials && c.socials.tiktok || "",
    social_instagram: c.socials && c.socials.instagram || "", social_youtube: c.socials && c.socials.youtube || "",
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
function campaignEndsAt(campaign) {
  const startedAt = campaign.verified_at || campaign.created_at;
  return Number(startedAt) + Number(campaign.duration_days) * 86400000;
}
function isCampaignOpen(campaign, now) {
  return Number(now === undefined ? Date.now() : now) < campaignEndsAt(campaign);
}

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
function findSubmissionById(submissionId) {
  return data.submissions.find((s) => s.id === submissionId) || null;
}
function listSubmissionsForCampaign(campaignId) {
  return data.submissions.filter((s) => s.campaign_id === campaignId);
}
function listSubmissionsForCreator(creatorId) {
  return data.submissions.filter((s) => s.creator_id === creatorId).sort((a, b) => b.submitted_at - a.submitted_at);
}
function addSubmissionLink(campaignId, creatorId, postUrl, submittedAt, submissionId) {
  const submission = {
    id: submissionId || id("sb"),
    campaign_id: campaignId, creator_id: creatorId, post_url: postUrl,
    views: null, likes: null, payout: 0, status: "submitted",
    submitted_at: submittedAt, verified_at: null, paid_at: null,
  };
  data.submissions.push(submission);
  save();
  return submission;
}
function upsertSubmissionLink(campaignId, creatorId, postUrl, submittedAt) {
  return addSubmissionLink(campaignId, creatorId, postUrl, submittedAt);
}
function saveSubmissionReviewById(submissionId, { views, likes, payout, verifiedAt }) {
  const s = findSubmissionById(submissionId);
  if (!s) return null;
  s.views = views;
  s.likes = likes;
  s.payout = payout;
  s.status = "verified";
  s.verified_at = verifiedAt;
  save();
  return s;
}
function saveSubmissionReview(campaignId, creatorId, review) {
  const s = findSubmission(campaignId, creatorId);
  return s ? saveSubmissionReviewById(s.id, review) : null;
}
function markSubmissionPaidById(submissionId, paidAt) {
  const s = findSubmissionById(submissionId);
  if (!s) return null;
  s.status = "paid";
  s.paid_at = paidAt;
  save();
  return s;
}
function markSubmissionPaid(campaignId, creatorId, paidAt) {
  const s = findSubmission(campaignId, creatorId);
  return s ? markSubmissionPaidById(s.id, paidAt) : null;
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
      const creatorSubmissions = listSubmissionsForCampaign(c.id)
        .filter((submission) => submission.creator_id === creatorId);
      const sub = creatorSubmissions.length ? creatorSubmissions[creatorSubmissions.length - 1] : null;
      return {
        id: c.id, title: c.title, description: c.description,
        creatorsNeeded: c.creators_needed, durationDays: c.duration_days,
        paymentVerified: c.payment_verified, projectName: project ? project.name : null,
        projectAbout: c.project_about || "",
        projectSocials: campaignSocials(c),
        createdAt: c.created_at, verifiedAt: c.verified_at, endsAt: campaignEndsAt(c),
        isAssigned: true,
        submissions: creatorSubmissions.map(submissionView),
        _createdAt: c.created_at,
        submission: sub ? submissionView(sub) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b._createdAt - a._createdAt)
    .map(({ _createdAt, ...rest }) => rest);
}
function getCreatorCampaignMarketplaceView(creatorId) {
  return listAllCampaigns().map((c) => {
    const project = findProjectById(c.project_id);
    const assigned = isAssigned(c.id, creatorId);
    return {
      id: c.id, title: c.title, description: c.description,
      creatorsNeeded: c.creators_needed, durationDays: c.duration_days,
      paymentVerified: c.payment_verified, projectName: project ? project.name : null,
      projectAbout: c.project_about || "",
      projectSocials: campaignSocials(c),
      createdAt: c.created_at, verifiedAt: c.verified_at, endsAt: campaignEndsAt(c),
      isAssigned: assigned,
      submissions: listSubmissionsForCampaign(c.id)
        .filter((s) => s.creator_id === creatorId)
        .map(submissionView),
    };
  });
}
function campaignSocials(campaign) {
  return {
    twitter: campaign.social_twitter || "",
    tiktok: campaign.social_tiktok || "",
    instagram: campaign.social_instagram || "",
    youtube: campaign.social_youtube || "",
  };
}
function submissionView(s) {
  return {
    id: s.id, postUrl: s.post_url, views: s.views, likes: s.likes, payout: s.payout,
    status: s.status, submittedAt: s.submitted_at, verifiedAt: s.verified_at, paidAt: s.paid_at,
  };
}
function getCampaignSubmissionsView(campaignId) {
  return listSubmissionsForCampaign(campaignId).map((s) => {
    const creator = findCreatorById(s.creator_id);
    return {
      id: s.id, creatorId: s.creator_id, creatorName: creator ? creator.name : "—",
      creatorWallet: creator ? creator.wallet_address : null,
      postUrl: s.post_url, views: s.views, likes: s.likes, payout: s.payout, status: s.status,
      submittedAt: s.submitted_at, verifiedAt: s.verified_at, paidAt: s.paid_at,
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
      submissions: listSubmissionsForCampaign(campaignId).filter((item) => item.creator_id === creatorId).map(submissionView),
    };
  });
}
function computeLeaderboardRaw() {
  return data.creators
    .map((c) => {
      const verified = listSubmissionsForCreator(c.id).filter((s) => s.status === "verified" || s.status === "paid");
      const totalViews = verified.reduce((total, s) => total + (Number(s.views) || 0), 0);
      const totalLikes = verified.reduce((total, s) => total + (Number(s.likes) || 0), 0);
      return {
        id: c.id, name: c.name, totalViews, totalLikes,
        verifiedLinks: verified.length,
        totalEngagement: totalViews + totalLikes,
        totalPaid: Number(c.total_earned) || 0,
        totalEarned: Number(c.total_earned) || 0,
      };
    })
    .sort((a, b) => b.totalEngagement - a.totalEngagement || b.totalPaid - a.totalPaid || a.name.localeCompare(b.name));
}
function getAllSubmissionsView() {
  return listAllCampaigns().flatMap((campaign) => getCampaignSubmissionsView(campaign.id).map((s) => ({
    ...s,
    campaignId: campaign.id,
    campaignTitle: campaign.title,
  }))).sort((a, b) => b.submittedAt - a.submittedAt);
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
  markCampaignPaymentVerified, markCampaignPaymentSent, countCampaigns, campaignEndsAt, isCampaignOpen,
  isAssigned, assignCreator, unassignCreator, countAssignmentsForCampaign, listAssignedCreatorIdsForCampaign,
  findSubmission, findSubmissionById, listSubmissionsForCampaign, listSubmissionsForCreator,
  addSubmissionLink, upsertSubmissionLink, saveSubmissionReviewById, saveSubmissionReview, markSubmissionPaidById, markSubmissionPaid,
  insertTransaction, listTransactionsForCreator, listAllTransactions,
  getCreatorCampaignsView, getCreatorCampaignMarketplaceView, getCampaignSubmissionsView,
  getCampaignAssignmentsView, getAllSubmissionsView,
  computeLeaderboardRaw, getLedgerView, countPendingPayouts, countCampaignsAwaitingVerification,
};
