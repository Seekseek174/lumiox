// ═══════════════════════════════════════════════════════════════
// WIRTSCHAFTSKERN: Konten, Serverkasse, Shop, Statistik.
// Steuer-Berechnung liegt bewusst in steuern.js (kein Kreis-Import).
// Alle Werte sind pro Gilde + User gespeichert.
// ═══════════════════════════════════════════════════════════════
'use strict';

const db = require('../../core/db');
const config = require('../../core/config');

// ── Konten ──────────────────────────────────────────────────────
function getEco(guildId, userId) {
  const s = config.getGuildSettings(guildId);
  const id = `${guildId}_${userId}`;
  let eco = db.get('economy', id);
  if (!eco) {
    eco = {
      id, guildId, userId,
      bargeld: s.economy.startBalance || 250,
      bank: 0,
      schulden: 0,
      streak: 0,
      lastDaily: 0,
      lastWork: 0,
      lastRob: 0,
      items: [],
      boosterBis: 0,
      lastZinsTag: '',
    };
    db.set('economy', id, eco);
  }
  return eco;
}

function saveEco(eco) { db.set('economy', eco.id, eco); }

function vermoegen(eco) { return (eco.bargeld || 0) + (eco.bank || 0); }

// ── Serverkasse (Treasury) ──────────────────────────────────────
function kasseGet(guildId) {
  const dok = db.get('guilds', guildId) || {};
  return dok.kasse || 0;
}

function kasseAdd(guildId, betrag, grund, quelle = 'System') {
  const dok = db.get('guilds', guildId) || { id: guildId };
  dok.kasse = Math.max(0, (dok.kasse || 0) + betrag);
  db.set('guilds', guildId, dok);
  if (betrag > 0 && quelle === 'Steuersystem') { // STAAT-UMLEITUNG
    try {
      const staat = require('./staat');
      const s2 = config.getGuildSettings(guildId);
      const anteil = (s2.staat && s2.staat.anteil != null) ? s2.staat.anteil : 50;
      const teil = Math.floor(betrag * Math.min(100, anteil) / 100);
      if (teil > 0) {
        dok.kasse = Math.max(0, dok.kasse - teil);
        db.set('guilds', guildId, dok);
        staat.einzahlen(guildId, teil, 'Steuern-Umlage');
      }
    } catch (_) {}
  }
  db.push('treasury_log', {
    guildId, betrag: Math.round(betrag), grund: String(grund).slice(0, 200),
    quelle, zeit: Date.now(),
  });
    return dok.kasse;
}

function kasseRemove(guildId, betrag, grund, quelle = 'System') {
  const stand = kasseGet(guildId);
  if (stand < betrag) return null; // nicht genug in der Kasse
  return kasseAdd(guildId, -betrag, grund, quelle);
}

// ── Transaktions-Historie (Statistik) ───────────────────────────
function transaktion(guildId, userId, typ, betrag, info = '') {
  db.push('transactions', {
    guildId, userId, typ, betrag: Math.round(betrag),
    info: String(info).slice(0, 200), zeit: Date.now(),
  });
}

// ── Shop ────────────────────────────────────────────────────────
const SHOP = [
  { id: 'xp_booster',     name: 'XP-Booster',    preis: 500,  beschreibung: '2× XP für 1 Stunde (persönlich)' },
  { id: 'farbrolle',      name: 'Farbrolle',     preis: 1200, beschreibung: 'Exklusive Farbrocke beim Verwenden' },
  { id: 'sonderrolle',    name: 'Sonderrolle',   preis: 2500, beschreibung: 'Exklusive ⭐ VIP-Rolle' },
  { id: 'gluecksbringer', name: 'Glücksbringer', preis: 800,  beschreibung: '+15 % Gewinnchance bei /gamble (dauerhaft)' },
];
const FARBEN = [0xE74C3C, 0x3498DB, 0x2ECC71, 0x9B59B6, 0xF1C40F, 0xE91E63, 0x00BCD4, 0xFF9800];

function findeItem(id) { return SHOP.find((i) => i.id === id) || null; }

function hatItem(eco, itemId) { return (eco.items || []).includes(itemId); }
function addItem(eco, itemId) { eco.items = eco.items || []; eco.items.push(itemId); saveEco(eco); }
function removeItem(eco, itemId) {
  const idx = (eco.items || []).indexOf(itemId);
  if (idx === -1) return false;
  eco.items.splice(idx, 1);
  saveEco(eco);
  return true;
}

// ── Schuldner-Rolle ─────────────────────────────────────────────
async function ensureDebtRole(guild, eco) {
  const s = config.getGuildSettings(guild.id);
  const sollRolle = (eco.schulden || 0) > 500; // ab 500 Schulden -> Rolle
  const name = s.economy.debtRoleName || 'Schuldner';
  let rolle = guild.roles.cache.find((r) => r.name === name);
  if (sollRolle && !rolle) {
    rolle = await guild.roles.create({ name, color: 0x95A5A6, reason: 'Schulden-System' }).catch(() => null);
  }
  if (!rolle) return;
  const member = await guild.members.fetch(eco.userId).catch(() => null);
  if (!member) return;
  const hat = member.roles.cache.has(rolle.id);
  if (sollRolle && !hat) await member.roles.add(rolle, 'Schulden über Schwellenwert').catch(() => {});
  if (!sollRolle && hat) await member.roles.remove(rolle, 'Schulden getilgt').catch(() => {});
}

// ── Auswertungen ────────────────────────────────────────────────
function leaderboard(guildId, art = 'geld', limit = 10) {
  const alle = db.values('economy').filter((e) => e.guildId === guildId);
  if (art === 'level') {
    const levels = db.values('levels').filter((l) => l.guildId === guildId);
    return levels.sort((a, b) => b.xp - a.xp).slice(0, limit);
  }
  return alle.sort((a, b) => vermoegen(b) - vermoegen(a)).slice(0, limit);
}

// Geldmenge im Umlauf (fürs Dashboard & /give-Statistik)
function geldmenge(guildId) {
  return db.values('economy')
    .filter((e) => e.guildId === guildId)
    .reduce((sum, e) => sum + vermoegen(e), 0);
}

function hatGluecksbringer(eco) { return hatItem(eco, 'gluecksbringer'); }

// Individueller Admin-Boost ('xpMulti' | 'geldMulti') - 1 wenn inaktiv/abgelaufen
function adminBoost(eco, feld) {
  const b = eco && eco.adminBoosts;
  if (!b) return 1;
  const v = Number(b[feld]) || 1;
  if (v <= 1) return 1;
  if (b.bis && b.bis <= Date.now()) return 1;
  return v;
}

module.exports = {
  getEco, saveEco, vermoegen,
  kasseGet, kasseAdd, kasseRemove,
  transaktion, SHOP, FARBEN, findeItem,
  hatItem, addItem, removeItem,
  ensureDebtRole, leaderboard, geldmenge, hatGluecksbringer, adminBoost,
};
