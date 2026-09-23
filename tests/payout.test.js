const test = require("node:test");
const assert = require("node:assert");
const { isValidEthAddress, suggestPayout } = require("../src/utils/payout");

test("accepts a valid-looking EVM address", () => {
  assert.strictEqual(isValidEthAddress("0x000000000000000000000000000000000000dEaD"), true);
});
test("rejects addresses missing 0x, too short, or with bad characters", () => {
  assert.strictEqual(isValidEthAddress("0000000000000000000000000000000000dEaD"), false);
  assert.strictEqual(isValidEthAddress("0x1234"), false);
  assert.strictEqual(isValidEthAddress("0xZZZZ000000000000000000000000000000dEaD"), false);
  assert.strictEqual(isValidEthAddress(""), false);
  assert.strictEqual(isValidEthAddress(undefined), false);
});

test("suggestPayout uses the default rates when none are set", () => {
  delete process.env.RATE_PER_1000_VIEWS;
  delete process.env.RATE_PER_500_LIKES;
  // default: $2 / 1000 views + $1 / 500 likes
  assert.strictEqual(suggestPayout(1000, 0), 2);
  assert.strictEqual(suggestPayout(0, 500), 1);
  assert.strictEqual(suggestPayout(5000, 1000), 12); // (5*2) + (2*1)
});

test("suggestPayout respects configured rates", () => {
  process.env.RATE_PER_1000_VIEWS = "5";
  process.env.RATE_PER_500_LIKES = "3";
  assert.strictEqual(suggestPayout(2000, 500), 13); // (2*5) + (1*3)
  delete process.env.RATE_PER_1000_VIEWS;
  delete process.env.RATE_PER_500_LIKES;
});

test("suggestPayout never goes negative on bad input", () => {
  assert.strictEqual(suggestPayout(-500, -200), 0);
  assert.strictEqual(suggestPayout(NaN, NaN), 0);
});
