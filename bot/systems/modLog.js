// ═══════════════════════════════════════════════════════════════
// Mod-Einträge: EIN einheitliches Protokoll für ALLES
// (Verwarnungen, KI-Erkennungen, Wortfilter, Mutes, Bans, Auto-Mod).
// Jeder Eintrag: Nummer, User, Moderator/System, Kategorie,
// Schweregrad 1–10, Begründung, Beweis, Zeit, Status.
// Enthält außerdem die automatische Eskalationsregel.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const logger = require('../../core/logger');
const { getGuildDoc } = require('../../core/utils');

// Neuen Eintrag anlegen. opts:
// { userId, moderator, kategorie, schweregrad, grund, beweis, kanal }
async function addEntry(guild, opts) {
  const nummer = db.counter(`modcase_${guild.id}`);
  const entry = {
    id: db.newId('case_'),
    nummer,
    guildId: guild.id,
    userId: opts.userId,
    moderator: opts.moderator || 'System',
    kategorie: opts.kategorie || 'Sonstiges',
    schweregrad: Math.max(1, Math.min(10, parseInt(opts.schweregrad) || 1)),
    grund: String(opts.grund || 'Kein Grund angegeben').slice(0, 1000),
    beweis: String(opts.beweis || '').slice(0, 1000),
    kanal: opts.kanal || '',
    zeit: Date.now(),
    status: 'offen',
  };
  db.push('mod_entries', entry);

  // Ins konfigurierte Mod-Log-Kanal posten
  try {
    const s = config.getGuildSettings(guild.id);
    if (s.moderation.modLogChannel) {
      const ch = guild.channels.cache.get(s.moderation.modLogChannel);
      if (ch && ch.isTextBased()) {
        const { EmbedBuilder } = require('discord.js');
        const e = new EmbedBuilder()
          .setTitle(`⚖️ Mod-Eintrag #${entry.nummer} · ${entry.kategorie}`)
          .setColor(kategorieFarbe(entry.kategorie))
          .addFields(
            { name: 'Benutzer', value: `<@${entry.userId}> (\`${entry.userId}\`)`, inline: true },
            { name: 'Schweregrad', value: `${entry.schweregrad}/10`, inline: true },
            { name: 'Von', value: entry.moderator.slice(0, 100), inline: true },
            { name: 'Begründung', value: entry.grund.slice(0, 1024) },
          )
          .setTimestamp();
        if (entry.beweis) e.addFields({ name: 'Beweis', value: entry.beweis.slice(0, 1024) });
        await ch.send({ embeds: [e] }).catch(() => {});
      }
    }
  } catch (e) {
    logger.warn('Mod-Log-Kanal: ' + e.message);
  }

  // Eskalationsprüfung (asynchron, darf nicht blockieren)
  checkEscalation(guild, entry).catch((e) => logger.warn('Eskalation: ' + e.message));
  return entry;
}

function kategorieFarbe(kategorie) {
  switch (kategorie) {
    case 'KI-Erkennung':       return 0x9B59B6;
    case 'Wortfilter-Treffer': return 0xE67E22;
    case 'Verwarnung':         return 0xE74C3C;
    case 'Mute':               return 0xF1C40F;
    case 'Ban':                return 0xC0392B;
    case 'Auto-Mod':           return 0x3498DB;
    default:                   return 0x95A5A6;
  }
}

function getEntryById(id) {
  return db.get('mod_entries', id);
}

function getUserEntries(guildId, userId) {
  return db.values('mod_entries')
    .filter((e) => e.guildId === guildId && e.userId === userId)
    .sort((a, b) => a.zeit - b.zeit);
}

function setStatus(entryId, status) {
  const e = db.get('mod_entries', entryId);
  if (!e) return false;
  e.status = status === 'erledigt' ? 'erledigt' : 'offen';
  db.set('mod_entries', entryId, e);
  return true;
}

// Löscht die letzten X Verwarnungen eines Users (für /clearwarnings)
function deleteVerwarnungen(guildId, userId, anzahl) {
  const warns = getUserEntries(guildId, userId)
    .filter((e) => e.kategorie === 'Verwarnung')
    .sort((a, b) => b.zeit - a.zeit); // neueste zuerst
  const zuLoeschen = anzahl ? warns.slice(0, anzahl) : warns;
  for (const w of zuLoeschen) db.del('mod_entries', w.id);
  return zuLoeschen.length;
}

// ── Automatische Eskalation ─────────────────────────────────────
async function checkEscalation(guild, entry) {
  const s = config.getGuildSettings(guild.id);
  const esc = s.moderation.escalation;
  if (!esc || !esc.enabled) return;

  const dok = getGuildDoc(guild.id);
  const jetzt = Date.now();
  const withinMs = (esc.withinHours || 168) * 3600000;

  // Nicht doppelt eskalieren: nach einer Eskalation erst wieder,
  // wenn das Zeitfenster halb abgelaufen ist.
  if (dok.escalation[entry.userId] && jetzt - dok.escalation[entry.userId] < withinMs / 2) return;

  const recent = getUserEntries(guild.id, entry.userId)
    .filter((e) => jetzt - e.zeit <= withinMs);
  if (recent.length < (esc.count || 3)) return;

  dok.escalation[entry.userId] = jetzt;
  db.set('guilds', guild.id, dok);

  const member = await guild.members.fetch(entry.userId).catch(() => null);
  if (!member) return;
  const grund = `Automatische Eskalation: ${recent.length} Einträge in ${esc.withinHours} h`;

  if (esc.action === 'timeout') {
    const dauer = (esc.durationMinutes || 60) * 60000;
    if (member.moderatable) {
      await member.timeout(dauer, grund).catch(() => {});
      await addEntry(guild, {
        userId: entry.userId, moderator: 'Auto-Eskalation', kategorie: 'Auto-Mod',
        schweregrad: 5, grund: `${grund} → Timeout ${esc.durationMinutes} Min.`,
      });
    }
  } else if (esc.action === 'kick') {
    if (member.kickable) {
      await member.kick(grund).catch(() => {});
      await addEntry(guild, {
        userId: entry.userId, moderator: 'Auto-Eskalation', kategorie: 'Auto-Mod',
        schweregrad: 6, grund: `${grund} → Kick`,
      });
    }
  }
}

module.exports = { addEntry, getEntryById, getUserEntries, setStatus, deleteVerwarnungen };
