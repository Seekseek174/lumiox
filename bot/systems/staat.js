// ═══════════════════════════════════════════════════════════════
// STAAT & FINANZAMT: Staatskasse zahlt System-Ausgaben, bekommt
// Steuer-Umlage. Wache-Kasse steuert die Fangquote der Polizei.
// ═══════════════════════════════════════════════════════════════
'use strict';
const db = require('../../core/db');
const config = require('../../core/config');

function doc(gid) {
  let d = db.get('staat', gid);
  if (!d) { d = { id: gid, guildId: gid, kasse: 0, wacheKasse: 0, letzteWarnung: 0, lastGehalt: '' }; db.set('staat', gid, d); }
  if (typeof d.kasse !== 'number') d.kasse = 0;
  if (typeof d.wacheKasse !== 'number') d.wacheKasse = 0;
  return d;
}
function kasse(gid) { return doc(gid).kasse; }
function einzahlen(gid, betrag, grund) {
  const d = doc(gid);
  d.kasse += Math.round(betrag);
  db.set('staat', gid, d);
  return d.kasse;
}
// Staat zahlt eine Ausgabe (Buchhaltung – kann ins Minus = Staatsdefizit)
function zahlen(gid, betrag, zweck) {
  const d = doc(gid);
  betrag = Math.round(betrag);
  if (betrag <= 0) return 0;
  d.kasse -= betrag;
  db.set('staat', gid, d);
  if (d.kasse < 0 && Date.now() - (d.letzteWarnung || 0) > 3600000) {
    d.letzteWarnung = Date.now();
    db.set('staat', gid, d);
    warnung(gid, zweck, Math.abs(d.kasse)).catch(() => {});
  }
  return betrag;
}
async function warnung(gid, zweck, defizit) {
  const { EmbedBuilder } = require('discord.js');
  const client = require('../../bot/client').getClient();
  const g = client ? client.guilds.cache.get(gid) : null;
  if (!g) return;
  const s = config.getGuildSettings(gid);
  const chId = s.economy.announcementChannel || s.moderation.modLogChannel;
  const ch = chId ? g.channels.cache.get(chId) : null;
  if (ch && ch.isTextBased()) {
    const e = new EmbedBuilder()
      .setTitle('🚨 STAATSKASSE ÜBERZOGEN!')
      .setColor(0xE74C3C)
      .setDescription(`Zweck: **${zweck}** · Defizit: **${defizit.toLocaleString('de-DE')}**\nSteuern auffüllen, sonst drohen Ausgaben-Kürzungen!`);
    await ch.send({ embeds: [e] }).catch(() => {});
  }
}
// Anteil aller Steuereinnahmen an den Staat umleiten
function umleitung(gid, steuerBetrag) {
  const s = config.getGuildSettings(gid);
  const anteil = (s.staat && s.staat.anteil != null) ? s.staat.anteil : 50;
  if (anteil <= 0 || steuerBetrag <= 0) return 0;
  const teil = Math.floor(steuerBetrag * Math.min(100, anteil) / 100);
  if (teil <= 0) return 0;
  const economy = require('./economy');
  const rest = economy.kasseRemove(gid, teil, 'Umlage an Staatskasse', 'Staat');
  if (rest === null) return 0;
  einzahlen(gid, teil, 'Steuern-Umlage');
  return teil;
}
// Fangquote: Basis 25 % + bis zu 50 % durch Wachen-Förderung (10k = max)
function fangChance(gid) {
  const d = doc(gid);
  return 25 + Math.min(50, Math.floor((d.wacheKasse / 10000) * 50));
}
module.exports = { doc, kasse, einzahlen, zahlen, umleitung, fangChance };
