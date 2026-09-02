// ═══════════════════════════════════════════════════════════════
// AUTO-MOD & SCHUTZ
//  - Invite-Filter, Link-Filter (Whitelist), CAPS-Limit,
//    Emoji-Spam, Mention-Spam, Nachrichten-Spam
//  - Anti-Raid (X Joins in Y Sekunden → Schutzmodus mit Auto-Kick)
//  - Anti-Nuke-Wache (Massen-Kanallöschungen / Rollenänderungen)
// Jede Regel einzeln schaltbar, mit Aktion und Eintrag-ja/nein.
// Die Live-Events für Anti-Nuke werden über init(client) angebunden
// (aufgerufen vom zentralen Scheduler).
// ═══════════════════════════════════════════════════════════════
'use strict';

const { PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const modLog = require('./modLog');
const logger = require('../../core/logger');

const INVITE_REGEX = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[\w-]+/i;
const LINK_REGEX = /https?:\/\/[^\s]+/i;
const EMOJI_REGEX = /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|<(a)?:\w+:\d+>)/gu;

// RAM-schonende Verläufe (regelmäßig geleert)
const msgVerlauf = new Map();  // "gid_uid" -> [Zeitstempel]
const joinVerlauf = new Map(); // gid -> [{ zeit, id }]
const nukeVerlauf = new Map(); // gid -> { kanal: [], rollen: [] }

function whitelisted(member, s) {
  if (!member) return true;
  if ((s.automod.whitelistUsers || []).includes(member.id)) return true;
  if ((s.automod.whitelistRoles || []).some((r) => member.roles.cache.has(r))) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true; // Mods nicht filtern
  return false;
}

