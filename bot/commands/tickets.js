// ═══════════════════════════════════════════════════════════════
// TICKETS – Commands 67 bis 71
// Die eigentliche Logik liegt im tickets-System (Panel, Dropdown,
// Transkripte im Dashboard). Hier nur die Slash-Commands.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errEmbed } = require('../../core/utils');
const tickets = require('../systems/tickets');

module.exports = [
  // ── 67) /ticket-panel ─────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ticket-panel')
      .setDescription('Postet das Ticket-Panel mit Dropdown (Kategorien aus dem Dashboard)')
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      await tickets.panel(interaction);
    },
  },

  // ── 68) /close ────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('close')
      .setDescription('Schließt das aktuelle Ticket (erstellt ein Transkript)')
      .setDMPermission(false),
    async execute(interaction) {
      await tickets.schliesse(interaction);
    },
  },

  // ── 69) /add ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('add')
      .setDescription('Fügt einen Benutzer zum aktuellen Ticket hinzu')
      .addUserOption(o => o.setName('user').setDescription('Wer soll hinzukommen?').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      await tickets.addUser(interaction, interaction.options.getUser('user', true));
    },
  },

  // ── 70) /remove ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Entfernt einen Benutzer aus dem aktuellen Ticket')
      .addUserOption(o => o.setName('user').setDescription('Wer soll raus?').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      await tickets.removeUser(interaction, interaction.options.getUser('user', true));
    },
  },

  // ── 71) /transcript ───────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('transcript')
      .setDescription('Erstellt jetzt ein HTML-Transkript (im Dashboard einsehbar)')
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      await tickets.transcript(interaction);
    },
  },
];
