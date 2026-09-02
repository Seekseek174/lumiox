// ═══════════════════════════════════════════════════════════════
// GIVEAWAYS: Start mit Button-Teilnahme, automatische Ziehung
// (vom Scheduler geprüft), Reroll, Liste.
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');

async function start(interaction, dauerMs, gewinnerAnzahl, preis) {
  const ende = Date.now() + dauerMs;
  const e = new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY!')
    .setColor(0xE91E63)
    .setDescription(
      `**Preis:** ${preis}\n` +
      `**Gewinner:** ${gewinnerAnzahl}\n` +
      `**Ende:** <t:${Math.floor(ende / 1000)}:R>\n\n` +
      `Klicke unten auf **Teilnehmen**, um mitzumachen!`
    )
    .setTimestamp(ende);
  const button = new ButtonBuilder().setCustomId('giveaway_join').setLabel('Teilnehmen').setEmoji('🎁').setStyle(ButtonStyle.Success);
  const msg = await interaction.channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(button)] });

  db.push('giveaways', {
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    messageId: msg.id,
    preis: String(preis).slice(0, 200),
    gewinnerAnzahl: Math.max(1, gewinnerAnzahl),
    ende,
    teilnehmer: [],
    gewinner: [],
    status: 'laufend',
    erstelltVon: interaction.user.id,
  });
  await interaction.reply({ content: '✅ Giveaway gestartet!', ephemeral: true });
}

async function handleComponent(interaction) {
  const gw = db.values('giveaways').find(
    (g) => g.guildId === interaction.guild.id &&
           g.channelId === interaction.channel.id &&
           g.messageId === interaction.message.id);
  if (!gw) return interaction.reply({ content: '❌ Dieses Giveaway ist nicht mehr aktiv.', ephemeral: true });

  if (gw.status !== 'laufend') {
    return interaction.reply({ content: '⏰ Dieses Giveaway ist bereits beendet.', ephemeral: true });
  }
  gw.teilnehmer = gw.teilnehmer || [];
  const idx = gw.teilnehmer.indexOf(interaction.user.id);
  if (idx === -1) {
    gw.teilnehmer.push(interaction.user.id);
    db.set('giveaways', gw.id, gw);
    return interaction.reply({ content: `🎁 Du bist dabei! Aktuell: **${gw.teilnehmer.length}** Teilnehmer.`, ephemeral: true });
  }
  gw.teilnehmer.splice(idx, 1);
  db.set('giveaways', gw.id, gw);
  return interaction.reply({ content: '👋 Du hast deine Teilnahme zurückgezogen.', ephemeral: true });
}

function zieheGewinner(teilnehmer, anzahl) {
  const pool = [...(teilnehmer || [])];
  const gewinner = [];
  while (gewinner.length < anzahl && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    gewinner.push(pool.splice(i, 1)[0]);
  }
  return gewinner;
}

// Wird periodisch vom Scheduler aufgerufen
async function pruefeBeendet(client) {
  const jetzt = Date.now();
  for (const gw of db.values('giveaways')) {
    if (gw.status !== 'laufend' || gw.ende > jetzt) continue;
    gw.status = 'beendet';
    gw.gewinner = zieheGewinner(gw.teilnehmer, gw.gewinnerAnzahl);
    db.set('giveaways', gw.id, gw);

    try {
      const guild = await client.guilds.fetch(gw.guildId).catch(() => null);
      if (!guild) continue;
      const kanal = await guild.channels.fetch(gw.channelId).catch(() => null);
      if (!kanal) continue;
      const msg = await kanal.messages.fetch(gw.messageId).catch(() => null);
      if (msg) {
        const e = EmbedBuilder.from(msg.embeds[0])
          .setColor(0x95A5A6)
          .setDescription(`**Preis:** ${gw.preis}\n**Beendet!** Teilnehmer: ${gw.teilnehmer.length}`);
        await msg.edit({ embeds: [e], components: [] }).catch(() => {});
      }
      if (gw.gewinner.length) {
        const s = config.getGuildSettings(gw.guildId);
        const ping = s.giveaways.pingRole ? `<@&${s.giveaways.pingRole}> ` : '';
        await kanal.send({
          content: `${ping}🎉 **GIVEAWAY BEENDET!**\nPreis: **${gw.preis}**\nGewinner: ${gw.gewinner.map((g) => `<@${g}>`).join(', ')}\n\nGlückwunsch! 🎊`,
          allowedMentions: { users: gw.gewinner, roles: s.giveaways.pingRole ? [s.giveaways.pingRole] : [] },
        }).catch(() => {});
      } else {
        await kanal.send('😔 Das Giveaway wurde beendet – leider hatten wir keine Teilnehmer.').catch(() => {});
      }
    } catch (_) { /* Giveaway-Ziehung darf nie den Scheduler blockieren */ }
  }
}

async function reroll(interaction, messageId) {
  const kandidaten = db.values('giveaways')
    .filter((g) => g.guildId === interaction.guild.id && g.status === 'beendet')
    .sort((a, b) => b.ende - a.ende);
  const gw = messageId
    ? kandidaten.find((g) => g.messageId === messageId)
    : kandidaten[0];
  if (!gw) return interaction.reply({ content: '❌ Kein beendetes Giveaway gefunden.', ephemeral: true });

  const alteGewinner = gw.gewinner || [];
  const pool = (gw.teilnehmer || []).filter((t) => !alteGewinner.includes(t));
  if (!pool.length) return interaction.reply({ content: '❌ Keine weiteren Teilnehmer für einen Reroll.', ephemeral: true });

  const neu = pool[Math.floor(Math.random() * pool.length)];
  gw.gewinner.push(neu);
  db.set('giveaways', gw.id, gw);
  await interaction.reply({ content: `🎉 **Neuer Gewinner:** <@${neu}> (Preis: ${gw.preis})` });
}

async function liste(interaction) {
  const alle = db.values('giveaways')
    .filter((g) => g.guildId === interaction.guild.id)
    .sort((a, b) => b.ende - a.ende)
    .slice(0, 10);
  if (!alle.length) return interaction.reply({ content: '📭 Noch keine Giveaways auf diesem Server.', ephemeral: true });
  const e = new EmbedBuilder()
    .setTitle('🎁 Giveaways (letzte 10)')
    .setColor(0xE91E63)
    .setDescription(alle.map((g) =>
      `${g.status === 'laufend' ? '🟢' : '⚪'} **${g.preis}** – ${g.teilnehmer.length} Teilnehmer – ` +
      (g.status === 'laufend' ? `endet <t:${Math.floor(g.ende / 1000)}:R>` : `beendet, Gewinner: ${g.gewinner.map((x) => `<@${x}>`).join(', ') || '—'}`)
    ).join('\n'));
  await interaction.reply({ embeds: [e], ephemeral: true });
}

module.exports = { start, handleComponent, pruefeBeendet, reroll, liste };
