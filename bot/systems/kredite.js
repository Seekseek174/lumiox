// ═══════════════════════════════════════════════════════════════
// KREDITE: Der Staat ist die Bank. Zinsen/Tag, Auto-Einzug.
// ═══════════════════════════════════════════════════════════════
'use strict';
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const staat = require('./staat');

function doc(gid, uid) {
  const k = gid + '_' + uid;
  let d = db.get('kredite', k);
  if (!d) { d = { id: k, guildId: gid, userId: uid, betrag: 0, letzterZins: '' }; db.set('kredite', k, d); }
  return d;
}
function aufnehmen(gid, uid, betrag) {
  const s = config.getGuildSettings(gid);
  const max = (s.kredit && s.kredit.maxBetrag) || 5000;
  const d = doc(gid, uid);
  if (d.betrag > 0) return { error: 'Du hast bereits einen aktiven Kredit über ' + d.betrag.toLocaleString('de-DE') + ' 🪙.' };
  betrag = Math.max(100, Math.min(max, Math.round(betrag)));
  const st = staat.doc(gid);
  if (st.kasse < betrag) return { error: 'Die Staatskasse hat nicht genug Deckung (' + Math.max(0, Math.floor(st.kasse)).toLocaleString('de-DE') + ' 🪙 verfügbar).' };
  staat.zahlen(gid, betrag, 'Kredit-Auszahlung');
  d.betrag = betrag;
  d.letzterZins = '';
  db.set('kredite', d.id, d);
  const eco = economy.getEco(gid, uid);
  eco.bargeld += betrag;
  economy.saveEco(eco);
  economy.transaktion(gid, uid, 'kredit', betrag, 'Kredit aufgenommen');
  return { ok: true, betrag };
}
async function tick(guild) {
  const s = config.getGuildSettings(guild.id);
  const zins = (s.kredit && s.kredit.zinsProTag) || 2;
  const heute = new Date().toISOString().slice(0, 10);
  for (const k of db.values('kredite')) {
    if (k.guildId !== guild.id || k.betrag <= 0 || k.letzterZins === heute) continue;
    k.letzterZins = heute;
    const zinsen = Math.ceil(k.betrag * zins / 100);
    k.betrag += zinsen;
    const eco = economy.getEco(guild.id, k.userId);
    const vonB = Math.min(eco.bargeld || 0, zinsen);
    eco.bargeld = Math.max(0, (eco.bargeld || 0) - vonB);
    eco.bank = Math.max(0, (eco.bank || 0) - (zinsen - vonB));
    economy.saveEco(eco);
    db.set('kredite', k.id, k);
    await economy.ensureDebtRole(guild, eco).catch(() => {});
  }
}
function zurueckzahlen(gid, uid, betrag) {
  const d = doc(gid, uid);
  if (d.betrag <= 0) return { error: 'Du hast keinen aktiven Kredit.' };
  const eco = economy.getEco(gid, uid);
  betrag = betrag === 'all' ? d.betrag : Math.min(d.betrag, Math.max(1, Math.round(Number(betrag) || 0)));
  if ((eco.bargeld || 0) + (eco.bank || 0) < betrag) return { error: 'So viel hast du nicht (Bargeld + Bank).' };
  const vonB = Math.min(eco.bargeld, betrag);
  eco.bargeld -= vonB;
  eco.bank -= Math.min(eco.bank || 0, betrag - vonB);
  economy.saveEco(eco);
  d.betrag -= betrag;
  if (d.betrag < 0) d.betrag = 0;
  db.set('kredite', d.id, d);
  staat.einzahlen(gid, betrag, 'Kredit-Rückzahlung');
  economy.transaktion(gid, uid, 'kredit_tilgung', -betrag, 'Kredit zurückgezahlt');
  return { ok: true, rest: d.betrag };
}
module.exports = { doc, aufnehmen, tick, zurueckzahlen };
