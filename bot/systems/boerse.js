// ═══════════════════════════════════════════════════════════════
// BÖRSE v2: flexibles Update-Intervall + Geheim-Manipulation
// (Sprung hoch/runter oder vordefinierter Pfad mit D/H/M/S-Dauer)
// ═══════════════════════════════════════════════════════════════
'use strict';
const db = require('../../core/db');
const logger = require('../../core/logger');
const LISTE = [
  { sym: 'BTC', name: 'Bitcoin', basis: 25000, btc: true },
  { sym: 'LUMX', name: 'Lumiox Corp', basis: 100 },
  { sym: 'MEME', name: 'Meme Industries', basis: 45 },
  { sym: 'PIZA', name: 'Pizza Dynamics', basis: 30 },
  { sym: 'ROKT', name: 'Rocket Labs', basis: 75 },
  { sym: 'GEIST', name: 'Ghost Systems', basis: 60 },
];
function alleAktien(gid) {
  const d = doc(gid);
  const eigene = (d.customAktien || []).map((c) => ({
    sym: c.sym, name: c.name, basis: c.basis, custom: true, autoUpdate: c.autoUpdate !== false,
    crypto: !!c.crypto, supply: c.supply || 0, verfuegbar: c.verfuegbar != null ? c.verfuegbar : (c.supply || 0),
  }));
  return [...LISTE.map((a) => ({ ...a, autoUpdate: a.autoUpdate !== false })), ...eigene];
}
function aktieHinzufuegen(gid, sym, name, basis, von, crypto = false, supply = 0) {
  const d = doc(gid);
  sym = String(sym).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!sym) return { error: 'Ungültiges Symbol.' };
  if (alleAktien(gid).some((a) => a.sym === sym)) return { error: 'Symbol existiert schon.' };
  d.customAktien = d.customAktien || [];
  d.customAktien.push({ sym, name: String(name || sym).slice(0, 40), basis: Math.max(1, Number(basis) || 10), autoUpdate: true, von: von || 'Geheim', crypto: !!crypto, supply: crypto ? Math.max(1, Math.round(Number(supply) || 1000)) : 0, verfuegbar: crypto ? Math.max(1, Math.round(Number(supply) || 1000)) : 0 });
  d.kurse[sym] = d.customAktien[d.customAktien.length - 1].basis;
  d.alt[sym] = d.kurse[sym];
  d.letzteAenderung = Date.now(); d.von = von || 'Geheim';
  db.set('boerse', gid, d);
  logger.warn('BÖRSE: Neue Aktie: ' + sym + ' (von ' + (von || 'Geheim') + ')');
  return { ok: true, sym };
}
function aktieLoeschen(gid, sym) {
  const d = doc(gid);
  d.customAktien = (d.customAktien || []).filter((c) => c.sym !== sym);
  delete d.kurse[sym]; delete d.alt[sym];
  db.set('boerse', gid, d);
  return true;
}
function autoUpdateSetzen(gid, sym, auto) {
  const d = doc(gid);
  const c = (d.customAktien || []).find((x) => x.sym === sym);
  if (c) { c.autoUpdate = !!auto; db.set('boerse', gid, d); return true; }
  return false;
}

