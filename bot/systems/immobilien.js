// ═══════════════════════════════════════════════════════════════
// IMMOBILIEN: 4 Stufen, tägliche Mieteinnahmen (vom Staat gezahlt).
// ═══════════════════════════════════════════════════════════════
'use strict';
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const staat = require('./staat');
const LISTE = [
  { id: 'bude', name: '🛖 Kleine Bude', preis: 5000, einkommen: 30 },
  { id: 'haus', name: '🏠 Einfamilienhaus', preis: 25000, einkommen: 170 },
  { id: 'pent', name: '🏙️ Penthouse', preis: 100000, einkommen: 700 },
  { id: 'mall', name: '🏬 Einkaufszentrum', preis: 500000, einkommen: 3600 },
];
function doc(gid, uid) {
  const k = gid + '_' + uid;
  let d = db.get('immobilien', k);
  if (!d) { d = { id: k, guildId: gid, userId: uid, besitz: [] }; db.set('immobilien', k, d); }
  return d;
}
async function tick(guild) {
  const s = config.getGuildSettings(guild.id);
  const staatZahlt = s.staat && s.staat.enabled && s.staat.zahlt && s.staat.zahlt.immobilien;
  for (const d of db.values('immobilien')) {
    if (d.guildId !== guild.id || !(d.besitz || []).length) continue;
    let summe = 0;
    for (const id2 of d.besitz) {
      const obj = LISTE.find((x) => x.id === id2);
      if (obj) summe += obj.einkommen;
    }
    if (!summe) continue;
    const gezahlt = staatZahlt ? staat.zahlen(guild.id, summe, 'Immobilien-Miete') : summe;
    if (gezahlt <= 0) continue;
    const eco = economy.getEco(guild.id, d.userId);
    eco.bargeld += gezahlt;
    economy.saveEco(eco);
    economy.transaktion(guild.id, d.userId, 'immobilien', gezahlt, 'Mieteinnahmen');
  }
}
module.exports = { LISTE, doc, tick };
