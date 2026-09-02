// ═══════════════════════════════════════════════════════════════
// WILLKOMMEN: Kanal-Nachricht, DM und Auto-Rolle.
// Variablen: {user} = Erwähnung, {username}, {server}, {count}
// ═══════════════════════════════════════════════════════════════
'use strict';

const config = require('../../core/config');

function ersetze(text, member) {
  return String(text || '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

async function handleJoin(member) {
  const s = config.getGuildSettings(member.guild.id);
  const w = s.welcome;

  // Auto-Rolle
  if (w.autoRole) {
    const rolle = member.guild.roles.cache.get(w.autoRole);
    if (rolle) await member.roles.add(rolle, 'Auto-Rolle (Willkommen)').catch(() => {});
  }
  // Kanal-Nachricht
  if (w.channel) {
    const ch = member.guild.channels.cache.get(w.channel);
    if (ch && ch.isTextBased()) {
      await ch.send({ content: ersetze(w.message, member), allowedMentions: { users: [member.id] } }).catch(() => {});
    }
  }
  // DM (optional)
  if (w.dm) {
    await member.send(ersetze(w.dm, member)).catch(() => {}); // DMs können geschlossen sein -> egal
  }
}

module.exports = { handleJoin, ersetze };
