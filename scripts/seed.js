require("../src/utils/bootstrapEnv");
const db = require("../src/db");
const { id } = require("../src/utils/ids");
const bcrypt = require("bcryptjs");
const { suggestPayout } = require("../src/utils/payout");

const now = Date.now();
const PASS = bcrypt.hashSync("password123", 10);

function upsertProject(name, email) {
  const projectId = id("pr");
  db.insertProject({ id: projectId, name, email, passwordHash: PASS, authProvider: "password", createdAt: now - Math.floor(Math.random() * 9e6) });
  return projectId;
}
function upsertCreator(name, email, wallet, socials) {
  const creatorId = id("cr");
  db.insertCreator({ id: creatorId, name, email, passwordHash: PASS, authProvider: "password", walletAddress: wallet, createdAt: now - Math.floor(Math.random() * 9e6) });
  db.updateCreatorSocials(creatorId, socials);
  return creatorId;
}
function makeCampaign(projectId, title, description, creatorsNeeded, durationDays, amountSent, paymentSent) {
  const campaignId = id("cp");
  db.insertCampaign({ id: campaignId, projectId, title, description, creatorsNeeded, durationDays, amountSent, paymentSent, createdAt: now - Math.floor(Math.random() * 7e6) });
  return campaignId;
}
function submitAndReview(campaignId, creatorId, postUrl, views, likes, payWith) {
  db.assignCreator(campaignId, creatorId, now);
  db.upsertSubmissionLink(campaignId, creatorId, postUrl, now - Math.floor(Math.random() * 3e6));
  if (payWith) {
    const payout = payWith === "auto" ? suggestPayout(views, likes) : payWith;
    db.saveSubmissionReview(campaignId, creatorId, { views, likes, payout, verifiedAt: now });
  }
}
function pay(campaignId, creatorId) {
  const sub = db.findSubmission(campaignId, creatorId);
  db.markSubmissionPaid(campaignId, creatorId, now);
  db.creditCreatorPayout(creatorId, sub.payout);
  db.insertTransaction({ id: id("tx"), creatorId, campaignId, amount: sub.payout, ts: now - Math.floor(Math.random() * 2e6) });
}

console.log("Seeding demo data...");

const pAurora = upsertProject("Aurora Chain", "team@aurorachain.xyz");
const pLumen = upsertProject("Lumen Protocol", "growth@lumen.finance");
const pDrift = upsertProject("Drift DAO", "hello@driftdao.xyz");

const c1 = upsertCreator("Ada Okafor", "ada@creator.io", "0x11111111111111111111111111111111111111aa", { twitter: "@ada_onchain" });
const c2 = upsertCreator("Marcus Webb", "marcus@creator.io", "0x22222222222222222222222222222222222222bb", { twitter: "@marcuswebb", tiktok: "@marcus.crypto" });
const c3 = upsertCreator("Yuki Tanaka", "yuki@creator.io", "0x33333333333333333333333333333333333333cc", { twitter: "@yukitanaka", instagram: "@yuki.web3" });
const c4 = upsertCreator("Priya Nair", "priya@creator.io", "0x44444444444444444444444444444444444444dd", { twitter: "@priyanair", youtube: "@PriyaOnChain" });
const c5 = upsertCreator("Diego Ramirez", "diego@creator.io", "0x55555555555555555555555555555555555555ee", { twitter: "@diegoramz" });
const c6 = upsertCreator("Zainab Bello", "zainab@creator.io", "0x66666666666666666666666666666666666666ff", { twitter: "@zainabbello", instagram: "@zainab.b" });

// Fully wrapped up: payment sent, verified, creators assigned, reviewed, and paid.
const camp1 = makeCampaign(pAurora, "Aurora Mainnet Launch Thread", "Explain Aurora's mainnet launch and your honest take.", 4, 14, 1200, true);
db.markCampaignPaymentVerified(camp1, now);
submitAndReview(camp1, c1, "https://x.com/ada_onchain/status/1001", 48000, 3100, "auto");
submitAndReview(camp1, c2, "https://x.com/marcuswebb/status/1002", 21000, 890, "auto");
submitAndReview(camp1, c4, "https://x.com/priyanair/status/1003", 61000, 4200, "auto");
[c1, c2, c4].forEach((c) => pay(camp1, c));

// Payment sent, still awaiting admin verification -- shows up in the admin queue.
const camp2 = makeCampaign(pLumen, "Lumen Yield Explainer", "Short-form video on how Lumen's yield vaults work.", 3, 10, 800, true);
db.assignCreator(camp2, c2, now);
db.assignCreator(camp2, c5, now);
db.upsertSubmissionLink(camp2, c2, "https://tiktok.com/@marcus.crypto/video/2001", now);

// Not sent yet -- just a brief with no creators assigned, exactly as a
// brand-new campaign would look right after creation.
const camp3 = makeCampaign(pDrift, "Drift DAO Governance Recap", "Recap last month's governance votes.", 4, 7, 600, false);

console.log("Done. Demo accounts (password: password123 for all):");
console.log("  Projects:  team@aurorachain.xyz, growth@lumen.finance, hello@driftdao.xyz");
console.log("  Creators:  ada@creator.io, marcus@creator.io, yuki@creator.io, priya@creator.io, diego@creator.io, zainab@creator.io");
console.log(`  Admin:     ${process.env.ADMIN_EMAIL || "jideekeocha@email.com"} / whatever ADMIN_PASSWORD is set to in .env`);
