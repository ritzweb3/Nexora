const crypto = require("crypto");
const { isYouTubeUrl, fetchYouTubeStats } = require("./youtube");

/**
 * Deterministic stand-in for platforms this demo can't call for real:
 * X/Twitter, TikTok, Instagram. Each of those needs the *creator* to have
 * completed that platform's OAuth flow and granted your app permission to
 * read their post insights — X's API is paid past a small free tier, TikTok
 * and Instagram require an approved developer app plus the Display/Graph
 * API's content-publishing or insights scopes. None of that can be faked
 * safely, so this returns numbers derived only from the link text (same
 * link -> same numbers, every time) and is clearly labeled as simulated
 * everywhere it's used.
 */
function simulateFromLink(url) {
  const hash = crypto.createHash("sha256").update(String(url)).digest();
  const n = (offset, mod) => hash.readUInt32BE(offset) % mod;
  const views = 400 + n(0, 70000);
  const likeRatio = 0.015 + n(4, 100) / 900;
  const commentRatio = 0.003 + n(8, 60) / 1400;
  return {
    views,
    likes: Math.round(views * likeRatio),
    comments: Math.round(views * commentRatio),
    source: "simulated_demo_data",
  };
}

/**
 * Single entry point routes should call. Tries a real integration first
 * (currently just YouTube), and falls back to the labeled simulation for
 * everything else so the product still functions end-to-end today.
 */
async function pullEngagement(url) {
  if (isYouTubeUrl(url)) {
    try {
      return await fetchYouTubeStats(url);
    } catch (e) {
      // Falls through to simulation so a missing/invalid API key doesn't
      // break the whole submission flow — but this is logged loudly because
      // in production you'd want to know your real integration is down.
      console.warn(`[engagement] YouTube fetch failed (${e.message}), falling back to simulated data.`);
      return simulateFromLink(url);
    }
  }
  return simulateFromLink(url);
}

module.exports = { pullEngagement, simulateFromLink };
