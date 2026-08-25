/**
 * Config persistida em config.json (ao lado do index.js).
 */
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const DEFAULTS = {
  apiUrl: "",
  token: "",
  pollIntervalMs: 10000,
  printer: "",
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH };
