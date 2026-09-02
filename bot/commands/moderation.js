// ═══════════════════════════════════════════════════════════════
// MODERATION – Commands 1 bis 16 (+ caselist als Teil von 16)
// Alle Aktionen laufen in das EINHEITLICHE Mod-Protokoll (modLog)
// und erscheinen damit automatisch im Dashboard.
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ChannelType,
} = require('discord.js');
const db = require('../../core/db');
const { okEmbed, errEmbed, formatDuration, parseDuration, moderierbar, bumpStat } = require('../../core/utils');
const modLog = require('../systems/modLog');

// Mute-Rolle finden oder erstellen (mit Grund-Overwrites)
async function getMuteRole(guild) {
  let rolle = guild.roles.cache.find((r) => r.name === 'Muted');
  if (!rolle) {
    rolle = await guild.roles.create({
      name: 'Muted', color: 0x607D8B, reason: 'Mute-System automatisch erstellt',
    }).catch(() => null);
    if (!rolle) return null;
    for (const [, ch] of guild.channels.cache) {
      await ch.permissionOverwrites.edit(rolle, {
        SendMessages: false, Speak: false, AddReactions: false,
      }).catch(() => {});
    }
  }
  return rolle;
}

async function needsMods(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ embeds: [errEmbed('Du benötigst die Berechtigung **Mitglieder moderieren**.')], ephemeral: true });
    return true;
  }
  return false;
}

