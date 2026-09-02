// ═══════════════════════════════════════════════════════════════
// GIVEAWAYS – Commands 72 bis 74 (+ Teilnahme-Anforderungen ab 0.8.1)
// ═══════════════════════════════════════════════════════════════
'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errEmbed, parseDuration } = require('../../core/utils');
const giveaways = require('../systems/giveaways');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Giveaways verwalten')
      .addSubcommand(sc => sc.setName('start')
        .setDescription('Startet ein Giveaway in diesem Kanal')
        .addStringOption(o => o.setName('dauer').setDescription('z. B. 30 (Min.), 12h, 3d').setRequired(true))
        .addIntegerOption(o => o.setName('gewinner').setDescription('Anzahl Gewinner').setRequired(true).setMinValue(1).setMaxValue(10))
        .addStringOption(o => o.setName('preis').setDescription('Was wird verlost?').setRequired(true).setMaxLength(200))
        .addIntegerOption(o => o.setName('min_level').setDescription('Mindest-Level für Teilnahme (0 = aus)').setMinValue(0).setMaxValue(500))
        .addIntegerOption(o => o.setName('min_konto_alter').setDescription('Mindest-Kontoalter in Tagen (0 = aus)').setMinValue(0).setMaxValue(3650)))
      .addSubcommand(sc => sc.setName('reroll')
        .setDescription('Zieht einen neuen Gewinner für das letzte beendete Giveaway'))
      .addSubcommand(sc => sc.setName('list')
        .setDescription('Zeigt die letzten Giveaways'))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand(true);

      if (sub === 'start') {
        const dauerMs = parseDuration(interaction.options.getString('dauer', true));
        if (!dauerMs) return interaction.reply({ embeds: [errEmbed('Ungültige Dauer. Beispiele: `30`, `12h`, `3d`')], ephemeral: true });
        if (dauerMs < 60000) return interaction.reply({ embeds: [errEmbed('Mindestdauer: 1 Minute.')], ephemeral: true });
        const gewinner = interaction.options.getInteger('gewinner', true);
        const preis = interaction.options.getString('preis', true);
        const anforderungen = {
          minLevel: interaction.options.getInteger('min_level') || 0,
          minKontoAlterTage: interaction.options.getInteger('min_konto_alter') || 0,
        };
        await giveaways.start(interaction, dauerMs, gewinner, preis, anforderungen);
      } else if (sub === 'reroll') {
        await giveaways.reroll(interaction);
      } else {
        await giveaways.liste(interaction);
      }
    },
  },
];