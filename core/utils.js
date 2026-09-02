// ═══════════════════════════════════════════════════════════════
// Gemeinsame Helfer: Zeitspannen, Beträge, Embeds, Rechte-Checks,
// Statistik-Zähler. Werden von Commands UND Systemen genutzt.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('./db');

// ── Zeit ────────────────────────────────────────────────────────
// "90" = 90 Minuten, "2h" = 2 Stunden, "1d", "30s", "1w"
function parseDuration(eingabe) {
  if (!eingabe) return 0;
  const m = String(eingabe).trim().toLowerCase().match(/^(\d+)\s*(s|min|m|h|st|d|w)?$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 's':  return n * 1000;
    case 'h': case 'st': return n * 3600000;
    case 'd':  return n * 86400000;
    case 'w':  return n * 604800000;
    default:   return n * 60000; // ohne Einheit = Minuten
  }
}

function formatDuration(ms) {
  if (ms <= 0) return '0 Sek.';
  if (ms >= 604800000) return `${Math.floor(ms / 604800000)} Woche(n)`;
  if (ms >= 86400000) return `${Math.floor(ms / 86400000)} Tag(e)`;
  if (ms >= 3600000) return `${Math.floor(ms / 3600000)} Std.`;
  if (ms >= 60000) return `${Math.floor(ms / 60000)} Min.`;
  return `${Math.floor(ms / 1000)} Sek.`;
}

// ── Beträge ─────────────────────────────────────────────────────
// Zahl, "all"/"alles" oder "50%" – bezogen auf übergebenes Bargeld
function parseBetrag(eingabe, bargeld) {
  if (eingabe === null || eingabe === undefined) return null;
  const t = String(eingabe).trim().toLowerCase();
  if (t === 'all' || t === 'alles') return Math.floor(bargeld);
  const prozent = t.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
  if (prozent) return Math.floor(bargeld * (parseFloat(prozent[1].replace(',', '.')) / 100));
  const n = parseInt(t.replace(/[._]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function geldbetrag(betrag, econ) {
  const s = econ || { symbol: '🪙', currency: 'Münzen' };
  return `${s.symbol} **${Number(betrag || 0).toLocaleString('de-DE')}** ${s.currency}`;
}

// ── Embeds ──────────────────────────────────────────────────────
function okEmbed(text) {
  return new EmbedBuilder().setColor(0x2ECC71).setDescription('✅ ' + text);
}
function errEmbed(text) {
  return new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ ' + text);
}
function infoEmbed(text) {
  return new EmbedBuilder().setColor(0x3498DB).setDescription('ℹ️ ' + text);
}

function progressBar(anteil, laenge = 12) {
  const gefuellt = Math.max(0, Math.min(laenge, Math.round((anteil || 0) * laenge)));
  return '█'.repeat(gefuellt) + '░'.repeat(laenge - gefuellt);
}

// ── Moderations-Checks ──────────────────────────────────────────
// Liefert einen deutschen Fehlertext ODER null, wenn alles ok ist.
function moderierbar(interaction, targetMember) {
  if (!targetMember) return null; // User ist nicht mehr auf dem Server (z. B. Ban per ID)
  if (targetMember.id === interaction.user.id) return 'Du kannst das nicht auf dich selbst anwenden.';
  if (targetMember.id === interaction.client.user.id) return 'Ich kann das nicht auf mich selbst anwenden.';
  const bot = interaction.guild.members.me;
  if (targetMember.roles.highest.comparePositionTo(bot.roles.highest) >= 0) {
    return 'Dieser Benutzer hat eine gleich hohe oder höhere Rolle als ich.';
  }
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    if (targetMember.roles.highest.comparePositionTo(interaction.member.roles.highest) >= 0) {
      return 'Dieser Benutzer hat eine gleich hohe oder höhere Rolle wie du.';
    }
  }
  return null;
}

// ── Statistik ───────────────────────────────────────────────────
// Tageszähler in der Gilden-Datei (fürs Dashboard: "Nachrichten heute")
function bumpStat(guildId, feld, n = 1) {
  const heute = new Date().toISOString().slice(0, 10);
  const g = db.get('guilds', guildId) || { id: guildId, stats: {} };
  g.stats = g.stats || {};
  if (g.stats.tag !== heute) {
    g.stats.tag = heute;
    g.stats.nachrichtenHeute = 0;
  }
  g.stats[feld] = (g.stats[feld] || 0) + n;
  // Tageshistorie für die Analytics-Diagramme (max. 90 Tage behalten)
  g.tage = g.tage || {};
  const tag = g.tage[heute] || (g.tage[heute] = {});
  tag[feld] = (tag[feld] || 0) + n;
  const grenze = Date.now() - 90 * 86400000;
  for (const d of Object.keys(g.tage)) {
    if (new Date(d + 'T00:00:00Z').getTime() < grenze) delete g.tage[d];
  }
  db.set('guilds', guildId, g);
}
function getGuildDoc(guildId) {
  let g = db.get('guilds', guildId);
  if (!g) {
    g = { id: guildId, name: '', joinedAt: Date.now(), stats: {}, escalation: {} };
    db.set('guilds', guildId, g);
  }
  if (!g.stats) g.stats = {};
  if (!g.escalation) g.escalation = {};
  return g;
}

module.exports = {
  parseDuration, formatDuration, parseBetrag, geldbetrag,
  okEmbed, errEmbed, infoEmbed, progressBar, moderierbar,
  bumpStat, getGuildDoc,
};