module.exports = [
  // ── 1) /warn ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Verwarnt einen Benutzer (Eintrag im Mod-Protokoll)')
      .addUserOption(o => o.setName('user').setDescription('Wer soll verwarnt werden?').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund der Verwarnung').setRequired(true).setMaxLength(500))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const grund = interaction.options.getString('grund', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const fehler = moderierbar(interaction, member);
      if (fehler) return interaction.reply({ embeds: [errEmbed(fehler)], ephemeral: true });

      const anzahl = modLog.getUserEntries(interaction.guild.id, user.id)
        .filter(e => e.kategorie === 'Verwarnung').length + 1;
      await modLog.addEntry(interaction.guild, {
        userId: user.id, moderator: interaction.user.tag, kategorie: 'Verwarnung',
        schweregrad: 4, grund, kanal: interaction.channel.name,
      });
      await interaction.reply({ embeds: [okEmbed(
        `⚠️ **${user.tag}** wurde verwarnt.\n**Grund:** ${grund}\nDas ist Verwarnung **Nr. ${anzahl}**.`
      )] });
      await user.send(`⚠️ Du wurdest auf **${interaction.guild.name}** verwarnt.\n**Grund:** ${grund}`).catch(() => {});
    },
  },

  // ── 2) /warnings ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Zeigt alle Verwarnungen eines Benutzers')
      .addUserOption(o => o.setName('user').setDescription('Deren Verwarnungen anschauen').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const warns = modLog.getUserEntries(interaction.guild.id, user.id)
        .filter(e => e.kategorie === 'Verwarnung');
      if (!warns.length) {
        return interaction.reply({ embeds: [okEmbed(`✨ **${user.tag}** hat keine Verwarnungen.`)], ephemeral: true });
      }
      const liste = warns.slice(-10).map((w, i) =>
        `**${warns.length - 10 + i + 1}.** <t:${Math.floor(w.zeit / 1000)}:d> – ${w.grund.slice(0, 150)} *(von ${w.moderator})*`
      ).join('\n');
      const e = new EmbedBuilder()
        .setTitle(`⚠️ Verwarnungen von ${user.tag} (${warns.length})`)
        .setColor(0xE74C3C).setDescription(liste.slice(0, 4000));
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 3) /clearwarnings ─────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('clearwarnings')
      .setDescription('Löscht Verwarnungen eines Benutzers')
      .addUserOption(o => o.setName('user').setDescription('Wessen Verwarnungen löschen?').setRequired(true))
      .addIntegerOption(o => o.setName('anzahl').setDescription('Wie viele (von der neuesten aus)? Leer = alle').setMinValue(1))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const anzahl = interaction.options.getInteger('anzahl');
      const geloescht = modLog.deleteVerwarnungen(interaction.guild.id, user.id, anzahl);
      if (!geloescht) {
        return interaction.reply({ embeds: [errEmbed('Es gibt keine Verwarnungen zum Löschen.')], ephemeral: true });
      }
      await interaction.reply({ embeds: [okEmbed(`🗑️ **${geloescht}** Verwarnung(en) von **${user.tag}** gelöscht.`)] });
    },
  },

  // ── 4) /mute ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Versetzt einen Benutzer in die Muted-Rolle (mit automatischer Entmutesierung)')
      .addUserOption(o => o.setName('user').setDescription('Wen muten?').setRequired(true))
      .addStringOption(o => o.setName('dauer').setDescription('z. B. 30 (Min.), 2h, 1d').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const dauerMs = parseDuration(interaction.options.getString('dauer', true));
      const grund = interaction.options.getString('grund', true);
      if (!dauerMs) return interaction.reply({ embeds: [errEmbed('Ungültige Dauer. Beispiele: `30`, `2h`, `1d`')], ephemeral: true });

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const fehler = moderierbar(interaction, member);
      if (fehler) return interaction.reply({ embeds: [errEmbed(fehler)], ephemeral: true });

      const rolle = await getMuteRole(interaction.guild);
      if (!rolle) return interaction.reply({ embeds: [errEmbed('Ich konnte die Muted-Rolle nicht erstellen (Rechte prüfen).')], ephemeral: true });
      await member.roles.add(rolle, `Mute: ${grund} (von ${interaction.user.tag})`).catch(() => {});

      db.push('scheduled', {
        typ: 'unmute', guildId: interaction.guild.id, userId: user.id,
        channelId: interaction.channel.id, faelligAm: Date.now() + dauerMs,
      });
      await modLog.addEntry(interaction.guild, {
        userId: user.id, moderator: interaction.user.tag, kategorie: 'Mute',
        schweregrad: 5, grund: `${grund} (Dauer: ${formatDuration(dauerMs)})`, kanal: interaction.channel.name,
      });
      await interaction.reply({ embeds: [okEmbed(`🔇 **${user.tag}** wurde für **${formatDuration(dauerMs)}** gemuteut.\n**Grund:** ${grund}`)] });
    },
  },

  // ── 5) /unmute ────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Entfernt die Muted-Rolle eines Benutzers')
      .addUserOption(o => o.setName('user').setDescription('Wen entmuten?').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [errEmbed('Dieser Benutzer ist nicht auf dem Server.')], ephemeral: true });
      const rolle = interaction.guild.roles.cache.find(r => r.name === 'Muted');
      if (!rolle || !member.roles.cache.has(rolle.id)) {
        return interaction.reply({ embeds: [errEmbed('Dieser Benutzer ist nicht gemuteut.')], ephemeral: true });
      }
      await member.roles.remove(rolle, `Unmute (von ${interaction.user.tag})`).catch(() => {});
      // Ausstehende Auto-Unmutes entfernen
      for (const [id, s] of db.all('scheduled')) {
        if (s.typ === 'unmute' && s.userId === user.id && s.guildId === interaction.guild.id) db.del('scheduled', id);
      }
      await interaction.reply({ embeds: [okEmbed(`🔊 **${user.tag}** wurde entmuteut.`)] });
    },
  },

  // ── 6) /kick ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kickt einen Benutzer vom Server')
      .addUserOption(o => o.setName('user').setDescription('Wen kicken?').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const grund = interaction.options.getString('grund', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const fehler = moderierbar(interaction, member);
      if (fehler) return interaction.reply({ embeds: [errEmbed(fehler)], ephemeral: true });
      if (!member.kickable) return interaction.reply({ embeds: [errEmbed('Ich kann diesen Benutzer nicht kicken (Rollen-Reihenfolge prüfen).')], ephemeral: true });

      await user.send(`👢 Du wurdest von **${interaction.guild.name}** gekickt.\n**Grund:** ${grund}`).catch(() => {});
      await member.kick(`${grund} (von ${interaction.user.tag})`);
      await modLog.addEntry(interaction.guild, {
        userId: user.id, moderator: interaction.user.tag, kategorie: 'Kick',
        schweregrad: 7, grund, kanal: interaction.channel.name,
      });
      await interaction.reply({ embeds: [okEmbed(`👢 **${user.tag}** wurde gekickt.\n**Grund:** ${grund}`)] });
    },
  },

  // ── 7) /ban ───────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Bannt einen Benutzer vom Server')
      .addUserOption(o => o.setName('user').setDescription('Wen bannen?').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500))
      .addStringOption(o => o.setName('nachrichten_loeschen').setDescription('Nachrichten des Users löschen?')
        .addChoices(
          { name: 'Keine', value: '0' },
          { name: 'Letzte Stunde', value: '3600' },
          { name: 'Letzte 24 Stunden', value: '86400' },
          { name: 'Letzte 7 Tage', value: '604800' },
        ))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const grund = interaction.options.getString('grund', true);
      const sek = parseInt(interaction.options.getString('nachrichten_loeschen') || '0', 10);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const fehler = moderierbar(interaction, member);
        if (fehler) return interaction.reply({ embeds: [errEmbed(fehler)], ephemeral: true });
      }
      await interaction.guild.members.ban(user.id, {
        reason: `${grund} (von ${interaction.user.tag})`,
        deleteMessageSeconds: sek,
      }).catch(e => {
        return interaction.reply({ embeds: [errEmbed('Ban fehlgeschlagen: ' + e.message)], ephemeral: true });
      });
      await modLog.addEntry(interaction.guild, {
        userId: user.id, moderator: interaction.user.tag, kategorie: 'Ban',
        schweregrad: 9, grund, kanal: interaction.channel.name,
      });
      await interaction.reply({ embeds: [okEmbed(`🔨 **${user.tag}** wurde gebannt.\n**Grund:** ${grund}`)] });
    },
  },

  // ── 8) /tempban ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('tempban')
      .setDescription('Bannt einen Benutzer zeitweise (automatische Entbannung)')
      .addUserOption(o => o.setName('user').setDescription('Wen temporär bannen?').setRequired(true))
      .addStringOption(o => o.setName('dauer').setDescription('z. B. 60 (Min.), 12h, 3d').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const dauerMs = parseDuration(interaction.options.getString('dauer', true));
      const grund = interaction.options.getString('grund', true);
      if (!dauerMs) return interaction.reply({ embeds: [errEmbed('Ungültige Dauer. Beispiele: `60`, `12h`, `3d`')], ephemeral: true });
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const fehler = moderierbar(interaction, member);
        if (fehler) return interaction.reply({ embeds: [errEmbed(fehler)], ephemeral: true });
      }
      await interaction.guild.members.ban(user.id, { reason: `Tempban: ${grund} (von ${interaction.user.tag})` }).catch(e => {
        return interaction.reply({ embeds: [errEmbed('Ban fehlgeschlagen: ' + e.message)], ephemeral: true });
      });
      db.push('scheduled', {
        typ: 'tempban', guildId: interaction.guild.id, userId: user.id,
        faelligAm: Date.now() + dauerMs,
      });
      await modLog.addEntry(interaction.guild, {
        userId: user.id, moderator: interaction.user.tag, kategorie: 'Ban',
        schweregrad: 8, grund: `Tempban (${formatDuration(dauerMs)}): ${grund}`, kanal: interaction.channel.name,
      });
      await interaction.reply({ embeds: [okEmbed(
        `⏳ **${user.tag}** wurde für **${formatDuration(dauerMs)}** gebannt.\n**Grund:** ${grund}\nDie Entbannung erfolgt automatisch.`
      )] });
    },
  },

  // ── 9) /unban ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Entbannt einen Benutzer per ID')
      .addStringOption(o => o.setName('user_id').setDescription('Die Benutzer-ID (z. B. 123456789012345678)').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const id = interaction.options.getString('user_id', true).trim();
      if (!/^\d{17,20}$/.test(id)) {
        return interaction.reply({ embeds: [errEmbed('Das ist keine gültige Benutzer-ID.')], ephemeral: true });
      }
      try {
        const user = await interaction.guild.bans.remove(id, `Unban (von ${interaction.user.tag})`);
        await interaction.reply({ embeds: [okEmbed(`✅ **${user?.tag || id}** wurde entbannt.`)] });
      } catch (_) {
        await interaction.reply({ embeds: [errEmbed('Dieser Benutzer ist nicht gebannt oder die ID ist falsch.')], ephemeral: true });
      }
    },
  },

  // ── 10) /softban ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('softban')
      .setDescription('Bannt einen Benutzer und entbannt ihn sofort (löscht seine Nachrichten)')
      .addUserOption(o => o.setName('user').setDescription('Wen softbannen?').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const grund = interaction.options.getString('grund', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const fehler = moderierbar(interaction, member);
      if (fehler) return interaction.reply({ embeds: [errEmbed(fehler)], ephemeral: true });

      await interaction.guild.members.ban(user.id, {
        reason: `Softban: ${grund}`, deleteMessageSeconds: 86400,
      }).catch(e => {
        return interaction.reply({ embeds: [errEmbed('Softban fehlgeschlagen: ' + e.message)], ephemeral: true });
      });
      await interaction.guild.bans.remove(user.id, 'Softban – sofortige Entbannung').catch(() => {});
      await modLog.addEntry(interaction.guild, {
        userId: user.id, moderator: interaction.user.tag, kategorie: 'Ban',
        schweregrad: 6, grund: `Softban (Nachrichten gelöscht): ${grund}`, kanal: interaction.channel.name,
      });
      await interaction.reply({ embeds: [okEmbed(`🧹 **${user.tag}** wurde softgebannt (Nachrichten gelöscht, kann sofort wiederjoinen).\n**Grund:** ${grund}`)] });
    },
  },

  // ── 11) /timeout ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Gibt einem Benutzer ein Discord-Timeout')
      .addUserOption(o => o.setName('user').setDescription('Wen in Timeout versetzen?').setRequired(true))
      .addStringOption(o => o.setName('dauer').setDescription('z. B. 10 (Min.), 1h, 1d – max. 28 Tage').setRequired(true))
      .addStringOption(o => o.setName('grund').setDescription('Grund').setMaxLength(500))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const dauerMs = parseDuration(interaction.options.getString('dauer', true));
      const grund = interaction.options.getString('grund') || 'Kein Grund angegeben';
      if (!dauerMs) return interaction.reply({ embeds: [errEmbed('Ungültige Dauer. Beispiele: `10`, `1h`, `1d`')], ephemeral: true });
      if (dauerMs > 28 * 86400000) return interaction.reply({ embeds: [errEmbed('Maximal 28 Tage erlaubt.')], ephemeral: true });
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const fehler = moderierbar(interaction, member);
      if (fehler) return interaction.reply({ embeds: [errEmbed(fehler)], ephemeral: true });
      if (!member.moderatable) return interaction.reply({ embeds: [errEmbed('Ich kann diesen Benutzer nicht in Timeout versetzen.')], ephemeral: true });

      await member.timeout(dauerMs, `${grund} (von ${interaction.user.tag})`);
      await modLog.addEntry(interaction.guild, {
        userId: user.id, moderator: interaction.user.tag, kategorie: 'Mute',
        schweregrad: 4, grund: `Timeout (${formatDuration(dauerMs)}): ${grund}`, kanal: interaction.channel.name,
      });
      await interaction.reply({ embeds: [okEmbed(`⏸️ **${user.tag}** hat ein Timeout für **${formatDuration(dauerMs)}**.\n**Grund:** ${grund}`)] });
    },
  },

  // ── 12) /clear ────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Löscht mehrere Nachrichten im aktuellen Kanal')
      .addIntegerOption(o => o.setName('anzahl').setDescription('Wie viele? (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption(o => o.setName('user').setDescription('Nur Nachrichten dieses Benutzers löschen'))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const anzahl = interaction.options.getInteger('anzahl', true);
      const zielUser = interaction.options.getUser('user');
      await interaction.deferReply({ ephemeral: true });

      let geloescht = 0;
      if (zielUser) {
        // Gefilterte Löschung: mehr laden, nach User filtern
        const nachrichten = await interaction.channel.messages.fetch({ limit: 100 });
        const passende = [...nachrichten.values()]
          .filter(m => m.author.id === zielUser.id).slice(0, anzahl);
        await interaction.channel.bulkDelete(passende, true).catch(() => {});
        geloescht = passende.length;
      } else {
        const batch = await interaction.channel.bulkDelete(anzahl, true).catch(() => []);
        geloescht = batch ? batch.size : 0;
      }

      // Statistik: gefilterte Nachrichten zählen (fürs Dashboard)
      bumpStat(interaction.guild.id, 'geloeschteNachrichten', geloescht);

      await interaction.editReply(`🗑️ **${geloescht}** Nachrichten gelöscht${zielUser ? ` von **${zielUser.tag}**` : ''}.`);
      const hinweis = await interaction.channel.send(`🧹 ${interaction.user} hat **${geloescht}** Nachrichten gelöscht.`);
      setTimeout(() => hinweis.delete().catch(() => {}), 5000);
    },
  },

  // ── 13) /slowmode ─────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Setzt den Slowmode für einen Kanal')
      .addChannelOption(o => o.setName('kanal').setDescription('Welcher Kanal?').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addIntegerOption(o => o.setName('sekunden').setDescription('0 = aus, max. 21600').setRequired(true).setMinValue(0).setMaxValue(21600))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const kanal = interaction.options.getChannel('kanal', true);
      const sek = interaction.options.getInteger('sekunden', true);
      await kanal.setRateLimitPerUser(sek, `Slowmode (von ${interaction.user.tag})`).catch(e => {
        return interaction.reply({ embeds: [errEmbed('Fehlgeschlagen: ' + e.message)], ephemeral: true });
      });
      await interaction.reply({ embeds: [okEmbed(`🐢 Slowmode für ${kanal}: **${sek === 0 ? 'aus' : sek + ' Sekunden'}**`)] });
    },
  },

  // ── 14) /lock ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Sperrt einen Kanal (niemand kann mehr schreiben)')
      .addChannelOption(o => o.setName('kanal').setDescription('Welcher Kanal? (leer = dieser)').addChannelTypes(ChannelType.GuildText))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const kanal = interaction.options.getChannel('kanal') || interaction.channel;
      await kanal.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false })
        .catch(e => {
          return interaction.reply({ embeds: [errEmbed('Fehlgeschlagen: ' + e.message)], ephemeral: true });
        });
      await interaction.reply({ embeds: [okEmbed(`🔒 ${kanal} wurde **gesperrt**.`)] });
    },
  },

  // ── 15) /unlock ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Entsperrt einen Kanal wieder')
      .addChannelOption(o => o.setName('kanal').setDescription('Welcher Kanal? (leer = dieser)').addChannelTypes(ChannelType.GuildText))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      const kanal = interaction.options.getChannel('kanal') || interaction.channel;
      await kanal.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null })
        .catch(e => {
          return interaction.reply({ embeds: [errEmbed('Fehlgeschlagen: ' + e.message)], ephemeral: true });
        });
      await interaction.reply({ embeds: [okEmbed(`🔓 ${kanal} wurde **entsperrt**.`)] });
    },
  },

  // ── 16a) /case ────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('case')
      .setDescription('Zeigt einen Mod-Eintrag im Detail')
      .addStringOption(o => o.setName('eintrag_id').setDescription('Case-Nummer (z. B. 5) oder ID').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const eingabe = interaction.options.getString('eintrag_id', true).trim();
      let eintrag = null;
      if (/^case_/.test(eingabe)) {
        eintrag = modLog.getEntryById(eingabe);
      } else {
        const nummer = parseInt(eingabe, 10);
        eintrag = db.values('mod_entries').find(e => e.guildId === interaction.guild.id && e.nummer === nummer) || null;
      }
      if (!eintrag || eintrag.guildId !== interaction.guild.id) {
        return interaction.reply({ embeds: [errEmbed('Kein Eintrag mit dieser Nummer/ID gefunden.')], ephemeral: true });
      }
      const e = new EmbedBuilder()
        .setTitle(`⚖️ Mod-Eintrag #${eintrag.nummer} · ${eintrag.kategorie}`)
        .setColor(0x3498DB)
        .addFields(
          { name: 'Benutzer', value: `<@${eintrag.userId}> (\`${eintrag.userId}\`)`, inline: true },
          { name: 'Von', value: eintrag.moderator, inline: true },
          { name: 'Status', value: eintrag.status === 'offen' ? '🔴 Offen' : '🟢 Erledigt', inline: true },
          { name: 'Schweregrad', value: `${eintrag.schweregrad}/10`, inline: true },
          { name: 'Zeitpunkt', value: `<t:${Math.floor(eintrag.zeit / 1000)}:F>`, inline: true },
          { name: 'Kanal', value: eintrag.kanal ? '#' + eintrag.kanal : '—', inline: true },
          { name: 'Begründung', value: eintrag.grund },
        )
        .setFooter({ text: 'ID: ' + eintrag.id });
      if (eintrag.beweis) e.addFields({ name: 'Beweis (Nachricht)', value: eintrag.beweis.slice(0, 1024) });
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 16b) /caselist ────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('caselist')
      .setDescription('Zeigt alle Mod-Einträge eines Benutzers')
      .addUserOption(o => o.setName('user').setDescription('Wessen Protokoll?').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      if (await needsMods(interaction)) return;
      const user = interaction.options.getUser('user', true);
      const eintraege = modLog.getUserEntries(interaction.guild.id, user.id);
      if (!eintraege.length) {
        return interaction.reply({ embeds: [okEmbed(`✨ **${user.tag}** hat ein sauberes Protokoll – keine Einträge.`)], ephemeral: true });
      }
      const ikonen = {
        'Verwarnung': '⚠️', 'KI-Erkennung': '🧠', 'Wortfilter-Treffer': '🧹',
        'Mute': '🔇', 'Ban': '🔨', 'Auto-Mod': '🛡️', 'Kick': '👢',
      };
      const liste = eintraege.slice(-15).map(en =>
        `${ikonen[en.kategorie] || '•'} **#${en.nummer}** ${en.kategorie} (SG ${en.schweregrad}) – <t:${Math.floor(en.zeit / 1000)}:d>\n↳ ${en.grund.slice(0, 120)}`
      ).join('\n');
      const e = new EmbedBuilder()
        .setTitle(`📋 Mod-Protokoll von ${user.tag} (${eintraege.length} Einträge)`)
        .setColor(0x95A5A6)
        .setDescription(liste.slice(0, 4000))
        .setFooter({ text: 'Details: /case <Nummer> · Vollansicht im Dashboard' });
      await interaction.reply({ embeds: [e] });
    },
  },
];
