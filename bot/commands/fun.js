// ═══════════════════════════════════════════════════════════════
// FUN – Commands 43 bis 50
// Bilder/Memes nutzen freie APIs ohne API-Key, alle mit
// try/catch + deutscher Fehlermeldung bei Ausfall.
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { okEmbed, errEmbed, progressBar } = require('../../core/utils');

const ANTWORTEN_8BALL = [
  'Es ist sicher.', 'Auf jeden Fall!', 'Ohne Zweifel.', 'Ja, definitiv!',
  'Verlass dich darauf.', 'Sieht gut aus.', 'Ja!', 'Zeichen deuten auf Ja.',
  'Hmm… frag später nochmal.', 'Besser nicht verraten. 🤫', 'Konzentrier dich und frag erneut.',
  'Zweifelhaft…', 'Meine Antwort ist Nein.', 'Meine Quellen sagen Nein.',
  'Sieht nicht gut aus.', 'Sehr bezweifel ich das. 😬',
];
const WITZE = [
  'Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht!',
  'Treffen sich zwei Server im Internet. Sagt der eine: „404 – Treffer nicht gefunden.“',
  'Was macht ein Pirat am Computer? Er drückt die Enter-Taste!',
  'Warum ging der Pilz auf die Party? Weil er ein Champignon war! 🍄',
  'Ich hätte einen Witz über UDP… aber du kriegst ihn vielleicht nicht.',
  'Was ist grün und klopft an die Tür? Ein Klopfsalat!',
  'Wie nennt man einen Bumerang, der nicht zurückkommt? Stock.',
  '99 kleine Programmierer debuggten den Code, 99 kleine Programmierer… einer fand den Fehler, dann waren es 127 kleine Programmierer.',
];
const SHIP_TEXTE = [
  'Perfektes Match! Ihr gehört zusammen! 💍', 'Echte Seelenverwandtschaft! ✨',
  'Ziemlich gute Chemie dazwischen! ⚗️', 'Solide Sache – könnte klappen! 😊',
  'Nun ja… Freundschaft ist auch schön. 🤝', 'Eher schwierig… aber nie sagen nie! 🙃',
  'Hmm… vielleicht in einem anderen Universum? 👽', 'Katastrophe! Bloß nicht! 🚨',
];

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

