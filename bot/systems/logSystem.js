// ═══════════════════════════════════════════════════════════════
// LOG-SYSTEM: Nachrichten (bearbeitet/gelöscht), Joins/Leaves,
// Rollen-, Kanal- und Voice-Änderungen. Je Kategorie ein eigener
// Zielkanal, im Dashboard zuweisbar.
// Live-Events werden über init(client) angebunden (Scheduler).
// ═══════════════════════════════════════════════════════════════
'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../../core/config');

const FARBEN = {
  nachrichten: 0x3498DB,
  mitglieder: 0x2ECC71,
  rollen: 0x9B59B6,
  kanaele: 0xE67E22,
  voice: 0x1ABC9C,
};

async function log(guild, kategorie, embed) {
  try {
    const s = config.getGuildSettings(guild.id);
    const chId = s.logs.channels[kategorie];
    if (!chId) return;
    const ch = guild.channels.cache.get(chId);
    if (ch && ch.isTextBased()) await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (_) { /* Logs dürfen niemals den Bot zum Absturz bringen */ }
}

function zeit() { return Math.floor(Date.now() / 1000); }

// ── Nachrichten ─────────────────────────────────────────────────
async function nachrichtBearbeitet(alt, neu) {
  if (alt.content === neu.content) return;
  const e = new EmbedBuilder()
    .setTitle('✏️ Nachricht bearbeitet')
    .setColor(FARBEN.nachrichten)
    .setAuthor({ name: alt.author.tag, iconURL: alt.author.displayAvatarURL({ size: 64 }) })
    .addFields(
      { name: 'Kanal', value: `<#${alt.channelId}>`, inline: true },
      { name: 'Zeit', value: `<t:${zeit()}:t>`, inline: true },
      { name: 'Vorher', value: (alt.content || '*leer*').slice(0, 1024) },
      { name: 'Nachher', value: (neu.content || '*leer*').slice(0, 1024) },
    );
  await log(alt.guild, 'nachrichten', e);
}

async function nachrichtGeloescht(msg) {
  const e = new EmbedBuilder()
    .setTitle('🗑️ Nachricht gelöscht')
    .setColor(FARBEN.nachrichten)
    .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL({ size: 64 }) })
    .addFields(
      { name: 'Kanal', value: `<#${msg.channelId}>`, inline: true },
      { name: 'Zeit', value: `<t:${zeit()}:t>`, inline: true },
      { name: 'Inhalt', value: (msg.content || '*kein Text (z. B. nur Anhänge)*').slice(0, 1024) },
    );
  await log(msg.guild, 'nachrichten', e);
}

// ── Mitglieder ──────────────────────────────────────────────────
async function mitgliedBeigetreten(member) {
  const e = new EmbedBuilder()
    .setTitle('📥 Mitglied beigetreten')
    .setColor(FARBEN.mitglieder)
    .setThumbnail(member.user.displayAvatarURL({ size: 64 }))
    .setDescription(`${member.user.tag} (\`${member.id}\`)`)
    .addFields({ name: 'Konto erstellt', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true });
  await log(member.guild, 'mitglieder', e);
}

async function mitgliedVerlassen(member) {
  const e = new EmbedBuilder()
    .setTitle('📤 Mitglied hat den Server verlassen')
    .setColor(FARBEN.mitglieder)
    .setDescription(`${member.user?.tag || member.id} (\`${member.id}\`)`);
  await log(member.guild, 'mitglieder', e);
}

// ── Rollen / Kanäle / Voice (Live-Events) ───────────────────────
function init(client) {
  client.on('guildMemberUpdate', async (alt, neu) => {
    const addiert = neu.roles.cache.filter((r) => !alt.roles.cache.has(r.id));
    const entfernt = alt.roles.cache.filter((r) => !neu.roles.cache.has(r.id));
    if (addiert.size) {
      const e = new EmbedBuilder()
        .setTitle('➕ Rolle hinzugefügt')
        .setColor(FARBEN.rollen)
        .setDescription(`${neu.user.tag}: ${[...addiert.values()].map((r) => r.name).join(', ')}`);
      await log(neu.guild, 'rollen', e);
    }
    if (entfernt.size) {
      const e = new EmbedBuilder()
        .setTitle('➖ Rolle entfernt')
        .setColor(FARBEN.rollen)
        .setDescription(`${neu.user.tag}: ${[...entfernt.values()].map((r) => r.name).join(', ')}`);
      await log(neu.guild, 'rollen', e);
    }
  });

  client.on('channelCreate', async (ch) => {
    if (!ch.guild) return;
    const e = new EmbedBuilder().setTitle('📁 Kanal erstellt').setColor(FARBEN.kanaele)
      .setDescription(`#${ch.name} (\`${ch.id}\`)`);
    await log(ch.guild, 'kanaele', e);
  });
  client.on('channelDelete', async (ch) => {
    if (!ch.guild) return;
    const e = new EmbedBuilder().setTitle('🗑️ Kanal gelöscht').setColor(FARBEN.kanaele)
      .setDescription(`#${ch.name} (\`${ch.id}\`)`);
    await log(ch.guild, 'kanaele', e);
  });
  client.on('channelUpdate', async (alt, neu) => {
    if (alt.name !== neu.name) {
      const e = new EmbedBuilder().setTitle('✏️ Kanal umbenannt').setColor(FARBEN.kanaele)
        .setDescription(`#${alt.name} → #${neu.name}`);
      await log(neu.guild, 'kanaele', e);
    }
  });

  client.on('voiceStateUpdate', async (alt, neu) => {
    if (alt.channelId === neu.channelId) return;
    const member = neu.member;
    if (!member || member.user.bot) return;
    let text;
    if (!alt.channelId && neu.channelId) text = `🔊 **${member.user.tag}** ist <#${neu.channelId}> beigetreten.`;
    else if (alt.channelId && !neu.channelId) text = `🔇 **${member.user.tag}** hat <#${alt.channelId}> verlassen.`;
    else text = `🔀 **${member.user.tag}** wechselte von <#${alt.channelId}> zu <#${neu.channelId}>.`;
    const e = new EmbedBuilder().setDescription(text).setColor(FARBEN.voice);
    await log(neu.guild, 'voice', e);
  });
}

module.exports = {
  init, log, nachrichtBearbeitet, nachrichtGeloescht,
  mitgliedBeigetreten, mitgliedVerlassen,
};
