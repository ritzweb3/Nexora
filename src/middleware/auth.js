const { verify } = require("../utils/jwt");

/**
 * requireAuth(["creator"]) or requireAuth(["creator","project"]) etc.
 * Reads "Authorization: Bearer <token>", verifies it, and attaches
 * req.auth = { role, id } if valid and the role is allowed.
 */
function requireAuth(allowedRoles) {
  return function (req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing bearer token." });
    let payload;
    try {
      payload = verify(token);
    } catch (e) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }
    if (allowedRoles && !allowedRoles.includes(payload.role)) {
      return res.status(403).json({ error: "This account type can't access this endpoint." });
    }
    req.auth = payload; // { role, id }
    next();
  };
}

module.exports = { requireAuth };
