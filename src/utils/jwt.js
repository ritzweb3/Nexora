const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === "replace_this_with_a_long_random_string") {
  console.warn(
    "[nexora] WARNING: JWT_SECRET is missing or still the placeholder value. " +
    "Set a real random secret in .env before deploying anywhere reachable by anyone but you."
  );
}

function sign(payload, expiresIn = "7d") {
  return jwt.sign(payload, SECRET || "dev-only-insecure-secret", { expiresIn });
}

function verify(token) {
  return jwt.verify(token, SECRET || "dev-only-insecure-secret");
}

module.exports = { sign, verify };
