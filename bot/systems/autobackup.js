'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../../core/config');
const db = require('../../core/db');
const logger = require('../../core/logger');
const BACKUP_DIR = path.join(require('os').homedir(), 'lumiox-backups');
function einmalBackup(grund) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const datei = path.join(BACKUP_DIR, `lumiox-backup-${stamp}.json`);
  fs.writeFileSync(datei, JSON.stringify({
    _meta: { typ: 'lumiox-backup', version: 2, exportiertAm: Date.now(), grund },
    config: config.get(), db: db.exportAll(),
  }));
  aufraeumen();
  logger.ok(`Backup erstellt: ${path.basename(datei)} (${grund})`);
  return datei;
}
function aufraeumen() {
  const s = config.get().backups || {};
  const max = Math.max(1, Math.min(50, s.maxAnzahl || 10));
  const liste = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('lumiox-backup-') && f.endsWith('.json')).sort();
  while (liste.length > max) fs.unlinkSync(path.join(BACKUP_DIR, liste.shift()));
}
function naechsterLauf() {
  const s = config.get().backups || {};
  if (!s.enabled) return null;
  const [h, m] = String(s.uhrzeit || '04:00').split(':').map((n) => parseInt(n, 10) || 0);
  const jetzt = new Date();
  const d = new Date(jetzt);
  d.setHours(h, m, 0, 0);
  if (d <= jetzt) d.setDate(d.getDate() + 1);
  if ((s.intervall || 'täglich') === 'wöchentlich') { while (d.getDay() !== 0) d.setDate(d.getDate() + 1); }
  return d.getTime();
}
let letzte = 0;
function tick() {
  const jetzt = Date.now();
  if (jetzt - letzte < 55000) return;
  letzte = jetzt;
  const ziel = naechsterLauf();
  if (!ziel) return;
  if (jetzt >= ziel) einmalBackup('Geplant');
}
function init() { fs.mkdirSync(BACKUP_DIR, { recursive: true }); setInterval(tick, 60000); logger.ok('Auto-Backups aktiv'); }
module.exports = { init, einmalBackup, naechsterLauf, BACKUP_DIR };
