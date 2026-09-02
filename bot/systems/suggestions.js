// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS: Vorschläge mit Voting-Buttons und Status-Update
// durch Staff (genehmigt / abgelehnt).
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');

async function vorschlag(interaction, text) {
  const s = config.getGuildSettings(interaction.guild.id);
  if (!s.suggestions.channel) {
    return interaction.reply({ content: '❌ Es ist kein Vorschlags-Kanal konfiguriert (Dashboard → Einstellungen).', ephemeral: true });
  }
  const kanal = interaction.guild.channels.cache.get(s.suggestions.channel);
  if (!kanal || !kanal.isTextBased()) {
    return interaction.reply({ content: '❌ Der konfigurierte Vorschlags-Kanal existiert nicht mehr.', ephemeral: true });
  }
  const e = new EmbedBuilder()
    .setTitle('💡 Neuer Vorschlag')
    .setColor(0x3498DB)
    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
    .setDescription(text.slice(0, 1000))
    .addFields(
      { name: 'Status', value: '🟡 Offen', inline: true },
      { name: 'Stimmen', value: '👍 0  ·  👎 0', inline: true },
    )
    .setTimestamp();
  const zeile = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sugg_up').setLabel('Dafür').setStyle(ButtonStyle.Success).setEmoji('👍'),
    new ButtonBuilder().setCustomId('sugg_down').setLabel('Dagegen').setStyle(ButtonStyle.Danger).setEmoji('👎'),
    new ButtonBuilder().setCustomId('sugg_ok').setLabel('Genehmigen').setStyle(ButtonStyle.Secondary).setEmoji('✅'),
    new ButtonBuilder().setCustomId('sugg_no').setLabel('Ablehnen').setStyle(ButtonStyle.Secondary).setEmoji('❌'),
  );
  const msg = await kanal.send({ embeds: [e], components: [zeile] });
  db.push('suggestions', {
    guildId: interaction.guild.id,
    messageId: msg.id,
    authorId: interaction.user.id,
    text: text.slice(0, 1000),
    up: 0, down: 0,
    status: 'offen',
    stimmen: {}, // userId -> 'up' | 'down' (je 1 Stimme)
  });
  await interaction.reply({ content: '✅ Vorschlag eingereicht!', ephemeral: true });
}

async function handleComponent(interaction) {
  const eintrag = db.values('suggestions').find((s) => s.messageId === interaction.message.id);
  if (!eintrag) return interaction.reply({ content: '❌ Vorschlag nicht gefunden.', ephemeral: true });

  const id = interaction.customId;

  // Staff-Status-Änderung
  if (id === 'sugg_ok' || id === 'sugg_no') {
    const istStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
    if (!istStaff) return interaction.reply({ content: '⛔ Nur das Team kann den Status ändern.', ephemeral: true });
    eintrag.status = id === 'sugg_ok' ? 'genehmigt' : 'abgelehnt';
    db.set('suggestions', eintrag.id, eintrag);
    return update(interaction, eintrag, `Status durch <@${interaction.user.id}> geändert.`);
  }

  // Voting (1 Stimme pro User, wechselbar)
  eintrag.stimmen = eintrag.stimmen || {};
  if (eintrag.stimmen[interaction.user.id] === (id === 'sugg_up' ? 'up' : 'down')) {
    return interaction.reply({ content: 'ℹ️ Du hast so schon abgestimmt.', ephemeral: true });
  }
  if (id === 'sugg_up') { eintrag.up++; if (eintrag.stimmen[interaction.user.id] === 'down') eintrag.down--; }
  else { eintrag.down++; if (eintrag.stimmen[interaction.user.id] === 'up') eintrag.up--; }
  eintrag.stimmen[interaction.user.id] = id === 'sugg_up' ? 'up' : 'down';
  db.set('suggestions', eintrag.id, eintrag);
  await update(interaction, eintrag);
}

async function update(interaction, eintrag, zusatz) {
  const statusConfig = {
    offen:     { text: '🟡 Offen', farbe: 0x3498DB },
    genehmigt: { text: '🟢 Genehmigt', farbe: 0x2ECC71 },
    abgelehnt: { text: '🔴 Abgelehnt', farbe: 0xE74C3C },
  }[eintrag.status] || { text: '🟡 Offen', farbe: 0x3498DB };

  const e = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(statusConfig.farbe)
    .setFields(
      { name: 'Status', value: statusConfig.text, inline: true },
      { name: 'Stimmen', value: `👍 ${eintrag.up}  ·  👎 ${eintrag.down}`, inline: true },
    );
  if (zusatz) e.setFooter({ text: zusatz });
  await interaction.update({ embeds: [e] }).catch(() => {});
}

module.exports = { vorschlag, handleComponent };
