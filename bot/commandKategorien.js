'use strict';
const { PermissionFlagsBits } = require('discord.js');

const STANDARD = {
  Owner:   ['economy-reset', 'give'],
  Admin:   ['treasury', 'warn', 'warnings', 'clearwarnings', 'mute', 'unmute', 'kick', 'ban',
            'tempban', 'unban', 'softban', 'timeout', 'clear', 'slowmode', 'lock', 'unlock',
            'case', 'caselist', 'givexp', 'xpbooster', 'say', 'embed', 'ticket-panel', 'giveaway'],
  Support: ['close', 'add', 'remove', 'transcript', 'tag'],
  Fun:     ['8ball', 'rps', 'dice', 'ship', 'meme', 'cat', 'dog', 'joke'],
};
const UMGEKEHRT = {};
for (const [kat, liste] of Object.entries(STANDARD)) for (const cmd of liste) UMGEKEHRT[cmd] = kat;

function effektiveKategorie(s, commandName) {
  const ck = s.commandKategorien || {};
  if (ck.zuordnung && ck.zuordnung[commandName]) return ck.zuordnung[commandName];
  return UMGEKEHRT[commandName] || 'Player';
}
function pruefe(s, commandName, member) {
  if (s.commandToggles && s.commandToggles.disabled && s.commandToggles.disabled[commandName]) {
    return `⛔ \`/${commandName}\` ist auf diesem Server derzeit deaktiviert.`;
  }
  const ck = s.commandKategorien || {};
  if (ck.enabled === false) return null;
  const katName = effektiveKategorie(s, commandName);
  const kat = (ck.kategorien || []).find((k) => k && k.name === katName);
  if (!kat) return null;
  if (kat.aus) return `⛔ \`/${commandName}\` ist in der Kategorie **${katName}** deaktiviert.`;
  if (Array.isArray(kat.rollen) && kat.rollen.length) {
    const isAdmin = member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator);
    const hatRolle = member && member.roles && member.roles.cache.some((r) => kat.rollen.includes(r.id));
    if (!isAdmin && !hatRolle) return `⛔ \`/${commandName}\` gehört zur Kategorie **${katName}** – dir fehlt die nötige Rolle.`;
  }
  return null;
}
module.exports = { STANDARD, UMGEKEHRT, effektiveKategorie, pruefe };
