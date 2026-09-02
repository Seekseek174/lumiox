// ═══════════════════════════════════════════════════════════════
// LEVELSYSTEM
//  - XP pro Nachricht (Basiswert + Cooldown)
//  - Voice-XP pro Minute (Tick vom Scheduler, keine Voice-Events)
//  - Multiplikatoren: Shop-XP-Booster (persönlich), Rollen-Multi-
//    plikatoren, Server-Booster (/xpbooster aus der Serverkasse),
//    Discord-Server-Boost-Stufen
//  - Level-Rollen-Belohnungen (stapelnd oder ersetzend)
//  - Rank-Karte als Embed mit Fortschrittsbalken (bewusste
//    Entscheidung: keine Canvas-Bibliothek – native Module würden
//    in Termux kompiliert werden müssen, siehe README)
// ═══════════════════════════════════════════════════════════════
'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const { progressBar } = require('../../core/utils');

function key(guildId, userId) { return `${guildId}_${userId}`; }

function getLevelDoc(guildId, userId) {
  const id = key(guildId, userId);
  let d = db.get('levels', id);
  if (!d) {
    d = { id, guildId, userId, xp: 0, level: 0, lastXp: 0 };
    db.set('levels', id, d);
  }
  return d;
}

// XP, um von Level l auf l+1 zu kommen
function xpFuerLevel(l) { return Math.floor(100 * Math.pow(l, 1.5)); }

// ── Multiplikatoren sammeln ─────────────────────────────────────
function multiplikatoren(member, guildId, s) {
  let multi = 1;
  const gruende = [];

  // 1) Persönlicher Shop-Booster
  const eco = economy.getEco(guildId, member.id);
  if (eco.boosterBis > Date.now()) { multi *= 2; gruende.push('XP-Booster ×2'); }
  const adminXp = economy.adminBoost(eco, 'xpMulti');
  if (adminXp > 1) { multi *= adminXp; gruende.push('Admin-Boost ×' + adminXp); }

  // 2) Serverweiter Booster (/xpbooster, aus Serverkasse finanziert)
  const dok = db.get('guilds', guildId) || {};
  if (dok.systemBooster && dok.systemBooster.bis > Date.now()) {
    multi *= dok.systemBooster.multi;
    gruende.push(`Server-Booster ×${dok.systemBooster.multi}`);
  }

  // 3) Rollen-Multiplikatoren (im Dashboard konfigurierbar)
  const rm = s.level.roleMultipliers || [];
  for (const r of rm) {
    if (r.roleId && member.roles.cache.has(r.roleId)) { multi *= (r.multi || 1); }
  }

  // 4) Discord-Server-Boost-Stufe
  const tier = guildBoostTier(member.guild);
  if (tier === 1) { multi *= 1.1; gruende.push('Server-Boost Stufe 1 ×1,1'); }
  if (tier === 2) { multi *= 1.2; gruende.push('Server-Boost Stufe 2 ×1,2'); }
  if (tier === 3) { multi *= 1.3; gruende.push('Server-Boost Stufe 3 ×1,3'); }

  return { multi: Math.round(multi * 100) / 100, gruende };
}

function guildBoostTier(guild) {
  try { return guild.premiumTier || 0; } catch (_) { return 0; }
}

// ── XP vergeben ─────────────────────────────────────────────────
async function addXp(member, menge, s) {
  const guild = member.guild;
  const d = getLevelDoc(guild.id, member.id);
  const alt = d.level;
  d.xp += Math.max(0, Math.round(menge));

  // Level-Up-Schleife (auch Mehrfach-Level-Ups)
  let needed = xpFuerLevel(d.level + 1);
  while (d.xp >= needed) {
    d.level++;
    needed = xpFuerLevel(d.level + 1);
  }
  db.set('levels', key(guild.id, member.id), d);

  if (d.level > alt) {
    await applyRoleRewards(member, d.level, s);
    await ankündigung(member, alt, d.level, s);
  }
  return d;
}

async function ankündigung(member, alt, neu, s) {
  const text = `🎉 **${member.user.username}** ist auf **Level ${neu}** aufgestiegen! (vorher: ${alt})`;
  if (s.level.levelupChannel) {
    const ch = member.guild.channels.cache.get(s.level.levelupChannel);
    if (ch && ch.isTextBased()) return ch.send({ content: text }).catch(() => {});
  }
  // Ohne eigenen Kanal: kurz im aktuellen Kanal (falls beschreibbar)
  try {
    const msg = await member.channel?.send?.({ content: text });
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 15000);
  } catch (_) { /* Kanal evtl. geschlossen */ }
}