function doc(gid) {
  let d = db.get('boerse', gid);
  if (!d) {
    d = { id: gid, guildId: gid, kurse: {}, alt: {}, intervallSek: 3600, lastTick: 0,
          pfad: null, pfadSchritt: 0, letzteAenderung: 0, von: '', customAktien: [] };
    for (const a of LISTE) { d.kurse[a.sym] = a.basis; d.alt[a.sym] = a.basis; }
    db.set('boerse', gid, d);
  }
  if (!d.intervallSek) d.intervallSek = 3600;
  return d;
}
function kurse(gid) { return doc(gid).kurse; }
function depot(gid, uid) {
  const k = gid + '_' + uid;
  let d = db.get('depots', k);
  if (!d) { d = { id: k, guildId: gid, userId: uid, anteile: {} }; db.set('depots', k, d); }
  return d;
}
// Manipulation: sofortiger Sprung
function manipulieren(gid, sym, prozent, von) {
  const d = doc(gid);
  if (!d.kurse[sym]) return false;
  const alt = d.kurse[sym];
  d.kurse[sym] = Math.max(0.5, Math.round(alt * (1 + prozent / 100) * 100) / 100);
  d.alt[sym] = alt;
  d.letzteAenderung = Date.now(); d.von = von || 'Geheim';
  db.set('boerse', gid, d);
  logger.warn(`BÖRSEN-MANIPULATION (${gid}): ${sym} ${prozent > 0 ? '+' : ''}${prozent}% → ${d.kurse[sym]} (von ${von})`);
  return true;
}
// Pfad festlegen: zielProzent über dauerSek, verteilt auf Tick-Intervall
function pfadSetzen(gid, sym, zielProzent, dauerSek, von) {
  const d = doc(gid);
  if (!d.kurse[sym]) return false;
  d.pfad = { sym, start: d.kurse[sym], ziel: Math.max(0.5, d.kurse[sym] * (1 + zielProzent / 100)),
             startZeit: Date.now(), dauerSek: Math.max(10, dauerSek) };
  d.pfadSchritt = 0; d.letzteAenderung = Date.now(); d.von = von || 'Geheim';
  db.set('boerse', gid, d);
  logger.warn(`BÖRSEN-PFAD (${gid}): ${sym} → ${zielProzent}% über ${dauerSek}s (von ${von})`);
  return true;
}
function intervallSetzen(gid, sek) {
  const d = doc(gid);
  d.intervallSek = Math.max(5, Math.min(86400, sek));
  db.set('boerse', gid, d);
  return d.intervallSek;
}
async function tick(guild) {
  const d = doc(guild.id);
  const jetzt = Date.now();
  // 1) Pfad-Verarbeitung hat Vorrang (folgt dem eigenen Takt)
  if (d.pfad && d.pfad.gezeichnet) {
    const p = d.pfad;
    const fort = (jetzt - p.startZeit) / 1000;
    if (fort >= p.gesamtSek) {
      d.kurse[p.sym] = p.punkte[p.punkte.length - 1][1];
      logger.warn('BÖRSE: gezeichneter Pfad fertig: ' + p.sym);
      d.pfad = null;
    } else {
      let i = 0;
      while (i < p.punkte.length - 1 && p.punkte[i + 1][0] < fort) i++;
      const [t1, k1] = p.punkte[i];
      const [t2, k2] = p.punkte[Math.min(i + 1, p.punkte.length - 1)];
      const span = Math.max(0.001, t2 - t1);
      const f = Math.max(0, Math.min(1, (fort - t1) / span));
      d.kurse[p.sym] = Math.round((k1 + (k2 - k1) * f) * 100) / 100;
    }
    db.set('boerse', gid, d);
    return;
  }
  if (d.pfad) {
    const p = d.pfad;
    const fort = Math.min(1, (jetzt - p.startZeit) / (p.dauerSek * 1000));
    // Sanfter Übergang (easeInOut-artig): sin-Wichtung
    const e = fort * fort * (3 - 2 * fort);
    d.kurse[p.sym] = Math.round((p.start + (p.ziel - p.start) * e) * 100) / 100;
    if (fort >= 1) { logger.warn(`BÖRSEN-PFAD fertig: ${p.sym} = ${d.kurse[p.sym]}`); d.pfad = null; }
    db.set('boerse', gid, d);
    return;
  }
  // 2) Normaler Tick nur nach Intervall
  if (jetzt - (d.lastTick || 0) < d.intervallSek * 1000) return;
  d.lastTick = jetzt;
  d.alt = { ...d.kurse };
  for (const a of alleAktien(guild.id)) {
    if (a.autoUpdate === false) continue; // eingefroren
    const vola = a.btc ? 0.35 : 0.16;
    let p = (d.kurse[a.sym] || a.basis) * (1 + (Math.random() * vola - vola / 2.2));
    p = Math.max(a.basis * 0.02, p);
    d.kurse[a.sym] = Math.round(p * 100) / 100;
  }
  db.set('boerse', gid, d);
}
// ═══ Gezeichneter Pfad: Punkte [[sekVomStart, kurs], …] – Aktie folgt exakt der Linie ═══
function zeichnungStarten(gid, sym, punkte, von) {
  const d = doc(gid);
  if (!d.kurse[sym] || !Array.isArray(punkte) || punkte.length < 2) return false;
  d.pfad = { sym, gezeichnet: true, punkte, startZeit: Date.now(),
    gesamtSek: punkte[punkte.length - 1][0], von: von || 'Geheim' };
  d.letzteAenderung = Date.now();
  db.set('boerse', gid, d);
  logger.warn('BÖRSE: gezeichneter Pfad für ' + sym + ' mit ' + punkte.length + ' Punkten (von ' + (von || '?') + ')');
  return true;
}

module.exports = { zeichnungStarten, LISTE, alleAktien, aktieHinzufuegen, aktieLoeschen, autoUpdateSetzen, doc, kurse, depot, tick, manipulieren, pfadSetzen, intervallSetzen };
