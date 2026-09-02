// ═══════════════════════════════════════════════════════════════
// Konfigurations-Verwaltung:
//  - config.json = globale Einstellungen (Token, Ollama, Dashboard)
//  - pro-Gilde-Einstellungen liegen in der DB (Collection
//    "guild_settings") und werden über defaults.js mit sicheren
//    Standardwerten gemerged – neue Optionen funktionieren sofort
//    auch für alte Server-Einträge.
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
let cfg = null;

function deepMerge(basis, extra) {
  const out = { ...basis };
  for (const [k, v] of Object.entries(extra || {})) {
    if (
      v && typeof v === 'object' && !Array.isArray(v) &&
      out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function init() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      logger.error('config.json unlesbar, starte mit leerer Konfiguration: ' + e.message);
      cfg = {};
    }
  } else {
    cfg = {};
  }
  cfg = deepMerge(defaultConfig(), cfg);
  save();
}

function defaultConfig() {
  return {
    setupComplete: false,
    token: '',
    clientId: '',
    guildId: '', // optional: beim Start Slash-Commands nur auf diesem Server registrieren (sofort aktiv)
    ollama: {
      url: 'http://127.0.0.1:11434',
      model: 'gemma2:2b',
      temperature: 0.2,
    },
    dashboard: {
      port: 3000,
      sessionHours: 24,
      adminCreated: false,
      sessionSecret: crypto.randomBytes(32).toString('hex'), // einmalig erzeugt
    },
  };
}

function save() {
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}

function get() { return cfg; }

function set(patch) {
  cfg = deepMerge(cfg, patch);
  if (cfg.token && cfg.clientId && cfg.dashboard && cfg.dashboard.adminCreated) {
    cfg.setupComplete = true;
  }
  save();
  return cfg;
}

// ── Gilden-Einstellungen ────────────────────────────────────────
function getGuildSettings(guildId) {
  const db = require('./db');
  const defaults = require('./defaults');
  const gespeichert = db.get('guild_settings', guildId, {}) || {};
  return deepMerge(defaults.guildSettings(), gespeichert);
}

function setGuildSettings(guildId, patch) {
  const db = require('./db');
  const merged = deepMerge(getGuildSettings(guildId), patch);
  db.set('guild_settings', guildId, merged);
  return merged;
}

module.exports = { init, save, get, set, getGuildSettings, setGuildSettings, CONFIG_PATH };
