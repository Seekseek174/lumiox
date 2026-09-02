'use strict';
const { EmbedBuilder } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
function messwert(guild, ziel) {
  if (ziel.typ === 'mitglieder') return guild.memberCount;
  if (ziel.typ === 'nachrichten') {
    const g = db.get('guilds', guild.id) || {};
    return Object.values(g.tage || {}).reduce((s2, t) => s2 + (t.nachrichtenHeute || 0), 0);
  }
  return db.values('mod_entries').filter((e) => e.guildId === guild.id && e.status === 'erledigt').length;
}
async function pruefe(guild) {
  const ziele = db.values('ziele').filter((z) => z.guildId === guild.id && !z.erreicht);
  for (const z of ziele) {
    const stand = messwert(guild, z);
    z.stand = stand;
    if (stand >= (z.zielWert || 1)) {
      z.erreicht = true; z.erreichtAm = Date.now();
      const s = config.getGuildSettings(guild.id);
      const kanalId = (s.zielTracking && s.zielTracking.kanal) || s.economy.announcementChannel;
      const kanal = kanalId ? guild.channels.cache.get(kanalId) : null;
      if (kanal && kanal.isTextBased()) {
        const e = new EmbedBuilder().setTitle('🎉 SERVER-ZIEL ERREICHT!').setColor(0xF1C40F)
          .setDescription(`**${z.name}**\n${stand.toLocaleString('de-DE')} / ${z.zielWert.toLocaleString('de-DE')} – geschafft! 🏆`);
        await kanal.send({ content: '🎉🎉🎉', embeds: [e] }).catch(() => {});
      }
    }
    db.set('ziele', z.id, z);
  }
}
function fortschritt(gid) { return db.values('ziele').filter((z) => z.guildId === gid).sort((a, b) => (b.erreicht ? 1 : 0) - (a.erreicht ? 1 : 0)); }
module.exports = { pruefe, fortschritt, messwert };