// Einheitliche Ausführung einer Auto-Mod-Aktion
async function ausfuehren(message, regel, cfg, grund, schweregrad, zensurText = null) {
  const aktion = cfg.aktion || 'loeschen';
  if (aktion === 'zensieren' && zensurText !== null) {
    await message.delete().catch(() => {});
    await message.channel.send({
      content: `**${message.author.username}:** ${zensurText.slice(0, 1800)}`,
      allowedMentions: { parse: [] },
    }).catch(() => {});
  } else if (aktion === 'timeout' && message.member && message.member.moderatable) {
    await message.member.timeout(5 * 60000, 'Auto-Mod: ' + grund).catch(() => {});
    await message.delete().catch(() => {});
  } else {
    await message.delete().catch(() => {});
  }
  if (cfg.eintrag && message.member) {
    modLog.addEntry(message.guild, {
      userId: message.member.id,
      moderator: 'Auto-Mod',
      kategorie: 'Auto-Mod',
      schweregrad,
      grund: `[${regel}] ${grund}`,
      beweis: (message.content || '').slice(0, 500),
      kanal: message.channel.name,
    }).catch(() => {});
  }
  const hinweis = await message.channel.send({
    content: `🛡️ **Auto-Mod** (${regel}): ${grund} – <@${message.author.id}>`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (hinweis) setTimeout(() => hinweis.delete().catch(() => {}), 8000);
}

function capsProzent(text) {
  const buchstaben = text.replace(/[^a-zA-ZäöüÄÖÜ]/g, '');
  if (buchstaben.length === 0) return 0;
  const gross = buchstaben.replace(/[^A-ZÄÖÜ]/g, '').length;
  return Math.round((gross / buchstaben.length) * 100);
}

function erlaubteDomain(text, whitelist) {
  if (!whitelist || !whitelist.length) return false;
  const funde = text.match(/https?:\/\/([^/\s]+)/gi) || [];
  return funde.every((f) => whitelist.some((d) => f.toLowerCase().includes(d.toLowerCase())));
}

function spamCheck(guildId, userId, limit, sekunden) {
  const key = `${guildId}_${userId}`;
  const jetzt = Date.now();
  const list = (msgVerlauf.get(key) || []).filter((t) => jetzt - t <= sekunden * 1000);
  list.push(jetzt);
  msgVerlauf.set(key, list);
  return list.length > limit;
}

// ── Nachrichten-Regeln ──────────────────────────────────────────
async function handleMessage(message, s) {
  if (whitelisted(message.member, s)) return false;
  const am = s.automod;
  const inhalt = message.content || '';

  // 1) Invite-Filter
  if (am.inviteFilter.enabled && INVITE_REGEX.test(inhalt)) {
    await ausfuehren(message, 'Invite-Filter', am.inviteFilter, 'Discord-Einladungslinks sind hier nicht erlaubt.', 4);
    return true;
  }
  // 2) Link-Filter mit Whitelist
  if (am.linkFilter.enabled && LINK_REGEX.test(inhalt) && !erlaubteDomain(inhalt, am.linkFilter.whitelist)) {
    await ausfuehren(message, 'Link-Filter', am.linkFilter, 'Links sind hier nicht erlaubt.', 3);
    return true;
  }
  // 3) CAPS-Limit
  if (am.capsLimit.enabled &&
      inhalt.length >= (am.capsLimit.minLength || 12) &&
      capsProzent(inhalt) > (am.capsLimit.percent || 70)) {
    const aktion = am.capsLimit.aktion;
    if (aktion === 'zensieren') {
      await ausfuehren(message, 'CAPS-Limit', am.capsLimit, 'Zu viele Großbuchstaben.', 2, inhalt.toLowerCase());
    } else {
      await ausfuehren(message, 'CAPS-Limit', am.capsLimit, 'Zu viele Großbuchstaben.', 2);
    }
    return true;
  }
  // 4) Emoji-Spam
  if (am.emojiSpam.enabled) {
    const em = inhalt.match(EMOJI_REGEX);
    if (em && em.length > (am.emojiSpam.limit || 10)) {
      await ausfuehren(message, 'Emoji-Spam', am.emojiSpam, `Zu viele Emojis (${em.length}).`, 2);
      return true;
    }
  }
  // 5) Mention-Spam
  if (am.mentionSpam.enabled) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (mentions > (am.mentionSpam.limit || 6)) {
      await ausfuehren(message, 'Mention-Spam', am.mentionSpam, `Zu viele Erwähnungen (${mentions}).`, 5);
      return true;
    }
  }
  // 6) Nachrichten-Spam
  if (am.messageSpam.enabled &&
      spamCheck(message.guild.id, message.author.id, am.messageSpam.messages || 6, am.messageSpam.withinSeconds || 8)) {
    if (am.messageSpam.aktion === 'timeout' && message.member && message.member.moderatable) {
      await message.member.timeout((am.messageSpam.timeoutMinutes || 5) * 60000, 'Auto-Mod: Nachrichten-Spam').catch(() => {});
    }
    await message.delete().catch(() => {});
    if (am.messageSpam.eintrag) {
      modLog.addEntry(message.guild, {
        userId: message.author.id, moderator: 'Auto-Mod', kategorie: 'Auto-Mod',
        schweregrad: 4, grund: `[Nachrichten-Spam] Zu viele Nachrichten in kurzer Zeit`,
        kanal: message.channel.name,
      }).catch(() => {});
    }
    return true;
  }
  return false;
}

// ── Anti-Raid (Joins) ───────────────────────────────────────────
async function handleJoin(member) {
  const s = config.getGuildSettings(member.guild.id);
  const ar = s.automod.antiRaid;
  const dok = db.get('guilds', member.guild.id) || { id: member.guild.id };
  dok.schutzmodus = dok.schutzmodus || { aktiv: false, bis: 0 };

  const jetzt = Date.now();
  const list = (joinVerlauf.get(member.guild.id) || []).filter((j) => jetzt - j.zeit <= (ar.withinSeconds || 30) * 1000);
  list.push({ zeit: jetzt, id: member.id });
  joinVerlauf.set(member.guild.id, list);

  // Schutzmodus aktivieren?
  if (ar.enabled && !dok.schutzmodus.aktiv && list.length >= (ar.joins || 8)) {
    dok.schutzmodus = { aktiv: true, bis: jetzt + 10 * 60000 };
    db.set('guilds', member.guild.id, dok);
    const s2 = config.getGuildSettings(member.guild.id);
    const logCh = s2.moderation.modLogChannel ? member.guild.channels.cache.get(s2.moderation.modLogChannel) : null;
    if (logCh && logCh.isTextBased()) {
      await logCh.send({
        content: `🚨 **ANTI-RAID:** ${list.length} Beitritte in ${ar.withinSeconds}s! Schutzmodus für 10 Min. aktiv – neue Joins werden gekickt.`,
      }).catch(() => {});
    }
    modLog.addEntry(member.guild, {
      userId: member.id, moderator: 'Anti-Raid', kategorie: 'Auto-Mod', schweregrad: 8,
      grund: `Raid vermutet: ${list.length} Joins in ${ar.withinSeconds}s → Schutzmodus aktiviert`,
    }).catch(() => {});
    return;
  }

  // Im Schutzmodus: neue Joins automatisch kicken
  if (ar.enabled && dok.schutzmodus.aktiv) {
    if (jetzt > dok.schutzmodus.bis) {
      dok.schutzmodus.aktiv = false;
      db.set('guilds', member.guild.id, dok);
    } else if (member.kickable) {
      await member.kick('Anti-Raid-Schutzmodus aktiv').catch(() => {});
    }
  }
}

// ── Anti-Nuke-Wache ─────────────────────────────────────────────
async function letzterAusfuehrer(guild, typ) {
  try {
    const logs = await guild.fetchAuditLogs({ type: typ, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 60000) return entry.executor;
  } catch (_) { /* keine Rechte für Audit-Logs -> Wache still deaktiviert */ }
  return null;
}

async function nukeCheck(guild, art) {
  const s = config.getGuildSettings(guild.id);
  const an = s.automod.antiNuke;
  if (!an || !an.enabled) return;
  const staat = nukeVerlauf.get(guild.id) || { kanal: [], rollen: [] };
  const jetzt = Date.now();
  const fenster = (an.withinMinutes || 10) * 60000;
  staat[art] = (staat[art] || []).filter((t) => jetzt - t <= fenster);
  staat[art].push(jetzt);
  nukeVerlauf.set(guild.id, staat);

  const grenze = art === 'kanal' ? (an.channelDeletes || 3) : (an.roleChanges || 4);
  if (staat[art].length >= grenze) {
    staat[art] = []; // zurücksetzen, nicht alle 10 s neu alarmieren
    const logCh = s.moderation.modLogChannel ? guild.channels.cache.get(s.moderation.modLogChannel) : null;
    if (logCh && logCh.isTextBased()) {
      const ping = s.moderation.modRole ? `<@&${s.moderation.modRole}> ` : '';
      await logCh.send({
        content: `${ping}🚨 **ANTI-NUKE-WACHE:** Verdächtig viele ${art === 'kanal' ? 'Kanallöschungen' : 'Rollenänderungen'} in kurzer Zeit! Bitte sofort prüfen.`,
        allowedMentions: { roles: s.moderation.modRole ? [s.moderation.modRole] : [] },
      }).catch(() => {});
    }
  }
}

function init(client) {
  client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const täter = await letzterAusfuehrer(channel.guild, 12); // 12 = CHANNEL_DELETE
    if (täter) {
      await nukeCheck(channel.guild, 'kanal').catch(() => {});
      const s = config.getGuildSettings(channel.guild.id);
      if (s.automod.antiNuke.enabled && s.automod.antiNuke.eintrag !== false && täter.id !== client.user.id) {
        modLog.addEntry(channel.guild, {
          userId: täter.id, moderator: 'Anti-Nuke', kategorie: 'Auto-Mod', schweregrad: 6,
          grund: `Kanal gelöscht: #${channel.name}`,
        }).catch(() => {});
      }
    }
  });
  client.on('roleDelete', async (role) => {
    const täter = await letzterAusfuehrer(role.guild, 32); // 32 = ROLE_DELETE
    if (täter) await nukeCheck(role.guild, 'rollen').catch(() => {});
  });
  client.on('roleUpdate', async (alt, neu) => {
    const täter = await letzterAusfuehrer(neu.guild, 31); // 31 = ROLE_UPDATE
    if (täter) await nukeCheck(neu.guild, 'rollen').catch(() => {});
  });
  // Verläufe alle 10 Minuten leeren (RAM-Hygiene)
  const t = setInterval(() => {
    msgVerlauf.clear();
    joinVerlauf.clear();
    nukeVerlauf.clear();
  }, 600000);
  if (t.unref) t.unref();
  logger.debug('Auto-Mod-Überwachung aktiv.');
}

module.exports = { handleMessage, handleJoin, init };
