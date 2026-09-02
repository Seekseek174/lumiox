'use strict';
const { EmbedBuilder } = require('discord.js');
const db = require('../../core/db');
const logger = require('../../core/logger');
async function pruefe(client) {
  const jetzt = Date.now();
  for (const u of db.values('umfragen')) {
    if (u.ausgewertet || u.ende > jetzt) continue;
    u.ausgewertet = true;
    db.set('umfragen', u.id, u);
    try {
      const kanal = await client.channels.fetch(u.channelId).catch(() => null);
      if (!kanal) continue;
      const msg = await kanal.messages.fetch(u.messageId).catch(() => null);
      const rows = u.fragen.map((frage, i) => {
        const counts = u.optionen.map(() => 0);
        for (const st of Object.values(u.stimmen || {})) if (st[i] != null) counts[st[i]]++;
        const max = Math.max(...counts, 0);
        const gewinner = max > 0 ? u.optionen[counts.indexOf(max)] : '—';
        return `**${i + 1}. ${frage}**\n` + u.optionen.map((o, j) => `${counts[j] === max && max > 0 ? '🏆' : '▫️'} ${o}: ${counts[j]}`).join('\n') + `\n➡ **${gewinner}**`;
      }).join('\n\n');
      const e = new EmbedBuilder().setTitle('📊 Umfrage-Auswertung').setColor(0x2ECC71).setDescription(rows).setFooter({ text: Object.keys(u.stimmen || {}).length + ' Teilnehmer' });
      if (msg) await msg.reply({ embeds: [e] }).catch(() => {});
      else await kanal.send({ embeds: [e] }).catch(() => {});
    } catch (err) { logger.warn('Umfrage: ' + err.message); }
  }
}
module.exports = { pruefe };
