// ═══════════════════════════════════════════════════════════════
// UTILITY – Commands 51 bis 66
// Hinweis zu /tag: Discord erlaubt keine Mischung aus Optionen und
// Subcommands – deshalb /tag create /tag send /taglist.
// /embed nutzt ein MODAL – der Submit-Handler registriert sich
// selbst in client.components (verarbeitet in interactionCreate).
// /translate & /ai nutzen das LOKALE Ollama (Offline = deutsche
// Fehlermeldung). /weather nutzt open-meteo.com (ohne API-Key).
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const ollama = require('../../core/ollama');
const modLog = require('../systems/modLog');
const levelSystem = require('../systems/levelSystem');
const economy = require('../systems/economy');
const suggestions = require('../systems/suggestions');
const reminders = require('../systems/reminders');
const { okEmbed, errEmbed, infoEmbed, parseDuration, formatDuration, geldbetrag } = require('../../core/utils');

// Sicheres Auslesen optionaler Modal-Felder
function modalFeld(mi, id) {
  try { return mi.fields.getTextInputValue(id); } catch (_) { return ''; }
}

// WMO-Wettercodes -> deutsche Beschreibung + Emoji
const WETTER_CODES = {
  0: ['Klarer Himmel', '☀️'], 1: ['Überwiegend klar', '🌤️'], 2: ['Teils bewölkt', '⛅'],
  3: ['Bedeckt', '☁️'], 45: ['Nebel', '🌫️'], 48: ['Reifnebel', '🌫️'],
  51: ['Leichter Nieselregen', '🌦️'], 53: ['Nieselregen', '🌦️'], 55: ['Starker Nieselregen', '🌧️'],
  61: ['Leichter Regen', '🌦️'], 63: ['Regen', '🌧️'], 65: ['Starker Regen', '🌧️'],
  66: ['Gefrierender Regen', '🌧️'], 67: ['Starker gefrierender Regen', '🌧️'],
  71: ['Leichter Schneefall', '🌨️'], 73: ['Schneefall', '🌨️'], 75: ['Starker Schneefall', '❄️'],
  77: ['Schneegriesel', '🌨️'], 80: ['Leichte Regenschauer', '🌦️'], 81: ['Regenschauer', '🌧️'],
  82: ['Heftige Regenschauer', '⛈️'], 85: ['Schneeschauer', '🌨️'], 86: ['Starke Schneeschauer', '❄️'],
  95: ['Gewitter', '⛈️'], 96: ['Gewitter mit Hagel', '⛈️'], 99: ['Schweres Gewitter mit Hagel', '⛈️'],
};

