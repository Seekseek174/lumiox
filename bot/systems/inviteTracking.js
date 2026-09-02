'use strict';
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const logger = require('../../core/logger');
async function init(client) {
  client.on('inviteCreate', (invite) => {
    if (!invite.guild) return;
    db.set('invites', `${invite.guild.id}_${invite.code}`, { guildId: invite.guild.id, code: invite.code, ersteller: invite.inviter ? invite.inviter.id : null, nutzungen: 0, zeit: Date.now() });
  });
  client.on('guildMemberAdd', async (member) => {
    try {
      const gid = member.guild.id;
      const live = await member.guild.invites.fetch().catch(() => null);
      if (!live) return;
      const alle = db.values('invites').filter((x) => x.guildId === gid);
      for (const [, inv] of live) {
        const eintrag = alle.find((a) => a.code === inv.code);
        if (!eintrag || !eintrag.ersteller) continue;
        if (inv.uses > (eintrag.nutzungen || 0)) {
          eintrag.nutzungen = inv.uses;
          db.set('invites', `${gid}_${inv.code}`, eintrag);
          db.set('geworben', `${gid}_${member.id}`, { guildId: gid, von: eintrag.ersteller, zeit: Date.now() });
          const s = config.getGuildSettings(gid);
          const bonus = (s.inviteTracking && s.inviteTracking.bonus) || 100;
          const eco = economy.getEco(gid, eintrag.ersteller);
          eco.bargeld += bonus;
          economy.saveEco(eco);
          const werber = await member.guild.members.fetch(eintrag.ersteller).catch(() => null);
          if (werber) werber.send(`🎉 <@${member.id}> kam durch deinen Invite! +${bonus} ${s.economy.symbol}`).catch(() => {});
          break;
        }
      }
    } catch (e) { logger.debug('Invite: ' + e.message); }
  });
  logger.ok('Invite-Tracking aktiv');
}
function rangliste(gid, limit) {
  const z = new Map();
  for (const g of db.values('geworben')) {
    if (g.guildId !== gid) continue;
    z.set(g.von, (z.get(g.von) || 0) + 1);
  }
  return [...z.entries()].map(([userId, anzahl]) => ({ userId, anzahl })).sort((a, b) => b.anzahl - a.anzahl).slice(0, limit || 10);
}
module.exports = { init, rangliste };
