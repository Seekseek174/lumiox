// ═══════════════════════════════════════════════════════════════
// EXTRAS2 – Giveaway-Anforderungen · Mehrstufige Umfragen · Werber-Rangliste
// ═══════════════════════════════════════════════════════════════
'use strict';
const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('../systems/economy');
const inviteTracking = require('../systems/inviteTracking');
const { okEmbed, errEmbed, geldbetrag } = require('../../core/utils');

module.exports = [
  { data: new SlashCommandBuilder().setName('rankcard').setDescription('🏅 Deine Rank-Karte als Bild'),
    async execute(interaction) {
      await interaction.deferReply();
      const rankKarte = require('../systems/rankKarte');
      const svg = rankKarte.baueSVG(interaction.member, require('../../core/config').getGuildSettings(interaction.guild.id));
      const buf = Buffer.from(svg);
      await interaction.editReply({ files: [{ attachment: buf, name: 'rank-' + interaction.user.username + '.svg' }] });
    } },
  // ── Giveaway mit Anforderungen: /gshow ───────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('gshow')
      .setDescription('Zeigt laufende Giveaways + ob du die Anforderungen erfüllst')
      .setDMPermission(false),
    async execute(interaction) {
      const gw = db.values('giveaways')
        .filter((g) => g.guildId === interaction.guild.id && g.status === 'laufend');
      if (!gw.length) return interaction.reply({ embeds: [errEmbed('Keine laufenden Giveaways.')] });
      const zeilen = gw.map((g) => {
        const dabei = (g.teilnehmer || []).includes(interaction.user.id);
        const anf = g.anforderungen;
        let status = dabei ? '✅ dabei' : '🎁 teilnehmen per Button';
        if (anf && anf.minLevel) {
          const lvl = (db.get('levels', `${interaction.guild.id}_${interaction.user.id}`) || {}).level || 0;
          if (lvl < anf.minLevel) status = `❌ Level ${anf.minLevel} nötig (du: ${lvl})`;
        }
        if (anf && anf.minKontoAlterTage) {
          const alter = Math.floor((Date.now() - interaction.user.createdTimestamp) / 86400000);
          if (alter < anf.minKontoAlterTage) status = `❌ Discord-Konto min. ${anf.minKontoAlterTage} Tage (deins: ${alter})`;
        }
        return `🎁 **${g.preis}** – endet <t:${Math.floor(g.ende / 1000)}:R>\n↳ ${status}`;
      });
      await interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle('🎁 Laufende Giveaways')
        .setColor(0xE91E63).setDescription(zeilen.join('\n\n'))] });
    },
  },

  // ── Mehrstufige Umfrage: /umfrage ────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('umfrage')
      .setDescription('Mehrstufige Umfrage mit Zeitlimit und Auto-Auswertung (Mod)')
      .addStringOption(o => o.setName('fragen').setDescription('Fragen mit | trennen: Frage1 | Frage2').setRequired(true))
      .addStringOption(o => o.setName('optionen').setDescription('Optionen mit Komma (gleiche für alle Fragen)').setRequired(true))
      .addIntegerOption(o => o.setName('minuten').setDescription('Dauer in Minuten').setMinValue(1).setMaxValue(1440).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .setDMPermission(false),
    async execute(interaction) {
      const fragen = interaction.options.getString('fragen', true).split('|').map((x) => x.trim()).filter(Boolean).slice(0, 5);
      const optionen = interaction.options.getString('optionen', true).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
      const minuten = interaction.options.getInteger('minuten', true);
      if (fragen.length < 1 || optionen.length < 2) {
        return interaction.reply({ embeds: [errEmbed('Mindestens 1 Frage und 2 Optionen.')], ephemeral: true });
      }
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const id = db.newId('umf_');
      const umfrage = {
        id, guildId: interaction.guild.id, fragen, optionen,
        ende: Date.now() + minuten * 60000,
        stimmen: {}, // userId -> { frageIndex: optionIndex }
      };
      db.set('umfragen', id, umfrage);

      const e = new EmbedBuilder()
        .setTitle('📊 Umfrage (' + fragen.length + ' Frage/n · ' + minuten + ' Min.)')
        .setColor(0x3498DB)
        .setDescription(fragen.map((f, i) => `**${i + 1}. ${f}**\n` + optionen.map((o, j) => `${emojis[j]} ${o}`).join('\n')).join('\n\n'))
        .setFooter({ text: 'Stimme per Reaktion ab · Auswertung erfolgt automatisch' });
      const msg = await interaction.channel.send({ embeds: [e] });
      umfrage.messageId = msg.id;
      umfrage.channelId = interaction.channel.id;
      db.set('umfragen', id, umfrage);
      for (let j = 0; j < optionen.length; j++) await msg.react(emojis[j]).catch(() => {});
      await interaction.reply({ embeds: [okEmbed('Umfrage gestartet! Auswertung in ' + minuten + ' Minuten.')] });
    },
  },

  // ── Werber-Rangliste: /werber ────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('werber')
      .setDescription('🏆 Wer hat die meisten Mitglieder geworben?')
      .setDMPermission(false),
    async execute(interaction) {
      const liste = inviteTracking.rangliste(interaction.guild.id, 10);
      if (!liste.length) {
        return interaction.reply({ embeds: [errEmbed('Noch keine geworbenen Mitglieder. Lade Freunde ein – Invites werden ab jetzt gezählt!')] });
      }
      const zeilen = [];
      for (let i = 0; i < liste.length; i++) {
        const u = await interaction.client.users.fetch(liste[i].userId).catch(() => null);
        zeilen.push(`${['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`} ${u ? u.username : 'Unbekannt'} – **${liste[i].anzahl}** geworben`);
      }
      const s = config.getGuildSettings(interaction.guild.id);
      await interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle('🏆 Werber-Rangliste')
        .setColor(0xF1C40F)
        .setDescription(zeilen.join('\n'))
        .setFooter({ text: `Bonus pro Werbung: ${s.inviteTracking ? s.inviteTracking.bonus : 100} ${s.economy.symbol}` })] });
    },
  },
];