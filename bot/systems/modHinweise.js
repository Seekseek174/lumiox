'use strict';
const db = require('../../core/db');
const config = require('../../core/config');
const modLog = require('./modLog');
function aktive(gid, userId) {
  const jetzt = Date.now();
  return db.values('mod_hinweise').filter((h) => h.guildId === gid && h.userId === userId && h.laeuftAb > jetzt);
}
async function hinzu(guild, userId, grund, moderator, dauerTage) {
  db.push('mod_hinweise', { guildId: guild.id, userId, grund: String(grund).slice(0, 300), moderator: moderator || 'System', laeuftAb: Date.now() + (dauerTage || 7) * 86400000, zeit: Date.now() });
  await modLog.addEntry(guild, { userId, moderator: moderator || 'System', kategorie: 'Hinweis', schweregrad: 2, grund: 'Hinweis: ' + grund });
  const n = aktive(guild.id, userId).length;
  const s = config.getGuildSettings(guild.id);
  const schwelle = (s.modHinweise && s.modHinweise.bisVerwarnung) || 3;
  if (n >= schwelle) {
    await modLog.addEntry(guild, { userId, moderator: 'Auto-System', kategorie: 'Verwarnung', schweregrad: 4, grund: `${n} Hinweise – automatisch eskaliert` });
    for (const h of aktive(guild.id, userId)) db.del('mod_hinweise', h.id);
    return { hinweise: n, eskaliert: true };
  }
  return { hinweise: n, eskaliert: false };
}
module.exports = { hinzu, aktive };
