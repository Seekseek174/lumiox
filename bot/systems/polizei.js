// ═══════════════════════════════════════════════════════════════
// POLIZEIWACHE: Rolle, Förderung, Gehalt, Fangquote, Belohnungen.
// ═══════════════════════════════════════════════════════════════
'use strict';
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const staat = require('./staat');

function einstellungen(gid) { return config.getGuildSettings(gid).polizei || {}; }
function istPolizist(member) {
  const rolle = einstellungen(member.guild.id).rolle;
  return !!(rolle && member.roles && member.roles.cache.has(rolle));
}
function fangChance(gid) { return staat.fangChance(gid); }

async function gehaltTick(guild) {
  const s = einstellungen(guild.id);
  if (!s.rolle || !s.gehalt) return;
  const st = staat.doc(guild.id);
  const heute = new Date().toISOString().slice(0, 10);
  if (st.lastGehalt === heute) return;
  st.lastGehalt = heute;
  const offiziere = guild.members.cache.filter((m) => !m.user.bot && m.roles.cache.has(s.rolle));
  if (!offiziere.size) { db.set('staat', guild.id, st); return; }
  let gezahlt = 0;
  for (const [, m] of offiziere) {
    if (st.wacheKasse < s.gehalt) break;
    st.wacheKasse -= s.gehalt;
    const eco = economy.getEco(guild.id, m.id);
    eco.bargeld += s.gehalt;
    economy.saveEco(eco);
    gezahlt++;
  }
  db.set('staat', guild.id, st);
  if (gezahlt) require('../../core/logger').info(`Polizei-Gehalt (${guild.name}): ${gezahlt} Offiziere bezahlt`);
}

async function belohnen(guild, betrag) {
  const s = einstellungen(guild.id);
  if (!s.rolle) return;
  const offiziere = guild.members.cache.filter((m) => !m.user.bot && m.roles.cache.has(s.rolle));
  const anteil = Math.floor(betrag * 0.3 / Math.max(1, offiziere.size));
  for (const [, m] of offiziere) {
    const eco = economy.getEco(guild.id, m.id);
    eco.bargeld += anteil;
    economy.saveEco(eco);
  }
}

module.exports = { einstellungen, istPolizist, fangChance, gehaltTick, belohnen };