// Level-Rollen: stapelnd (alle bis zum Level) oder ersetzend (nur höchste)
async function applyRoleRewards(member, level, s) {
  const rewards = (s.level.roleRewards || []).slice().sort((a, b) => a.level - b.level);
  if (!rewards.length) return;
  if (s.level.rewardMode === 'replace') {
    const letzte = rewards.filter((r) => r.level <= level).pop();
    if (!letzte) return;
    const rolle = await resolveRolle(member.guild, letzte.roleName);
    if (!rolle) return;
    for (const r of rewards) {
      const alt = member.guild.roles.cache.find((x) => x.name === r.roleName);
      if (alt && alt.id !== rolle.id && member.roles.cache.has(alt.id)) {
        await member.roles.remove(alt, 'Level-Belohnung (Ersatz-Modus)').catch(() => {});
      }
    }
    if (!member.roles.cache.has(rolle.id)) {
      await member.roles.add(rolle, `Level ${level} erreicht`).catch(() => {});
    }
  } else {
    // Stapel-Modus: alle Rollen bis zum Level behalten
    for (const r of rewards.filter((x) => x.level <= level)) {
      const rolle = await resolveRolle(member.guild, r.roleName);
      if (rolle && !member.roles.cache.has(rolle.id)) {
        await member.roles.add(rolle, `Level ${level} erreicht`).catch(() => {});
      }
    }
  }
}

async function resolveRolle(guild, name) {
  let rolle = guild.roles.cache.find((r) => r.name === name);
  if (!rolle) {
    rolle = await guild.roles.create({ name, reason: 'Level-Belohnung' }).catch(() => null);
  }
  return rolle;
}

// ── Nachrichten-XP (mit Cooldown) ───────────────────────────────
async function handleMessage(message, s) {
  const d = getLevelDoc(message.guild.id, message.author.id);
  const jetzt = Date.now();
  if (jetzt - (d.lastXp || 0) < (s.level.xpCooldownSeconds || 60) * 1000) return;
  d.lastXp = jetzt;
  db.set('levels', d.id, d);

  const { multi } = multiplikatoren(message.member, message.guild.id, s);
  const xp = (s.level.xpPerMessage || 15) * multi;
  await addXp(message.member, xp, s);
}

// ── Voice-XP (Tick vom Scheduler) ───────────────────────────────
async function voiceTick(guild, s) {
  if (!s.level.enabled || !(s.level.voiceXpPerMinute > 0)) return;
  for (const [, ch] of guild.channels.cache) {
    if (!ch.isVoiceBased()) continue;
    const menschen = [...ch.members.values()].filter((m) =>
      !m.user.bot && !m.voice.selfDeaf && !m.voice.serverDeaf && !m.voice.serverMute);
    if (menschen.length < 2) continue; // allein im Voice gibt es keine XP
    for (const m of menschen) {
      await addXp(m, s.level.voiceXpPerMinute, s).catch(() => {});
    }
  }
}

// ── Serverweiter Booster (finanziert aus der Serverkasse) ───────
async function startServerBooster(guildId, multi, dauerMinuten) {
  const dok = db.get('guilds', guildId) || { id: guildId };
  dok.systemBooster = {
    multi, bis: Date.now() + dauerMinuten * 60000,
    gestartetVon: 'Admin',
  };
  db.set('guilds', guildId, dok);
}

// ── Rank-Karte (Embed-Stile: glass / minimal / neon) ────────────
function rankCard(member, s) {
  const d = getLevelDoc(member.guild.id, member.id);
  const needed = xpFuerLevel(d.level + 1);
  const imLevel = d.xp - xpFuerLevel(d.level); // XP innerhalb des Levels
  const benoetigtImLevel = needed - xpFuerLevel(d.level);
  const anteil = benoetigtImLevel > 0 ? imLevel / benoetigtImLevel : 0;
  const stil = s.level.cardStyle || 'glass';

  const styleConfig = {
    glass:   { farbe: 0x5865F2, titel: `🏅 Level-Karte · ${member.user.username}` },
    minimal: { farbe: 0x95A5A6, titel: `${member.user.username} – Rang` },
    neon:    { farbe: 0xE91E63, titel: `⚡ ${member.user.username.toUpperCase()} ⚡` },
  }[stil] || { farbe: 0x5865F2, titel: `🏅 Level-Karte` };

  const { gruende } = multiplikatoren(member, member.guild.id, s);
  const e = new EmbedBuilder()
    .setTitle(styleConfig.titel)
    .setColor(styleConfig.farbe)
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: 'Level', value: `**${d.level}**`, inline: true },
      { name: 'XP gesamt', value: `${d.xp.toLocaleString('de-DE')}`, inline: true },
      { name: 'Nächstes Level', value: `${needed.toLocaleString('de-DE')} XP`, inline: true },
      {
        name: 'Fortschritt',
        value: `${progressBar(anteil)} ${Math.round(anteil * 100)} %\n` +
               `\`${imLevel.toLocaleString('de-DE')} / ${benoetigtImLevel.toLocaleString('de-DE')} XP\``,
      },
    );
  if (gruende.length) e.addFields({ name: 'Aktive Multiplikatoren', value: gruende.join(', ') });
  return e;
}

module.exports = {
  getLevelDoc, xpFuerLevel, multiplikatoren, addXp,
  handleMessage, voiceTick, startServerBooster, rankCard,
};
