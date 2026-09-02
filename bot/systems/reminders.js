// ═══════════════════════════════════════════════════════════════
// REMINDER: Überleben Neustarts, weil sie in der DB liegen
// (Collection "reminders"). Der Scheduler prüft alle 30 Sekunden.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('../../core/db');

function erstellen(guildId, userId, channelId, text, faelligAm) {
  return db.push('reminders', {
    guildId, userId, channelId,
    text: String(text).slice(0, 500),
    faelligAm, erstelltAm: Date.now(),
  });
}

function liste(guildId, userId) {
  return db.values('reminders')
    .filter((r) => r.guildId === guildId && r.userId === userId)
    .sort((a, b) => a.faelligAm - b.faelligAm);
}

async function pruefe(client) {
  const jetzt = Date.now();
  for (const r of db.values('reminders')) {
    if (r.faelligAm > jetzt) continue;
    db.del('reminders', r.id); // zuerst löschen -> keine Dopplung bei Fehlern
    try {
      const user = await client.users.fetch(r.userId).catch(() => null);
      if (!user) continue;
      const e = new EmbedBuilder()
        .setTitle('⏰ Erinnerung!')
        .setColor(0xF1C40F)
        .setDescription(r.text)
        .addFields({ name: 'Erstellt', value: `<t:${Math.floor(r.erstelltAm / 1000)}:R>` })
        .setTimestamp();
      // Bevorzugt im Ursprungs-Kanal antworten, sonst DM
      const kanal = r.channelId
        ? await client.channels.fetch(r.channelId).catch(() => null)
        : null;
      if (kanal && kanal.isTextBased()) {
        await kanal.send({ content: `⏰ <@${r.userId}> Erinnerung:`, embeds: [e] }).catch(() => {});
      } else {
        await user.send({ embeds: [e] }).catch(() => {});
      }
    } catch (_) { /* verpasste Reminder werden still übersprungen */ }
  }
}

module.exports = { erstellen, liste, pruefe };
