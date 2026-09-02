// Beitritt: Willkommen + Auto-Rolle + Anti-Raid + Log
'use strict';

const welcome = require('../systems/welcome');
const automod = require('../systems/automod');
const logSystem = require('../systems/logSystem');
const { getGuildDoc, bumpStat } = require('../../core/utils');

module.exports = async function guildMemberAdd(member) {
  const dok = getGuildDoc(member.guild.id);
  dok.mitglieder = member.guild.memberCount;
  db_save(member.guild.id, dok);

  bumpStat(member.guild.id, 'joinsHeute', 1);
  automod.handleJoin(member);           // Anti-Raid zählt Joins
  await welcome.handleJoin(member);
  try { const s3 = require('../../core/config').getGuildSettings(member.guild.id); if (s3.staat && s3.staat.enabled && s3.staat.zahlt && s3.staat.zahlt.start) require('../systems/staat').zahlen(member.guild.id, s3.economy.startBalance || 250, 'Startguthaben'); } catch (_) {} // STAAT-START     // Nachricht, DM, Auto-Rolle
  logSystem.mitgliedBeigetreten(member);

  // STUDIO-SYSTEME: user-definierte Trigger ausführen
  try {
    const blockEngine = require('../systems/blockEngine');
    const systeme = require('../../core/db').values('studio_systeme')
      .filter((sy) => sy.guildId === member.guild.id && sy.trigger === 'memberJoin');
    for (const sy of systeme) {
      await blockEngine.fuehreSystemAus(sy, { member, guild: member.guild, user: member.user, channel: null }).catch(() => {});
    }
  } catch (_) {} // STUDIO-SYSTEME
};

function db_save(guildId, dok) {
  require('../../core/db').set('guilds', guildId, dok);
}
