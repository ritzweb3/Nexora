/**
 * Scoring + payout algorithm.
 *
 * This intentionally lives only on the server now (it used to also be
 * rendered on the public landing page — that copy was removed on request,
 * but the math underneath is unchanged and still has to run somewhere).
 *
 *   raw          = views * 0.05  +  likes * 1  +  comments * 3
 *   engagement   = (likes + comments) / max(views, 50)
 *   multiplier   = clamp(0.6 + engagement * 8, 0.6, 2.2)
 *   flagged      = (likes + comments) > views * 0.9   -> multiplier forced to 0.2
 *   finalScore   = raw * multiplier
 *   payout share = finalScore / sum(finalScore in that campaign)
 *                  applied to a distributable pool = budget * 0.40
 *                  (the platform keeps the other 60% as its fee)
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scoreSubmission(views, likes, comments) {
  views = Math.max(0, Number(views) || 0);
  likes = Math.max(0, Number(likes) || 0);
  comments = Math.max(0, Number(comments) || 0);

  const raw = views * 0.05 + likes * 1 + comments * 3;
  const engagement = (likes + comments) / Math.max(views, 50);
  const flagged = views > 0 && likes + comments > views * 0.9;
  const multiplier = flagged ? 0.2 : clamp(0.6 + engagement * 8, 0.6, 2.2);
  const finalScore = raw * multiplier;

  return { views, likes, comments, raw, engagement, multiplier, flagged, finalScore };
}

/**
 * submissions: array of { creatorId, views, likes, comments }
 * budget: campaign budget
 * returns array of { creatorId, ...scoreFields, payout } sorted by finalScore desc
 */
function distributeCampaign(submissions, budget) {
  const pool = budget * 0.40;
  const scored = submissions.map((s) => ({ creatorId: s.creatorId, ...scoreSubmission(s.views, s.likes, s.comments) }));
  const total = scored.reduce((sum, s) => sum + s.finalScore, 0);
  scored.forEach((s) => {
    s.payout = total > 0 ? Math.round(pool * (s.finalScore / total) * 100) / 100 : 0;
  });
  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored;
}

module.exports = { scoreSubmission, distributeCampaign, clamp };