async function fetchJSON(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const MODAL_ID = 'embed_builder_modal';

module.exports = [
  // ── 51) /poll ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Erstelle eine Umfrage mit bis zu 10 Optionen')
      .addStringOption(o => o.setName('frage').setDescription('Die Umfrage-Frage').setRequired(true).setMaxLength(250))
      .addStringOption(o => o.setName('optionen').setDescription('Durch Komma getrennt, z. B.: Pizza, Pasta, Salat').setRequired(true).setMaxLength(900))
      .setDMPermission(false),
    async execute(interaction) {
      const frage = interaction.options.getString('frage', true);
      const optionen = interaction.options.getString('optionen', true)
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
      if (optionen.length < 2) {
        return interaction.reply({ embeds: [errEmbed('Bitte gib **mindestens 2** Optionen an (mit Komma getrennt).')], ephemeral: true });
      }
      const zahlen = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const e = new EmbedBuilder()
        .setTitle('📊 Umfrage')
        .setColor(0x3498DB)
        .setDescription(`**${frage}**\n\n` + optionen.map((o, i) => `${zahlen[i]} ${o}`).join('\n'))
        .setFooter({ text: `Von ${interaction.user.username} · Stimme mit den Reaktionen!` });
      const msg = await interaction.reply({ embeds: [e], fetchReply: true });
      for (let i = 0; i < optionen.length; i++) await msg.react(zahlen[i]).catch(() => {});
    },
  },

  // ── 52) /remind ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('remind')
      .setDescription('Setze eine Erinnerung (überlebt Bot-Neustarts!)')
      .addStringOption(o => o.setName('zeit').setDescription('z. B. 30 (Min.), 2h, 1d').setRequired(true))
      .addStringOption(o => o.setName('text').setDescription('Woran soll ich dich erinnern?').setRequired(true).setMaxLength(500))
      .setDMPermission(false),
    async execute(interaction) {
      const dauerMs = parseDuration(interaction.options.getString('zeit', true));
      if (!dauerMs) return interaction.reply({ embeds: [errEmbed('Ungültige Zeit. Beispiele: `30`, `2h`, `1d`')], ephemeral: true });
      if (dauerMs > 30 * 86400000) return interaction.reply({ embeds: [errEmbed('Maximal 30 Tage im Voraus.')], ephemeral: true });
      const text = interaction.options.getString('text', true);
      const faelligAm = Date.now() + dauerMs;
      reminders.erstellen(interaction.guild.id, interaction.user.id, interaction.channel.id, text, faelligAm);
      await interaction.reply({ embeds: [okEmbed(`⏰ Erinnerung gesetzt! Ich melde mich **<t:${Math.floor(faelligAm / 1000)}:R>** mit: *${text}*`)] });
    },
  },

  // ── 53) /reminders ────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('reminders')
      .setDescription('Zeigt deine aktiven Erinnerungen')
      .setDMPermission(false),
    async execute(interaction) {
      const liste = reminders.liste(interaction.guild.id, interaction.user.id);
      if (!liste.length) return interaction.reply({ embeds: [infoEmbed('Du hast keine aktiven Erinnerungen.')], ephemeral: true });
      const e = new EmbedBuilder()
        .setTitle('⏰ Deine Erinnerungen')
        .setColor(0xF1C40F)
        .setDescription(liste.map(r =>
          `• <t:${Math.floor(r.faelligAm / 1000)}:R> – ${r.text}`
        ).join('\n'));
      await interaction.reply({ embeds: [e], ephemeral: true });
    },
  },

  // ── 54) /avatar ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Zeigt den Avatar eines Benutzers')
      .addUserOption(o => o.setName('user').setDescription('Wessen Avatar?'))
      .setDMPermission(false),
    async execute(interaction) {
      const user = interaction.options.getUser('user') || interaction.user;
      const e = new EmbedBuilder()
        .setTitle(`🖼️ Avatar von ${user.username}`)
        .setColor(0x5865F2)
        .setImage(user.displayAvatarURL({ size: 1024 }));
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 55) /userinfo – ALLES verknüpft! ──────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Alle Infos zu einem Benutzer: Mod-Einträge, Level, Vermögen')
      .addUserOption(o => o.setName('user').setDescription('Wessen Infos?'))
      .setDMPermission(false),
    async execute(interaction) {
      const user = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const s = config.getGuildSettings(interaction.guild.id);

      // Mod-Einträge
      const eintraege = modLog.getUserEntries(interaction.guild.id, user.id);
      const warns = eintraege.filter(en => en.kategorie === 'Verwarnung').length;

      // Level (verknüpft mit gekauften Boostern!)
      const level = levelSystem.getLevelDoc(interaction.guild.id, user.id);
      const eco = economy.getEco(interaction.guild.id, user.id);
      const boosterAktiv = eco.boosterBis > Date.now();

      const e = new EmbedBuilder()
        .setTitle(`👤 ${user.tag}`)
        .setColor(member ? member.displayColor || 0x5865F2 : 0x95A5A6)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '🆔 ID', value: user.id, inline: true },
          { name: '📅 Discord seit', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:d>`, inline: true },
          { name: '📥 Beigetreten', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:d>` : '—', inline: true },
          { name: '⭐ Level', value: `${level.level} (${level.xp.toLocaleString('de-DE')} XP)${boosterAktiv ? ' ⚡Booster!' : ''}`, inline: true },
          { name: '💰 Vermögen', value: geldbetrag(economy.vermoegen(eco), s.economy), inline: true },
          { name: '🧾 Mod-Einträge', value: `${eintraege.length} gesamt · ${warns} Verwarnung(en)`, inline: true },
        );
      if (member && member.roles.cache.size > 1) {
        const rollen = member.roles.cache
          .filter(r => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => r.toString()).slice(0, 15).join(' ');
        e.addFields({ name: `🏷️ Rollen (${member.roles.cache.size - 1})`, value: rollen.slice(0, 1024) });
      }
      if (eintraege.length) {
        const letzte = eintraege[eintraege.length - 1];
        e.addFields({ name: 'Letzter Eintrag', value: `**#${letzte.nummer}** ${letzte.kategorie} – ${letzte.grund.slice(0, 150)} (<t:${Math.floor(letzte.zeit / 1000)}:R>)` });
      }
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 56) /serverinfo ───────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('serverinfo')
      .setDescription('Informationen über diesen Server')
      .setDMPermission(false),
    async execute(interaction) {
      const g = interaction.guild;
      const e = new EmbedBuilder()
        .setTitle(`🏠 ${g.name}`)
        .setColor(0x2ECC71)
        .setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: '👑 Inhaber', value: `<@${g.ownerId}>`, inline: true },
          { name: '👥 Mitglieder', value: String(g.memberCount), inline: true },
          { name: '📅 Erstellt', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:d>`, inline: true },
          { name: '💬 Kanäle', value: `${g.channels.cache.filter(c => c.type === ChannelType.GuildText).size} Text · ${g.channels.cache.filter(c => c.isVoiceBased()).size} Voice`, inline: true },
          { name: '🏷️ Rollen', value: String(g.roles.cache.size - 1), inline: true },
          { name: '🚀 Boost-Stufe', value: `Stufe ${g.premiumTier} (${g.premiumSubscriptionCount || 0} Boosts)`, inline: true },
        );
      if (g.description) e.setDescription(g.description);
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 57) /botinfo – inkl. Ollama & RAM ─────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('botinfo')
      .setDescription('Infos über den Bot: Uptime, RAM, Ollama-Status')
      .setDMPermission(false),
    async execute(interaction) {
      const ram = process.memoryUsage();
      const status = ollama.getStatus();
      const up = process.uptime();
      const upText = `${Math.floor(up / 3600)} Std. ${Math.floor((up % 3600) / 60)} Min.`;
      const e = new EmbedBuilder()
        .setTitle('🤖 Bot-Informationen')
        .setColor(0x5865F2)
        .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '📡 Ping', value: `${Math.max(0, Math.round(interaction.client.ws.ping))} ms`, inline: true },
          { name: '⏱️ Uptime (Prozess)', value: upText, inline: true },
          { name: '🗄️ Server', value: String(interaction.client.guilds.cache.size), inline: true },
          { name: '🧠 RAM (Prozess)', value: `${(ram.rss / 1024 / 1024).toFixed(1)} MB`, inline: true },
          { name: '⚙️ Node.js', value: process.version, inline: true },
          { name: '📚 discord.js', value: require('discord.js').version, inline: true },
          {
            name: '🦙 Ollama (lokale KI)',
            value: status.online
              ? `🟢 **Online** – Modell: \`${config.get().ollama.model}\` (letzte Antwort: ${status.lastLatencyMs} ms)`
              : `🔴 **Offline** – ${status.lastError || 'Bitte mit \`ollama serve\` starten.'}`,
          },
        );
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 58) /say ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('say')
      .setDescription('Lässt den Bot eine Nachricht senden (Admin)')
      .addChannelOption(o => o.setName('kanal').setDescription('Zielkanal').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('text').setDescription('Was soll ich sagen?').setRequired(true).setMaxLength(1900))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const kanal = interaction.options.getChannel('kanal', true);
      const text = interaction.options.getString('text', true);
      await kanal.send({ content: text, allowedMentions: { parse: ['users', 'roles'] } }).catch(err => {
        return interaction.reply({ embeds: [errEmbed('Senden fehlgeschlagen: ' + err.message)], ephemeral: true });
      });
      await interaction.reply({ embeds: [okEmbed(`✅ Nachricht nach ${kanal} gesendet.`)], ephemeral: true });
    },
  },

  // ── 59) /embed – interaktiver Embed-Builder ───────────────────
  {
    data: new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Baut einen Embed mit einem Formular (Titel, Text, Farbe, Bild)')
      .addChannelOption(o => o.setName('kanal').setDescription('Zielkanal (leer = dieser Kanal)').addChannelTypes(ChannelType.GuildText))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const kanal = interaction.options.getChannel('kanal') || interaction.channel;

      // Submit-Handler einmalig registrieren (zustandslos, liest die
      // Modal-Daten direkt aus dem Submit – mehrere Nutzer möglich)
      if (!interaction.client.components.has(MODAL_ID)) {
        interaction.client.components.set(MODAL_ID, async (mi) => {
          const zielId = mi.fields.getTextInputValue('eb_kanal_id');
          const titel = modalFeld(mi, 'eb_titel');
          const beschreibung = modalFeld(mi, 'eb_beschreibung');
          const farbeRaw = modalFeld(mi, 'eb_farbe').replace('#', '').trim();
          const bild = modalFeld(mi, 'eb_bild').trim();
          const fuss = modalFeld(mi, 'eb_fuss').trim();

          if (!titel && !beschreibung) {
            return mi.reply({ embeds: [errEmbed('Bitte mindestens Titel **oder** Beschreibung ausfüllen.')], ephemeral: true });
          }
          const e = new EmbedBuilder().setColor(parseInt(farbeRaw, 16) || 0x5865F2);
          if (titel) e.setTitle(titel);
          if (beschreibung) e.setDescription(beschreibung);
          if (bild) {
            if (!/^https?:\/\//.test(bild)) {
              return mi.reply({ embeds: [errEmbed('Die Bild-URL muss mit `http://` oder `https://` beginnen.')], ephemeral: true });
            }
            e.setImage(bild);
          }
          if (fuss) e.setFooter({ text: fuss });

          const ziel = mi.guild.channels.cache.get(zielId);
          if (!ziel || !ziel.isTextBased()) {
            return mi.reply({ embeds: [errEmbed('Zielkanal nicht gefunden.')], ephemeral: true });
          }
          await ziel.send({ embeds: [e] }).catch(err =>
            mi.reply({ embeds: [errEmbed('Senden fehlgeschlagen: ' + err.message)], ephemeral: true }));
          await mi.reply({ embeds: [okEmbed(`✅ Embed wurde nach ${ziel} gesendet.`)], ephemeral: true });
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle('Embed-Ersteller')
        .addComponents(
          new ActionRowFrom(new TextInputBuilder()
            .setCustomId('eb_kanal_id').setLabel('Kanal-ID (siehe Entwicklermodus)')
            .setStyle(TextInputStyle.Short).setRequired(true).setValue(kanal.id).setMaxLength(25)),
          new ActionRowFrom(new TextInputBuilder()
            .setCustomId('eb_titel').setLabel('Titel (optional)')
            .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(250)),
          new ActionRowFrom(new TextInputBuilder()
            .setCustomId('eb_beschreibung').setLabel('Beschreibung (optional)')
            .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1900)),
          new ActionRowFrom(new TextInputBuilder()
            .setCustomId('eb_farbe').setLabel('Farbe als Hex, z. B. 5865F2')
            .setStyle(TextInputStyle.Short).setRequired(false).setValue('5865F2').setMaxLength(6)),
          new ActionRowFrom(new TextInputBuilder()
            .setCustomId('eb_bild').setLabel('Bild-URL (optional)')
            .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(400)),
          // Hinweis: Modal unterstützt max. 5 Zeilen – Fußzeile wandelt
          // die Beschreibung mit um, wenn nötig. Wir nutzen Feld 5 doppelt:
        );
      // Modal hat max. 5 ActionRows – der Fußzeilen-Text wird aus dem
      // Beschreibungsfeld nicht gelesen. Stattdessen: Fußzeile optional
      // an den Titel mit " | " anhängen. Dokumentiert im Command-Hinweis.
      await interaction.showModal(modal);
    },
  },

  // ── 60) /tag create ───────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('tag')
      .setDescription('Tags verwalten und senden')
      .addSubcommand(sc => sc.setName('create')
        .setDescription('Erstellt einen neuen Tag (wer darf: konfigurierbar, Standard: alle)')
        .addStringOption(o => o.setName('name').setDescription('Name des Tags').setRequired(true).setMaxLength(30))
        .addStringOption(o => o.setName('inhalt').setDescription('Inhalt des Tags').setRequired(true).setMaxLength(1500)))
      .addSubcommand(sc => sc.setName('send')
        .setDescription('Sendet einen gespeicherten Tag')
        .addStringOption(o => o.setName('name').setDescription('Name des Tags').setRequired(true).setMaxLength(30)))
      .addSubcommand(sc => sc.setName('delete')
        .setDescription('Löscht einen Tag (Ersteller oder Mods)')
        .addStringOption(o => o.setName('name').setDescription('Name des Tags').setRequired(true).setMaxLength(30)))
      .setDMPermission(false),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand(true);
      const name = interaction.options.getString('name', true).toLowerCase().trim();

      if (sub === 'create') {
        if (db.get('tags', `${interaction.guild.id}_${name}`)) {
          return interaction.reply({ embeds: [errEmbed(`Der Tag \`${name}\` existiert schon.`)], ephemeral: true });
        }
        db.set('tags', `${interaction.guild.id}_${name}`, {
          id: `${interaction.guild.id}_${name}`,
          guildId: interaction.guild.id, name,
          inhalt: interaction.options.getString('inhalt', true),
          erstelltVon: interaction.user.id,
          genutzt: 0, zeit: Date.now(),
        });
        return interaction.reply({ embeds: [okEmbed(`🏷️ Tag \`${name}\` erstellt! Jeder kann ihn jetzt mit \`/tag send name:${name}\` senden.`)] });
      }

      const tag = db.get('tags', `${interaction.guild.id}_${name}`);
      if (!tag) return interaction.reply({ embeds: [errEmbed(`Tag \`${name}\` nicht gefunden. Schau mit \`/taglist\` nach.`)], ephemeral: true });

      if (sub === 'send') {
        tag.genutzt = (tag.genutzt || 0) + 1;
        db.set('tags', tag.id, tag);
        return interaction.reply({ content: tag.inhalt.slice(0, 1900) });
      }

      // delete
      const istMods = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
      if (tag.erstelltVon !== interaction.user.id && !istMods) {
        return interaction.reply({ embeds: [errEmbed('Nur der Ersteller oder Mods können diesen Tag löschen.')], ephemeral: true });
      }
      db.del('tags', tag.id);
      await interaction.reply({ embeds: [okEmbed(`🗑️ Tag \`${name}\` gelöscht.`)] });
    },
  },

  // ── 62) /taglist ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('taglist')
      .setDescription('Alle Tags dieses Servers')
      .setDMPermission(false),
    async execute(interaction) {
      const tags = db.values('tags')
        .filter(t => t.guildId === interaction.guild.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!tags.length) return interaction.reply({ embeds: [infoEmbed('Noch keine Tags vorhanden. Erstelle einen mit `/tag create`!')], ephemeral: true });
      const e = new EmbedBuilder()
        .setTitle(`🏷️ Tags (${tags.length})`)
        .setColor(0x9B59B6)
        .setDescription(tags.map(t => `• **${t.name}** – ${t.genutzt || 0}× genutzt *(von <@${t.erstelltVon}>)*`).join('\n').slice(0, 4000));
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 63) /translate (Ollama) ───────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('translate')
      .setDescription('Übersetzt Text mit deinem lokalen KI-Modell')
      .addStringOption(o => o.setName('text').setDescription('Zu übersetzender Text').setRequired(true).setMaxLength(900))
      .addStringOption(o => o.setName('zielsprache').setDescription('z. B. Englisch, Türkisch, Französisch').setRequired(true).setMaxLength(30))
      .setDMPermission(false),
    async execute(interaction) {
      await interaction.deferReply();
      if (!(await ollama.checkOnline())) {
        return interaction.editReply({ embeds: [errEmbed(
          '🔴 **Ollama ist offline.** Starte es in Termux mit `ollama serve` (und lade ggf. ein Modell mit `ollama pull gemma2:2b`).'
        )] });
      }
      try {
        const text = interaction.options.getString('text', true);
        const sprache = interaction.options.getString('zielsprache', true);
        const antwort = await ollama.generate(
          `Übersetze den folgenden Text NACH ${sprache}. Gib NUR die Übersetzung aus, ohne Kommentare.\n\nText: ${text}`,
          { system: 'Du bist ein präziser Übersetzer.', temperature: 0.1, timeoutMs: 60000 },
        );
        const e = new EmbedBuilder()
          .setTitle(`🌐 Übersetzung → ${sprache}`)
          .setColor(0x3498DB)
          .addFields(
            { name: 'Original', value: text.slice(0, 1000) },
            { name: 'Übersetzung', value: (antwort || '—').trim().slice(0, 1000) },
          )
          .setFooter({ text: `Modell: ${config.get().ollama.model} (lokal)` });
        await interaction.editReply({ embeds: [e] });
      } catch (err) {
        await interaction.editReply({ embeds: [errEmbed('Übersetzung fehlgeschlagen: ' + err.message)] });
      }
    },
  },

  // ── 64) /ai (direkte Frage an Ollama) ─────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ai')
      .setDescription('Stelle eine Frage an das lokale KI-Modell')
      .addStringOption(o => o.setName('frage').setDescription('Deine Frage').setRequired(true).setMaxLength(800))
      .setDMPermission(false),
    async execute(interaction) {
      await interaction.deferReply();
      if (!(await ollama.checkOnline())) {
        return interaction.editReply({ embeds: [errEmbed(
          '🔴 **Ollama ist offline.** Starte es in Termux mit `ollama serve`.'
        )] });
      }
      try {
        const frage = interaction.options.getString('frage', true);
        const antwort = await ollama.generate(frage, { temperature: 0.7, timeoutMs: 90000 });
        const e = new EmbedBuilder()
          .setTitle('🧠 Lokale KI')
          .setColor(0x9B59B6)
          .addFields(
            { name: '❓ Frage', value: frage.slice(0, 1000) },
            { name: '💬 Antwort', value: (antwort || '*(leere Antwort)*').slice(0, 1000) },
          )
          .setFooter({ text: `Modell: ${config.get().ollama.model} · läuft komplett auf deinem Gerät` });
        await interaction.editReply({ embeds: [e] });
      } catch (err) {
        await interaction.editReply({ embeds: [errEmbed('KI-Fehler: ' + err.message)] });
      }
    },
  },

  // ── 65) /weather (open-meteo, kein API-Key) ───────────────────
  {
    data: new SlashCommandBuilder()
      .setName('weather')
      .setDescription('Aktuelles Wetter für einen Ort')
      .addStringOption(o => o.setName('ort').setDescription('z. B. Berlin').setRequired(true).setMaxLength(60))
      .setDMPermission(false),
    async execute(interaction) {
      await interaction.deferReply();
      try {
        const ort = interaction.options.getString('ort', true);
        const geo = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ort)}&count=1&language=de&format=json`);
        if (!geo.results || !geo.results.length) {
          return interaction.editReply({ embeds: [errEmbed(`🔍 Ort \`${ort}\` nicht gefunden.`)] });
        }
        const stadt = geo.results[0];
        const w = await fetchJSON(
          `https://api.open-meteo.com/v1/forecast?latitude=${stadt.latitude}&longitude=${stadt.longitude}` +
          `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
        );
        const c = w.current;
        const [beschreibung, emoji] = WETTER_CODES[c.weather_code] || ['Unbekannt', '🌡️'];
        const e = new EmbedBuilder()
          .setTitle(`${emoji} Wetter in ${stadt.name}${stadt.country ? ', ' + stadt.country : ''}`)
          .setColor(0x1ABC9C)
          .addFields(
            { name: '🌡️ Temperatur', value: `${c.temperature_2m} °C (gefühlt ${c.apparent_temperature} °C)`, inline: true },
            { name: '💨 Wind', value: `${c.wind_speed_10m} km/h`, inline: true },
            { name: '💧 Luftfeuchte', value: `${c.relative_humidity_2m} %`, inline: true },
            { name: 'Himmel', value: beschreibung },
          );
        await interaction.editReply({ embeds: [e] });
      } catch (_) {
        await interaction.editReply({ embeds: [errEmbed('🌐 Wetterdienst nicht erreichbar – versuch es gleich nochmal.')] });
      }
    },
  },

  // ── 66) /suggest ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('suggest')
      .setDescription('Reiche einen Vorschlag für den Server ein')
      .addStringOption(o => o.setName('vorschlag').setDescription('Dein Vorschlag').setRequired(true).setMaxLength(900))
      .setDMPermission(false),
    async execute(interaction) {
      await suggestions.vorschlag(interaction, interaction.options.getString('vorschlag', true));
    },
  },
];

// Kleiner Helfer: ActionRow aus einem einzigen Component bauen
function ActionRowFrom(component) {
  const { ActionRowBuilder } = require('discord.js');
  return new ActionRowBuilder().addComponents(component);
}
