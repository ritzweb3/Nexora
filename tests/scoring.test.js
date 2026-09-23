const test = require("node:test");
const assert = require("node:assert");
const { scoreSubmission, distributeCampaign } = require("../src/utils/scoring");

test("a clean, well-engaged submission is not flagged", () => {
  const s = scoreSubmission(40000, 3000, 400);
  assert.strictEqual(s.flagged, false);
  assert.ok(s.finalScore > 0);
});

test("an unrealistic like+comment ratio gets flagged and penalized", () => {
  const s = scoreSubmission(9000, 8800, 40);
  assert.strictEqual(s.flagged, true);
  assert.strictEqual(s.multiplier, 0.2);
});

test("payouts across a campaign sum to ~40% of budget (60% platform fee)", () => {
  const budget = 1000;
  const scored = distributeCampaign(
    [
      { creatorId: "a", views: 40000, likes: 3000, comments: 400 },
      { creatorId: "b", views: 15000, likes: 600, comments: 50 },
      { creatorId: "c", views: 5000, likes: 100, comments: 5 },
    ],
    budget
  );
  const total = scored.reduce((sum, s) => sum + s.payout, 0);
  assert.ok(Math.abs(total - budget * 0.40) < 0.05, `expected ~${budget * 0.40}, got ${total}`);
});

test("a campaign with zero submissions distributes nothing", () => {
  const scored = distributeCampaign([], 500);
  assert.deepStrictEqual(scored, []);
});
