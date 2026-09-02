// ═══════════════════════════════════════════════════════════════
// TICKETS: Panel mit Dropdown (Kategorien aus dem Dashboard),
// private Kanäle, Close/Add/Remove, HTML-Transkript das im
// Dashboard einsehbar ist (Collection "transcripts").
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const buildTranscriptHTML = require('../../dashboard/transcript');

// ── Panel ───────────────────────────────────────────────────────
async function panel(interaction) {
  const s = config.getGuildSettings(interaction.guild.id);
  const kategorien = s.tickets.categories || [];
  if (!kategorien.length) {
    return interaction.reply({ content: '❌ Es sind keine Ticket-Kategorien konfiguriert (Dashboard → Tickets).', ephemeral: true });
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open')
    .setPlaceholder('🎫 Wähle eine Kategorie …')
    .addOptions(kategorien.slice(0, 25).map((k, i) => ({
      label: k.name.slice(0, 100),
      emoji: k.emoji || '🎫',
      value: String(i),
    })));
  const e = new EmbedBuilder()
    .setTitle('🎫 Support-Tickets')
    .setColor(0x5865F2)
    .setDescription('Wähle unten eine Kategorie aus, um ein privates Ticket zu öffnen.\nEin Team-Mitglied wird sich bald bei dir melden.');
  await interaction.channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(menu)] });
  await interaction.reply({ content: '✅ Ticket-Panel gepostet.', ephemeral: true });
}

function getTicketByChannel(guildId, channelId) {
  return db.values('tickets').find((t) => t.guildId === guildId && t.channelId === channelId && t.status === 'offen') || null;
}

// ── Ticket öffnen (Dropdown) ────────────────────────────────────
async function oeffne(interaction) {
  const s = config.getGuildSettings(interaction.guild.id);
  const index = parseInt(interaction.values[0], 10) || 0;
  const kategorie = (s.tickets.categories || [])[index] || { name: 'Support' };

  // Nur ein offenes Ticket pro User
  const existierend = db.values('tickets').find(
    (t) => t.guildId === interaction.guild.id && t.userId === interaction.user.id && t.status === 'offen');
  if (existierend) {
    return interaction.reply({ content: `⚠️ Du hast bereits ein offenes Ticket: <#${existierend.channelId}>`, ephemeral: true });
  }

  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  if (s.tickets.staffRole) {
    overwrites.push({
      id: s.tickets.staffRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    });
  }
  const kanal = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.slice(0, 100),
    type: 0,
    parent: s.tickets.category || null,
    permissionOverwrites: overwrites,
    reason: `Ticket (${kategorie.name}) von ${interaction.user.tag}`,
  }).catch(() => null);
  if (!kanal) {
    return interaction.reply({ content: '❌ Ich konnte den Ticket-Kanal nicht erstellen (Rechte prüfen).', ephemeral: true });
  }

  db.push('tickets', {
    guildId: interaction.guild.id, channelId: kanal.id, userId: interaction.user.id,
    kategorie: kategorie.name, status: 'offen', erstelltAm: Date.now(),
  });

  const e = new EmbedBuilder()
    .setTitle(`🎫 Ticket · ${kategorie.name}`)
    .setColor(0x2ECC71)
    .setDescription(`Hallo ${interaction.user}!\nBeschreibe dein Anliegen so genau wie möglich.\nEin Team-Mitglied meldet sich gleich.`)
    .setTimestamp();
  const button = new ButtonBuilder().setCustomId('ticket_close').setLabel('Ticket schließen').setEmoji('🔒').setStyle(ButtonStyle.Danger);
  await kanal.send({ content: `${interaction.user}`, embeds: [e], components: [new ActionRowBuilder().addComponents(button)] });
  await interaction.reply({ content: `✅ Dein Ticket ist offen: <#${kanal.id}>`, ephemeral: true });
}

