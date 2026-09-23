/**
 * Makes `npm start` work with zero manual setup: if there's no .env yet,
 * create one from .env.example and generate a real JWT_SECRET and a real
 * random admin password automatically. If a .env already exists but still
 * has the placeholder values from .env.example, those get replaced too.
 *
 * This intentionally does NOT touch values you've already set yourself —
 * it only fills in what's missing or still a placeholder.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const ENV_PATH = path.join(ROOT, ".env");
const EXAMPLE_PATH = path.join(ROOT, ".env.example");
const CREDENTIALS_PATH = path.join(ROOT, "ADMIN_CREDENTIALS.txt");

const PLACEHOLDERS = {
  JWT_SECRET: ["", "replace_this_with_a_long_random_string"],
  ADMIN_PASSWORD: ["", "change_me_before_deploying", "change_me"],
};

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}
function randomPassword() {
  return crypto.randomBytes(12).toString("base64url"); // ~16 chars, URL-safe
}

function parseEnvFile(content) {
  const values = {};
  content.split("\n").forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) values[m[1]] = m[2];
  });
  return values;
}

function bootstrapEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    if (fs.existsSync(EXAMPLE_PATH)) {
      fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
    } else {
      fs.writeFileSync(ENV_PATH, "");
    }
  }

  let content = fs.readFileSync(ENV_PATH, "utf8");
  const current = parseEnvFile(content);
  const generated = {};

  Object.entries(PLACEHOLDERS).forEach(([key, placeholders]) => {
    const value = current[key];
    if (value === undefined || placeholders.includes(value)) {
      const newValue = key === "JWT_SECRET" ? randomToken(48) : randomPassword();
      generated[key] = newValue;
      if (value === undefined) {
        content += `\n${key}=${newValue}\n`;
      } else {
        content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${newValue}`);
      }
    }
  });

  if (!current.ADMIN_EMAIL) {
    content += `\nADMIN_EMAIL=admin@nexora.local\n`;
  }

  if (Object.keys(generated).length) {
    fs.writeFileSync(ENV_PATH, content);
  }

  require("dotenv").config({ path: ENV_PATH });

  if (generated.ADMIN_PASSWORD) {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@nexora.local";
    const banner =
      `\n==================== NEXORA: FIRST RUN ====================\n` +
      `A .env file didn't exist (or had placeholder secrets), so one\n` +
      `was generated automatically. Your admin login is:\n\n` +
      `  Email:    ${adminEmail}\n` +
      `  Password: ${generated.ADMIN_PASSWORD}\n\n` +
      `This has also been saved to ADMIN_CREDENTIALS.txt in the project\n` +
      `root. Log in at /#/login on the running app, then delete that file\n` +
      `once you've saved the password somewhere safe (a password manager).\n` +
      `=============================================================\n`;
    console.log(banner);
    fs.writeFileSync(
      CREDENTIALS_PATH,
      `Nexora admin login (auto-generated on first run)\n\nEmail: ${adminEmail}\nPassword: ${generated.ADMIN_PASSWORD}\n\nDelete this file once you've saved the password somewhere safe.\n`
    );
  }
}

bootstrapEnv();
