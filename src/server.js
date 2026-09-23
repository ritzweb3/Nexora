require("./utils/bootstrapEnv"); // creates .env + real secrets automatically on first run
const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

require("./db"); // initializes schema + seeds the admin account on first boot

const { router: authRouter } = require("./routes/auth");
const { router: creatorsRouter } = require("./routes/creators");
const { router: projectsRouter } = require("./routes/projects");
const { router: adminRouter } = require("./routes/admin");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => res.json({ ok: true, service: "nexora-backend" }));

app.get("/stats", (req, res) => {
  const db = require("./db");
  res.json({
    creators: db.countCreators(), campaigns: db.countCampaigns(), paidToCreators: db.sumCreatorTotalEarned(),
    companyWalletAddress: process.env.COMPANY_WALLET_ADDRESS || null,
  });
});

app.use("/auth", authRouter);
app.use("/creators", creatorsRouter);
app.use("/projects", projectsRouter);
app.use("/admin", adminRouter);

// The front end is a single-page app served as a static file. It's served
// from this same Express app (same origin, no CORS setup needed, one thing
// to deploy). Hash-based client routing (#/creator, #/admin, etc.) needs no
// server-side route handling — every path still serves index.html.
app.use(express.static(path.join(__dirname, "..", "public")));

// API 404s (anything under these prefixes that didn't match a route above)
app.use(["/auth", "/creators", "/projects", "/admin"], (req, res) => res.status(404).json({ error: "Not found." }));

// Everything else falls back to the front-end app (client-side hash routing).
app.get("/*splat", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

// Central error handler — keeps stack traces out of API responses.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Nexora is running: http://localhost:${PORT}`));
