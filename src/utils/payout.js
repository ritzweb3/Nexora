/** Basic format check only — this is NOT a signature/ownership proof, just
 * making sure what someone typed looks like a real EVM address before it
 * gets used as a real payment destination. */
function isValidEthAddress(address) {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

/**
 * A suggestion only — admin can always override the final number before
 * saving. Rates are configured in .env so they can be changed without
 * touching code:
 *   RATE_PER_1000_VIEWS  — dollars paid per 1,000 verified views
 *   RATE_PER_500_LIKES   — dollars paid per 500 verified likes
 */
function suggestPayout(views, likes) {
  const rateViews = Number(process.env.RATE_PER_1000_VIEWS || 2);
  const rateLikes = Number(process.env.RATE_PER_500_LIKES || 1);
  const v = Math.max(0, Number(views) || 0);
  const l = Math.max(0, Number(likes) || 0);
  const amount = (v / 1000) * rateViews + (l / 500) * rateLikes;
  return Math.round(amount * 100) / 100;
}

module.exports = { isValidEthAddress, suggestPayout };