// ── Schließen (mit Transkript) ──────────────────────────────────
async function schliesse(interaction) {
  const ticket = getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Hier ist kein offenes Ticket.', ephemeral: true });

  const s = config.getGuildSettings(interaction.guild.id);
  const istStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                   (s.tickets.staffRole && interaction.member.roles.cache.has(s.tickets.staffRole));
  if (ticket.userId !== interaction.user.id && !istStaff) {
    return interaction.reply({ content: '⛔ Nur der Ticket-Ersteller oder das Team kann schließen.', ephemeral: true });
  }

  await interaction.deferReply();
  ticket.status = 'geschlossen';
  ticket.geschlossenAm = Date.now();
  ticket.geschlossenVon = interaction.user.id;
  db.set('tickets', ticket.id, ticket);

  // Transkript erzeugen & speichern (im Dashboard einsehbar)
  try {
    const nachrichten = [];
    let letzteId = null;
    for (let runde = 0; runde < 5; runde++) { // bis 500 Nachrichten
      const batch = await interaction.channel.messages.fetch({ limit: 100, before: letzteId });
      if (!batch.size) break;
      nachrichten.push(...batch.values());
      letzteId = batch.last().id;
      if (batch.size < 100 || nachrichten.length >= 500) break;
    }
    const html = buildTranscriptHTML(nachrichten, {
      gilde: interaction.guild.name,
      kanal: interaction.channel.name,
      user: ticket.userId,
      kategorie: ticket.kategorie,
    });
    const tId = db.push('transcripts', {
      guildId: interaction.guild.id,
      ticketId: ticket.id,
      kanalName: interaction.channel.name,
      userId: ticket.userId,
      kategorie: ticket.kategorie,
      html,
      zeit: Date.now(),
      nachrichten: nachrichten.length,
    });
    const tCh = s.tickets.transcriptChannel
      ? interaction.guild.channels.cache.get(s.tickets.transcriptChannel) : null;
    if (tCh && tCh.isTextBased()) {
      await tCh.send({
        embeds: [new EmbedBuilder()
          .setTitle('📄 Ticket-Transkript erstellt')
          .setColor(0x3498DB)
          .addFields(
            { name: 'Kanal', value: `#${interaction.channel.name}`, inline: true },
            { name: 'Kategorie', value: ticket.kategorie, inline: true },
            { name: 'Nachrichten', value: String(nachrichten.length), inline: true },
            { name: 'Transkript-ID', value: `\`${tId}\`` },
          )
          .setDescription('Im Dashboard unter **Tickets → Transkripte** einsehbar.')],
      }).catch(() => {});
    }
  } catch (_) { /* Transkript darf das Schließen nie blockieren */ }

  await interaction.editReply('🔒 Ticket wird in 5 Sekunden geschlossen …');
  setTimeout(() => interaction.channel.delete('Ticket geschlossen').catch(() => {}), 5000);
}

// ── Add / Remove ────────────────────────────────────────────────
async function addUser(interaction, user) {
  const ticket = getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Hier ist kein offenes Ticket.', ephemeral: true });
  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true, SendMessages: true,
  }).catch(() => {});
  await interaction.reply({ content: `➕ ${user} wurde zum Ticket hinzugefügt.` });
}

async function removeUser(interaction, user) {
  const ticket = getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Hier ist kein offenes Ticket.', ephemeral: true });
  if (user.id === ticket.userId) {
    return interaction.reply({ content: '⛔ Der Ticket-Ersteller kann nicht entfernt werden.', ephemeral: true });
  }
  await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
  await interaction.reply({ content: `➖ ${user} wurde aus dem Ticket entfernt.` });
}

// ── Transkript auf Abruf (/transcript) ──────────────────────────
async function transcript(interaction) {
  const ticket = getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Hier ist kein offenes Ticket.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  try {
    const nachrichten = await interaction.channel.messages.fetch({ limit: 100 });
    const html = buildTranscriptHTML([...nachrichten.values()], {
      gilde: interaction.guild.name, kanal: interaction.channel.name,
      user: ticket.userId, kategorie: ticket.kategorie,
    });
    const tId = db.push('transcripts', {
      guildId: interaction.guild.id, ticketId: ticket.id,
      kanalName: interaction.channel.name, userId: ticket.userId,
      kategorie: ticket.kategorie, html, zeit: Date.now(),
      nachrichten: nachrichten.size,
    });
    await interaction.editReply(`📄 Transkript erstellt (ID: \`${tId}\`) – im Dashboard unter **Tickets** einsehbar.`);
  } catch (e) {
    await interaction.editReply('❌ Transkript fehlgeschlagen: ' + e.message);
  }
}

// ── Button-Router ───────────────────────────────────────────────
async function handleComponent(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_open') return oeffne(interaction);
  if (interaction.isButton() && interaction.customId === 'ticket_close') return schliesse(interaction);
}

module.exports = { panel, handleComponent, schliesse, addUser, removeUser, transcript, getTicketByChannel };
