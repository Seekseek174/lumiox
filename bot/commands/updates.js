'use strict';
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const extras = require('../systems/extras0_8_10');
module.exports = [{
  data: new SlashCommandBuilder().setName('updates').setDescription('📋 Die letzten Lumiox-Updates'),
  async execute(interaction) {
    const embeds = extras.updateTexte().map((v, idx) => new EmbedBuilder()
      .setTitle((idx === 0 ? '🆕 ' : '📦 ') + 'Lumiox ' + v.v)
      .setColor(idx === 0 ? 0x34d399 : 0x5865F2)
      .setDescription(v.punkte.map((p) => '▸ ' + p).join('\n'))
      .setFooter({ text: idx === 0 ? 'Aktuelle Version!' : 'Ältere Version' }));
    await interaction.reply({ embeds });
  },
}];
