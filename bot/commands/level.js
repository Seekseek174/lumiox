// ═══════════════════════════════════════════════════════════════
// LEVEL – Commands 39 bis 42
// Gekaufte XP-Booster aus /shop wirken hier automatisch über
// levelSystem.multiplikatoren() – alles hängt zusammen.
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const config = require('../../core/config');
const { okEmbed, errEmbed, geldbetrag, formatDuration } = require('../../core/utils');
const levelSystem = require('../systems/levelSystem');
const economy = require('../systems/economy');

module.exports = [
  // ── 39) /rank ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Zeigt deine Level-Karte (oder die eines anderen)')
      .addUserOption(o => o.setName('user').setDescription('Wessen Level-Karte?'))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const member = interaction.options.getMember('user') || interaction.member;
      const e = levelSystem.rankCard(member, s);
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 40) /levels ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('levels')
      .setDescription('Die Server-Rangliste nach XP')
      .setDMPermission(false),
    async execute(interaction) {
      const db = require('../../core/db');
      const liste = db.values('levels')
        .filter(l => l.guildId === interaction.guild.id)
        .sort((a, b) => b.xp - a.xp).slice(0, 15);
      if (!liste.length) return interaction.reply({ embeds: [errEmbed('Noch keine XP gesammelt – schreibt doch mal was! 😄')] });

      const zeilen = [];
      for (let i = 0; i < liste.length; i++) {
        const u = await interaction.client.users.fetch(liste[i].userId).catch(() => null);
        const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
        zeilen.push(`${medal} **${u ? u.username : 'Unbekannt'}** – Level ${liste[i].level} · ${liste[i].xp.toLocaleString('de-DE')} XP`);
      }
      const e = new EmbedBuilder()
        .setTitle('📊 Server-Rangliste (Top 15)')
        .setColor(0x5865F2)
        .setDescription(zeilen.join('\n'));
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 41) /givexp (Admin) ───────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('givexp')
      .setDescription('Gibt einem Benutzer XP (Admin)')
      .addUserOption(o => o.setName('user').setDescription('Wer soll XP bekommen?').setRequired(true))
      .addIntegerOption(o => o.setName('menge').setDescription('Wie viel XP? (auch negativ möglich)').setRequired(true))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const member = interaction.options.getMember('user', true);
      const menge = interaction.options.getInteger('menge', true);
      const d = await levelSystem.addXp(member, menge, s);
      await interaction.reply({ embeds: [okEmbed(
        `⭐ ${member.user.username} hat **${menge} XP** erhalten/verloren.\nNeuer Stand: **Level ${d.level}** mit ${d.xp.toLocaleString('de-DE')} XP.`
      )] });
    },
  },

  // ── 42) /xpbooster (Admin) ────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('xpbooster')
      .setDescription('Startet einen serverweiten XP-Booster (finanziert aus der Serverkasse!)')
      .addNumberOption(o => o.setName('multiplikator').setDescription('z. B. 2 = doppelte XP').setRequired(true).setMinValue(1.1).setMaxValue(10))
      .addStringOption(o => o.setName('dauer').setDescription('Dauer in Minuten').setRequired(true))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const multi = interaction.options.getNumber('multiplikator', true);
      const minuten = parseInt(interaction.options.getString('dauer', true), 10);
      if (!minuten || minuten < 5 || minuten > 60 * 24 * 7) {
        return interaction.reply({ embeds: [errEmbed('Dauer: 5 Minuten bis 7 Tage.')], ephemeral: true });
      }
      // Kosten-Formel: 300 Grundpreis pro Stunde je Stufe
      const kosten = Math.round(300 * multi * (minuten / 60));
      const stand = economy.kasseGet(interaction.guild.id);
      if (stand < kosten) {
        return interaction.reply({ embeds: [errEmbed(
          `💰 Der Booster kostet **${geldbetrag(kosten, s.economy)}**, aber die Serverkasse hat nur **${geldbetrag(stand, s.economy)}**.\n` +
          `Tipp: Steuereinnahmen füllen die Kasse – oder ein Admin zahlt per \`/treasury einzahlen\` ein.`
        )], ephemeral: true });
      }
      economy.kasseRemove(interaction.guild.id, kosten, `Server-XP-Booster ×${multi} für ${minuten} Min.`, 'Levelsystem');
      await levelSystem.startServerBooster(interaction.guild.id, multi, minuten);

      const ankündigungsKanal = s.economy.announcementChannel
        ? interaction.guild.channels.cache.get(s.economy.announcementChannel) : null;
      const text = `⚡ **SERVER-XP-BOOSTER AKTIV!**\nAlle erhalten **×${multi} XP** für **${formatDuration(minuten * 60000)}** – finanziert aus der Serverkasse (${geldbetrag(kosten, s.economy)}). Viel Spaß beim Sammeln!`;
      await interaction.reply({ embeds: [okEmbed(text)] });
      if (ankündigungsKanal && ankündigungsKanal.isTextBased() && ankündigungsKanal.id !== interaction.channel.id) {
        await ankündigungsKanal.send(text).catch(() => {});
      }
    },
  },
];
