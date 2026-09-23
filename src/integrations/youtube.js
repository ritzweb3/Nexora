/**
 * YouTube is the one platform in this whole app where "pull the real public
 * engagement numbers from a link" can genuinely be implemented with nothing
 * more than a free API key — no OAuth, no per-user consent, no paid tier.
 * That's because YouTube's Data API exposes view/like/comment counts on any
 * public video as public data.
 *
 * Get a key: console.cloud.google.com -> enable "YouTube Data API v3" ->
 * Credentials -> Create API key. Put it in .env as YOUTUBE_API_KEY.
 *
 * Everything else (X, TikTok, Instagram) needs the creator to have connected
 * that platform via OAuth AND that platform's API to grant your app
 * elevated/insights access — see integrations/simulate.js and the README.
 */

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function isYouTubeUrl(url) {
  return /youtube\.com|youtu\.be/i.test(url);
}

async function fetchYouTubeStats(url) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not find a video ID in that YouTube link.");
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set — add one in .env to fetch real YouTube stats.");

  const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${apiKey}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item) throw new Error("YouTube returned no data for that video — check the link is public.");

  const stats = item.statistics || {};
  return {
    views: Number(stats.viewCount || 0),
    likes: Number(stats.likeCount || 0), // note: a channel can hide like counts, in which case this is 0
    comments: Number(stats.commentCount || 0),
    source: "youtube_api_real",
  };
}

module.exports = { isYouTubeUrl, fetchYouTubeStats, extractVideoId };
