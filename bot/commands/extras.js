'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { okEmbed, errEmbed } = require('../../core/utils');
module.exports = [
  { data: new SlashCommandBuilder().setName('serverinfo2').setDescription('Erweiterte Server-Infos').setDMPermission(false),
    async execute(i) { const g = i.guild;
      await i.reply({ embeds: [new EmbedBuilder().setTitle('📊 ' + g.name).setColor(0x2ECC71).setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: '👥 Mitglieder', value: String(g.memberCount), inline: true },
          { name: '📅 Erstellt', value: '<t:' + Math.floor(g.createdTimestamp / 1000) + ':d>', inline: true },
          { name: '🚀 Boost', value: 'Stufe ' + g.premiumTier + ' (' + (g.premiumSubscriptionCount || 0) + ')', inline: true },
          { name: '💬 Kanäle', value: String(g.channels.cache.size), inline: true },
          { name: '🏷️ Rollen', value: String(g.roles.cache.size - 1), inline: true },
          { name: '😀 Emojis', value: String(g.emojis.cache.size), inline: true },
          { name: '👑 Owner', value: '<@' + g.ownerId + '>', inline: true })] }); } },
  { data: new SlashCommandBuilder().setName('roleinfo').setDescription('Alle Infos über eine Rolle').setDMPermission(false)
      .addRoleOption(o => o.setName('rolle').setDescription('Welche Rolle?').setRequired(true)),
    async execute(i) { const r = i.options.getRole('rolle', true);
      await i.reply({ embeds: [new EmbedBuilder().setTitle('🏷️ ' + r.name).setColor(r.color || 0x95A5A6)
        .addFields(
          { name: '🆔', value: r.id, inline: true },
          { name: '👥 Mitglieder', value: String(r.members.size), inline: true },
          { name: '🎨 Farbe', value: r.hexColor, inline: true },
          { name: '🔑 Rechte', value: String(r.permissions.toArray().length), inline: true },
          { name: '🤖 Bot-Rolle', value: r.managed ? 'Ja' : 'Nein', inline: true })] }); } },
  { data: new SlashCommandBuilder().setName('permcheck').setDescription('Was darf der Bot hier?').setDMPermission(false),
    async execute(i) { const p = i.channel.permissionsFor(i.guild.members.me);
      const l = [['👀 Sehen', 'ViewChannel'], ['💬 Schreiben', 'SendMessages'], ['🗑️ Löschen', 'ManageMessages'],
        ['🔇 Timeout', 'ModerateMembers'], ['👢 Kick', 'KickMembers'], ['🔨 Ban', 'BanMembers'], ['🏷️ Rollen', 'ManageRoles']];
      await i.reply({ embeds: [new EmbedBuilder().setTitle('🔑 Rechte in #' + i.channel.name).setColor(0x3498DB)
        .setDescription(l.map(([n, k]) => (p.has(require('discord.js').PermissionFlagsBits[k]) ? '✅ ' : '❌ ') + n).join('\n'))] }); } },
  { data: new SlashCommandBuilder().setName('uptime').setDescription('Wie lange läuft der Bot?').setDMPermission(false),
    async execute(i) { const u = process.uptime();
      await i.reply('⏱️ **' + Math.floor(u / 86400) + ' Tg. ' + Math.floor(u % 86400 / 3600) + ' Std. ' + Math.floor(u % 3600 / 60) + ' Min.** · RAM ' + Math.round(process.memoryUsage().rss / 1048576) + ' MB'); } },
  { data: new SlashCommandBuilder().setName('fortune').setDescription('Die Kugel sagt deine Zukunft').setDMPermission(false),
    async execute(i) { const t = ['Ein großes Glück wartet … nach dem nächsten Kaffee ☕',
      'Du wirst heute etwas finden, das du längst vergessen hast 🔍',
      'Dein nächstes Level-Up ist näher als du denkst ⚡',
      'Jemand denkt gerade an dich. Wahrscheinlich ein Bot 🤖',
      'Die Sterne sagen: alles gut ⭐'];
      await i.reply('🔮 ' + t[Math.floor(Math.random() * t.length)]); } },
  { data: new SlashCommandBuilder().setName('lucky').setDescription('Deine Glückszahl für heute').setDMPermission(false),
    async execute(i) { const seed = parseInt(i.user.id.slice(-6), 10) + parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''), 10);
      const z = (seed * 9301 + 49297) % 100 + 1;
      const b = z > 90 ? 'EXTREMES GLÜCK! 🍀' : z > 70 ? 'Sehr gut ☀️' : z > 40 ? 'Solide 👍' : z > 15 ? 'Eher mau 🌧️' : 'Vorsichtig sein 😬';
      await i.reply('🎲 **' + z + '** – ' + b); } },
  { data: new SlashCommandBuilder().setName('color').setDescription('Farb-Vorschau (HEX)').setDMPermission(false)
      .addStringOption(o => o.setName('hex').setDescription('z. B. FF5733').setRequired(true)),
    async execute(i) { const h = i.options.getString('hex', true).replace('#', '');
      if (!/^[0-9a-fA-F]{6}$/.test(h)) return i.reply({ embeds: [errEmbed('Bitte 6 Hex-Zeichen, z. B. FF5733')] });
      await i.reply({ embeds: [new EmbedBuilder().setTitle('🎨 #' + h.toUpperCase()).setColor(parseInt(h, 16))
        .addFields({ name: 'RGB', value: parseInt(h.slice(0, 2), 16) + ', ' + parseInt(h.slice(2, 4), 16) + ', ' + parseInt(h.slice(4, 6), 16), inline: true })] }); } },
  { data: new SlashCommandBuilder().setName('coinflip-streak').setDescription('Münzwurf mit Serien-Zähler').setDMPermission(false),
    async execute(i) { const db = require('../../core/db');
      const key = 'streak_' + i.guild.id + '_' + i.user.id;
      const erg = Math.random() < 0.5 ? 'Kopf' : 'Zahl';
      const st = db.get('counters', key) || { serie: 0, beste: 0, seite: null };
      if (st.seite === erg) { st.serie++; st.beste = Math.max(st.beste, st.serie); }
      else { st.seite = erg; st.serie = 1; st.beste = Math.max(st.beste, 1); }
      db.set('counters', key, st);
      await i.reply({ embeds: [new EmbedBuilder().setTitle('🪙 ' + erg + '!').setColor(0xF1C40F)
        .setDescription('Serie: **' + st.serie + '× ' + st.seite + '** · Rekord: **' + st.beste + '**')] }); } },
  { data: new SlashCommandBuilder().setName('remind2').setDescription('Wiederholende Erinnerung').setDMPermission(false)
      .addStringOption(o => o.setName('text').setDescription('Woran?').setRequired(true))
      .addIntegerOption(o => o.setName('stunden').setDescription('Alle X Stunden').setMinValue(1).setMaxValue(168).setRequired(true)),
    async execute(i) { const db = require('../../core/db');
      db.push('reminders', { guildId: i.guild.id, userId: i.user.id, channelId: i.channel.id,
        text: '[alle ' + i.options.getInteger('stunden', true) + 'h] ' + i.options.getString('text', true),
        faelligAm: Date.now() + i.options.getInteger('stunden', true) * 3600000, erstelltAm: Date.now() });
      await i.reply({ embeds: [okEmbed('🔁 Alle ' + i.options.getInteger('stunden', true) + ' h: ' + i.options.getString('text', true))] }); } },
  { data: new SlashCommandBuilder().setName('emote').setDescription('Info über ein Custom-Emoji').setDMPermission(false)
      .addStringOption(o => o.setName('emoji').setDescription('Das Emoji').setRequired(true)),
    async execute(i) { const m = i.options.getString('emoji', true).match(/<a?:(\w+):(\d+)>/);
      if (!m) return i.reply({ embeds: [errEmbed('Kein Custom-Emoji.')] });
      const em = await i.guild.emojis.fetch(m[2]).catch(() => null);
      if (!em) return i.reply({ embeds: [errEmbed('Nicht auf diesem Server.')] });
      await i.reply({ embeds: [new EmbedBuilder().setTitle(':' + em.name + ':').setColor(0x9B59B6).setThumbnail(em.url)
        .addFields({ name: '🆔', value: em.id, inline: true },
          { name: '📅', value: '<t:' + Math.floor(em.createdTimestamp / 1000) + ':d>', inline: true },
          { name: '👤', value: em.author ? em.author.tag : '?', inline: true })] }); } },
];