module.exports = [
  // ── 43) /8ball ────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('8ball')
      .setDescription('Stelle dem magischen Zauberkugel-Bot eine Ja/Nein-Frage')
      .addStringOption(o => o.setName('frage').setDescription('Deine Frage').setRequired(true).setMaxLength(200))
      .setDMPermission(false),
    async execute(interaction) {
      const frage = interaction.options.getString('frage', true);
      const antwort = ANTWORTEN_8BALL[Math.floor(Math.random() * ANTWORTEN_8BALL.length)];
      const e = new EmbedBuilder()
        .setTitle('🎱 Zauberkugel')
        .setColor(0x2C2F33)
        .addFields(
          { name: 'Frage', value: frage },
          { name: 'Antwort', value: `**${antwort}**` },
        );
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 44) /rps ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('rps')
      .setDescription('Schere-Stein-Papier – gegen einen User oder den Bot')
      .addUserOption(o => o.setName('user').setDescription('Gegen wen? (leer = gegen den Bot)'))
      .setDMPermission(false),
    async execute(interaction) {
      const gegner = interaction.options.getUser('user');
      const auswahl = { stein: '🪨', papier: '📄', schere: '✂️' };

      // Gegen den Bot: sofort auswerten
      if (!gegner || gegner.id === interaction.client.user.id) {
        const nutzer = ['stein', 'papier', 'schere'][Math.floor(Math.random() * 3)];
        const bot = ['stein', 'papier', 'schere'][Math.floor(Math.random() * 3)];
        let ergebnis;
        if (nutzer === bot) ergebnis = '🤝 Unentschieden!';
        else if (
          (nutzer === 'stein' && bot === 'schere') ||
          (nutzer === 'papier' && bot === 'stein') ||
          (nutzer === 'schere' && bot === 'papier')
        ) ergebnis = '🎉 Du gewinnst!';
        else ergebnis = '🤖 Ich gewinne!';
        const e = new EmbedBuilder()
          .setTitle('✂️ Schere-Stein-Papier')
          .setColor(0xE91E63)
          .setDescription(`${interaction.user} ${auswahl[nutzer]} **VS** ${auswahl[bot]} 🤖\n\n**${ergebnis}**`);
        return interaction.reply({ embeds: [e] });
      }

      // Gegen einen User: beide wählen per Button, Auswahl wird geheim gehalten
      if (gegner.bot) return interaction.reply({ embeds: [errEmbed('Bots spielen nicht mit. 😄')], ephemeral: true });
      const wahlen = new Map();
      const zeile = new ActionRowBuilder().addComponents(
        ...['stein', 'papier', 'schere'].map(w =>
          new ButtonBuilder().setCustomId(`rps_${w}`).setLabel(w[0].toUpperCase() + w.slice(1)).setEmoji(auswahl[w]).setStyle(ButtonStyle.Secondary)),
      );
      const msg = await interaction.reply({ content: `🎮 **${interaction.user}** vs. **${gegner}** – beide klicken unten!`, components: [zeile], fetchReply: true });

      const handler = async (btn) => {
        if (btn.message.id !== msg.id) return;
        if (btn.user.id !== interaction.user.id && btn.user.id !== gegner.id) {
          return btn.reply({ content: 'Nur die beiden Spieler können klicken!', ephemeral: true });
        }
        wahlen.set(btn.user.id, btn.customId.replace('rps_', ''));
        await btn.reply({ content: '🤫 Deine Wahl ist gespeichert!', ephemeral: true });
        if (wahlen.size < 2) return;
        interaction.client.removeListener('interactionCreate', handler);
        const [a, b] = [wahlen.get(interaction.user.id), wahlen.get(gegner.id)];
        let ergebnis;
        if (a === b) ergebnis = '🤝 Unentschieden!';
        else if ((a === 'stein' && b === 'schere') || (a === 'papier' && b === 'stein') || (a === 'schere' && b === 'papier')) ergebnis = `🎉 **${interaction.user.username} gewinnt!**`;
        else ergebnis = `🎉 **${gegner.username} gewinnt!**`;
        await msg.edit({
          content: `✂️ **${interaction.user}** ${auswahl[a]} VS ${auswahl[b]} **${gegner}**\n\n**${ergebnis}**`,
          components: [],
        }).catch(() => {});
      };
      interaction.client.on('interactionCreate', handler);
      // Aufräumen nach 2 Minuten
      setTimeout(() => {
        interaction.client.removeListener('interactionCreate', handler);
        msg.edit({ components: [] }).catch(() => {});
      }, 120000);
    },
  },

  // ── 45) /dice ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('dice')
      .setDescription('Wirf einen Würfel (Standard: 6 Seiten)')
      .addIntegerOption(o => o.setName('seiten').setDescription('Anzahl Seiten (2–120)').setMinValue(2).setMaxValue(120))
      .setDMPermission(false),
    async execute(interaction) {
      const seiten = interaction.options.getInteger('seiten') || 6;
      const erg = Math.floor(Math.random() * seiten) + 1;
      const emoji = seiten === 6 ? ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][erg - 1] + ' ' : '🎲 ';
      await interaction.reply({ content: `${emoji}Du hast eine **${erg}** gewürfelt (1–${seiten}).` });
    },
  },

  // ── 46) /ship ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ship')
      .setDescription('Wie gut passen zwei Benutzer zusammen?')
      .addUserOption(o => o.setName('user1').setDescription('Person 1').setRequired(true))
      .addUserOption(o => o.setName('user2').setDescription('Person 2 (leer = du + Person 1)'))
      .setDMPermission(false),
    async execute(interaction) {
      const u1 = interaction.options.getUser('user1', true);
      const u2 = interaction.options.getUser('user2') || interaction.user;
      // "Zufall" mit solidem Hash -> gleiche Paare bekommen immer denselben Wert
      const hash = [...(u1.id + u2.id)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 7);
      const prozent = Math.abs(hash) % 101;
      const text = SHIP_TEXTE[Math.min(SHIP_TEXTE.length - 1, Math.floor((100 - prozent) / 12.5))];
      const e = new EmbedBuilder()
        .setTitle('💕 Ship-Meter')
        .setColor(prozent >= 50 ? 0xE91E63 : 0x95A5A6)
        .setDescription(
          `**${u1.username}** 💞 **${u2.username}**\n\n` +
          `${progressBar(prozent / 100, 14)} **${prozent} %**\n\n${text}`
        );
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 47) /meme ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('meme')
      .setDescription('Zufälliges Meme aus dem Netz')
      .setDMPermission(false),
    async execute(interaction) {
      await interaction.deferReply();
      try {
        const data = await fetchJSON('https://meme-api.com/gimme');
        const e = new EmbedBuilder()
          .setTitle(data.title || 'Meme').setColor(0xFF9800)
          .setImage(data.url).setFooter({ text: `r/${data.subreddit} · 👍 ${data.ups || '?'}` });
        await interaction.editReply({ embeds: [e] });
      } catch (_) {
        await interaction.editReply({ embeds: [errEmbed('🌐 Der Meme-Server ist gerade nicht erreichbar. Versuch es gleich nochmal!')] });
      }
    },
  },

  // ── 48) /cat ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('cat')
      .setDescription('Zufälliges Katzenbild 🐱')
      .setDMPermission(false),
    async execute(interaction) {
      await interaction.deferReply();
      try {
        // cataas.com liefert direkt ein Bild – Timestamp verhindert Browser-Cache
        const e = new EmbedBuilder().setTitle('🐱 Miau!').setColor(0xF39C12)
          .setImage(`https://cataas.com/cat?${Date.now()}`);
        await interaction.editReply({ embeds: [e] });
      } catch (_) {
        await interaction.editReply({ embeds: [errEmbed('🐱 Keine Katze gefunden – die Bilderquelle antwortet nicht.')] });
      }
    },
  },

  // ── 49) /dog ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('dog')
      .setDescription('Zufälliges Hündebild 🐶')
      .setDMPermission(false),
    async execute(interaction) {
      await interaction.deferReply();
      try {
        const data = await fetchJSON('https://dog.ceo/api/breeds/image/random');
        const e = new EmbedBuilder().setTitle('🐶 Wuff!').setColor(0xD35400)
          .setImage(data.message);
        await interaction.editReply({ embeds: [e] });
      } catch (_) {
        await interaction.editReply({ embeds: [errEmbed('🐶 Kein Hund gefunden – die Bilderquelle antwortet nicht.')] });
      }
    },
  },

  // ── 50) /joke ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('joke')
      .setDescription('Ein Witz zum Lachen (funktioniert auch offline)')
      .setDMPermission(false),
    async execute(interaction) {
      const witz = WITZE[Math.floor(Math.random() * WITZE.length)];
      const e = new EmbedBuilder().setTitle('😄 Witz des Tages').setColor(0x2ECC71).setDescription(witz);
      await interaction.reply({ embeds: [e] });
    },
  },
];
