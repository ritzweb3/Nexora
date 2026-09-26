const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { id } = require("../src/utils/ids");

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-campaign-test-"));
process.env.DB_PATH = path.join(testDir, "data.json");
process.env.ADMIN_EMAIL = "admin@example.test";
process.env.ADMIN_PASSWORD = "campaign-test-password";
process.env.JWT_SECRET = "campaign-test-jwt-secret";
const db = require("../src/db");
const express = require("express");
const { router: creatorRouter } = require("../src/routes/creators");
const { router: adminRouter } = require("../src/routes/admin");
const { sign } = require("../src/utils/jwt");

test("campaign accepts unlimited independent links and leaderboard totals verified metrics", () => {
  const creatorId = id("cr");
  const projectId = id("pr");
  const campaignId = id("cp");
  const start = 1_000_000;
  db.insertCreator({ id: creatorId, name: "Creator", email: "creator@example.test", createdAt: start });
  db.insertProject({ id: projectId, name: "Project", email: "project@example.test", createdAt: start });
  const campaign = db.insertCampaign({
    id: campaignId, projectId, title: "Campaign", description: "Brief",
    projectAbout: "A creator-first project", socials: { twitter: "@project", youtube: "https://youtube.com/@project" },
    creatorsNeeded: 1, durationDays: 10, createdAt: start,
  });
  db.assignCreator(campaignId, creatorId, start);

  assert.equal(db.isCampaignOpen(campaign, start + 10 * 86400000 - 1), true);
  assert.equal(db.isCampaignOpen(campaign, start + 10 * 86400000), false);

  const first = db.addSubmissionLink(campaignId, creatorId, "https://example.test/1", start + 1);
  const second = db.addSubmissionLink(campaignId, creatorId, "https://example.test/2", start + 2);
  const third = db.addSubmissionLink(campaignId, creatorId, "https://example.test/3", start + 3);
  db.saveSubmissionReviewById(first.id, { views: 100, likes: 10, payout: 2, verifiedAt: start + 4 });
  db.saveSubmissionReviewById(second.id, { views: 200, likes: 20, payout: 3, verifiedAt: start + 5 });
  db.markSubmissionPaidById(second.id, start + 6);
  db.creditCreatorPayout(creatorId, 3);

  const marketplaceCampaign = db.getCreatorCampaignMarketplaceView(creatorId)[0];
  const submissions = marketplaceCampaign.submissions;
  assert.equal(marketplaceCampaign.projectAbout, "A creator-first project");
  assert.deepEqual(marketplaceCampaign.projectSocials, {
    twitter: "@project", tiktok: "", instagram: "", youtube: "https://youtube.com/@project",
  });
  assert.equal(submissions.length, 3);
  assert.deepEqual(submissions.map((submission) => submission.status), ["verified", "paid", "submitted"]);
  assert.equal(new Set(submissions.map((submission) => submission.id)).size, 3);

  const [ranking] = db.computeLeaderboardRaw();
  assert.equal(ranking.verifiedLinks, 2);
  assert.equal(ranking.totalViews, 300);
  assert.equal(ranking.totalLikes, 30);
  assert.equal(ranking.totalPaid, 3);
  assert.equal(db.getAllSubmissionsView().length, 3);

  db.unassignCreator(campaignId, creatorId);
  assert.equal(db.isAssigned(campaignId, creatorId), false);
  assert.equal(db.getCreatorCampaignMarketplaceView(creatorId)[0].submissions.length, 3);
  assert.equal(db.getAllSubmissionsView().length, 3);
});

test("creator submission endpoint enforces assignment and campaign deadline, not a link limit", async () => {
  const creatorId = id("cr");
  const projectId = id("pr");
  const campaignId = id("cp");
  const expiredCampaignId = id("cp");
  const unassignedCampaignId = id("cp");
  db.insertCreator({ id: creatorId, name: "Endpoint Creator", email: "endpoint@example.test" });
  db.insertProject({ id: projectId, name: "Endpoint Project", email: "endpoint-project@example.test" });
  db.insertCampaign({ id: campaignId, projectId, title: "Open", description: "Brief", creatorsNeeded: 1, durationDays: 10 });
  db.insertCampaign({ id: expiredCampaignId, projectId, title: "Expired", description: "Brief", creatorsNeeded: 1, durationDays: 1, createdAt: 1 });
  db.insertCampaign({ id: unassignedCampaignId, projectId, title: "Unassigned", description: "Brief", creatorsNeeded: 1, durationDays: 10 });
  db.assignCreator(campaignId, creatorId);
  db.assignCreator(expiredCampaignId, creatorId);

  const app = express();
  app.use(express.json());
  app.use("/creators", creatorRouter);
  app.use("/admin", adminRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${sign({ role: "creator", id: creatorId })}`, "Content-Type": "application/json" };
  const adminHeaders = { Authorization: `Bearer ${sign({ role: "admin", id: "admin-test" })}`, "Content-Type": "application/json" };
  try {
    let firstSubmissionId;
    for (let index = 0; index < 20; index += 1) {
      const response = await fetch(`${baseUrl}/creators/me/campaigns/${campaignId}/submit`, {
        method: "POST", headers, body: JSON.stringify({ postUrl: `https://example.test/post-${index}` }),
      });
      assert.equal(response.status, 201);
      const submission = await response.json();
      if (index === 0) firstSubmissionId = submission.submissionId;
    }
    const expiredResponse = await fetch(`${baseUrl}/creators/me/campaigns/${expiredCampaignId}/submit`, {
      method: "POST", headers, body: JSON.stringify({ postUrl: "https://example.test/expired" }),
    });
    assert.equal(expiredResponse.status, 410);
    const unassignedResponse = await fetch(`${baseUrl}/creators/me/campaigns/${unassignedCampaignId}/submit`, {
      method: "POST", headers, body: JSON.stringify({ postUrl: "https://example.test/unassigned" }),
    });
    assert.equal(unassignedResponse.status, 403);
    assert.equal(db.listSubmissionsForCampaign(campaignId).length, 20);

    const reviewResponse = await fetch(`${baseUrl}/admin/submissions/${firstSubmissionId}/review`, {
      method: "POST", headers: adminHeaders, body: JSON.stringify({ views: 500, likes: 50, payout: 8 }),
    });
    assert.equal(reviewResponse.status, 200);
    const paidResponse = await fetch(`${baseUrl}/admin/submissions/${firstSubmissionId}/mark-paid`, {
      method: "POST", headers: adminHeaders, body: JSON.stringify({}),
    });
    assert.equal(paidResponse.status, 200);

    const allResponse = await fetch(`${baseUrl}/admin/submissions/all`, { headers: adminHeaders });
    const allSubmissions = await allResponse.json();
    const campaignSubmissions = allSubmissions.filter((submission) => submission.campaignId === campaignId);
    assert.equal(campaignSubmissions.length, 20);
    assert.equal(campaignSubmissions.filter((submission) => submission.status === "paid").length, 1);
    const rankingResponse = await fetch(`${baseUrl}/creators/leaderboard`, { headers });
    const [ranking] = await rankingResponse.json();
    assert.equal(ranking.totalViews, 500);
    assert.equal(ranking.totalLikes, 50);
    assert.equal(ranking.totalPaid, 8);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test.after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});
