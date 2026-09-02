// ═══════════════════════════════════════════════════════════════
// JSON-Datenbank v2 – komplett neu aufgebaut (0.8.43e)
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FLUSH_MS = 3000;

const COLLECTIONS = [
  'guilds', 'guild_settings', 'dashboard_users', 'mod_entries', 'filter_hits',
  'ai_detections', 'economy', 'transactions', 'inventory', 'levels', 'tickets',
  'transcripts', 'giveaways', 'reminders', 'tags', 'custom_commands',
  'design_presets', 'treasury_log', 'lottery', 'suggestions', 'scheduled',
  'counters', 'admin_log', 'embeds', 'login_log', 'mod_hinweise', 'ziele',
  'umfragen', 'invites', 'geworben', 'steuer', 'steuerPeriode', 'staat',
  'depots', 'kredite', 'immobilien', 'boerse',
];

const store = new Map();
const dirty = new Set();

function filePath(name) { return path.join(DATA_DIR, name + '.json'); }
function newId(praefix = '') { return praefix + crypto.randomBytes(6).toString('hex'); }

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const name of COLLECTIONS) {
    const m = new Map();
    const fp = filePath(name);
    if (fs.existsSync(fp)) {
      try {
        const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
        for (const [k, v] of Object.entries(raw)) m.set(String(k), v);
      } catch (e) {
        logger.warn('DB: ' + name + '.json unlesbar – Backup prüfen.');
        const bak = fp + '.bak';
        if (fs.existsSync(bak)) {
          try {
            const raw = JSON.parse(fs.readFileSync(bak, 'utf8'));
            for (const [k, v] of Object.entries(raw)) m.set(String(k), v);
            logger.warn('DB: ' + name + ' aus Backup wiederhergestellt.');
          } catch (_) { logger.error('DB: ' + name + ' auch Backup unlesbar – startet leer.'); }
        }
      }
    }
    store.set(name, m);
  }
  const t = setInterval(flush, FLUSH_MS);
  if (t.unref) t.unref();
}

function flush() {
  if (dirty.size === 0) return;
  for (const name of dirty) {
    const m = store.get(name);
    if (!m) continue;
    const fp = filePath(name);
    const tmp = fp + '.tmp';
    try {
      if (fs.existsSync(fp)) fs.copyFileSync(fp, fp + '.bak');
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(m)));
      fs.renameSync(tmp, fp);
    } catch (e) {
      logger.error('DB: Schreiben von ' + name + ' fehlgeschlagen: ' + e.message);
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    }
  }
  dirty.clear();
}

function get(name, id, fallback = null) {
  const m = store.get(name);
  if (!m) return fallback;
  const v = m.get(String(id));
  return v === undefined ? fallback : v;
}

function set(name, id, dok) {
  let m = store.get(name);
  if (!m) { m = new Map(); store.set(name, m); }
  m.set(String(id), dok);
  dirty.add(name);
  return dok;
}

function del(name, id) {
  const m = store.get(name);
  if (!m) return false;
  const ok = m.delete(String(id));
  if (ok) dirty.add(name);
  return ok;
}

function all(name) {
  const m = store.get(name);
  if (!m) return [];
  return [...m.entries()];
}

function values(name) {
  const m = store.get(name);
  if (!m) return [];
  return [...m.values()];
}

function push(name, dok) {
  const id = dok.id || newId();
  set(name, id, { ...dok, id });
  return id;
}

function counter(name) {
  const n = (get('counters', name, 0) || 0) + 1;
  set('counters', name, n);
  return n;
}

function update(name, id, fn, fallback = null) {
  const aktuell = get(name, id, fallback);
  const naechster = typeof fn === 'function' ? fn(aktuell) : fn;
  return set(name, id, naechster);
}

function exportAll() {
  const out = { _meta: { exportiertAm: Date.now(), version: 2 } };
  for (const name of COLLECTIONS) out[name] = Object.fromEntries(store.get(name) || new Map());
  return out;
}

function importAll(data) {
  for (const name of COLLECTIONS) {
    if (!data[name] || typeof data[name] !== 'object') continue;
    let m = store.get(name);
    if (!m) { m = new Map(); store.set(name, m); }
    m.clear();
    for (const [k, v] of Object.entries(data[name])) m.set(String(k), v);
    dirty.add(name);
  }
  flush();
}

function shutdownHooks() {
  process.on('exit', () => { try { flush(); } catch (_) {} });
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

module.exports = {
  init, flush, get, set, del, all, values, push, counter, update,
  newId, exportAll, importAll, shutdownHooks, COLLECTIONS,
};
