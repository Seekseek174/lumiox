'use strict';
const { EmbedBuilder } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const logger = require('../../core/logger');
const economy = require('./economy');
let letzterSonntag = '';
function baueBericht(guild) {
  const g = db.get('guilds', guild.id) || {};
  const tage = g.tage || {};
  const jetzt = Date.now();
  const woche = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(jetzt - i * 86400000).toISOString().slice(0, 10);
    if (tage[d]) woche.push(tage[d]);
  }
  const nachrichten = woche.reduce((s, t) => s + (t.nachrichtenHeute || 0), 0);
  const joins = woche.reduce((s, t) => s + (t.joinsHeute || 0), 0);
  const kiTreffer = db.values('ai_detections').filter((d) => d.guildId === guild.id && d.treffer && jetzt - d.zeit <= 7 * 86400000).length;
  const steuern = db.values('treasury_log').filter((t) => t.guildId === guild.id && t.quelle === 'Steuersystem' && t.betrag > 0 && jetzt - t.zeit <= 7 * 86400000).reduce((s2, t) => s2 + t.betrag, 0);
  const topUser = db.values('levels').filter((l) => l.guildId === guild.id).sort((a, b) => b.xp - a.xp).slice(0, 5);
  const s = config.getGuildSettings(guild.id);
  const e = new EmbedBuilder().setTitle('📊 Wochenbericht').setColor(0x3498DB)
    .setDescription(`Statistik der letzten 7 Tage auf **${guild.name}**`)
    .addFields(
      { name: '💬 Nachrichten', value: nachrichten.toLocaleString('de-DE'), inline: true },
      { name: '📥 Joins', value: String(joins), inline: true },
      { name: '🧠 KI-Erkennungen', value: String(kiTreffer), inline: true },
      { name: '🏛️ Steuern', value: `${steuern.toLocaleString('de-DE')} ${s.economy.symbol}`, inline: true },
      { name: '💰 Serverkasse', value: `${economy.kasseGet(guild.id).toLocaleString('de-DE')} ${s.economy.symbol}`, inline: true });
  if (topUser.length) {
    e.addFields({ name: '🏆 Top 5 (XP)', value: topUser.map((u, i) => `${['🥇','🥈','🥉','4.','5.'][i]} <@${u.userId}> – Level ${u.level}`).join('\n') });
  }
  e.setFooter({ text: 'Lumiox Wochenbericht' });
  return e;
}
async function pruefe(client) {
  const jetzt = new Date();
  const schluessel = jetzt.toISOString().slice(0, 10);
  if (jetzt.getDay() !== 0) return;
  if (letzterSonntag === schluessel) return;
  if (jetzt.getHours() < 19) return;
  letzterSonntag = schluessel;
  for (const [, guild] of client.guilds.cache) {
    try {
      const s = config.getGuildSettings(guild.id);
      const kanalId = s.wochenbericht && s.wochenbericht.kanal;
      if (!kanalId) continue;
      const kanal = guild.channels.cache.get(kanalId);
      if (kanal && kanal.isTextBased()) { await kanal.send({ embeds: [baueBericht(guild)] }); logger.ok('Wochenbericht: ' + guild.name); }
    } catch (e) { logger.warn('Bericht: ' + e.message); }
  }
}
function init(client) { setInterval(() => pruefe(client).catch(() => {}), 30 * 60000); logger.ok('Wochenbericht aktiv'); }
module.exports = { init, baueBericht };
