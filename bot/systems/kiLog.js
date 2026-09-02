'use strict';
// ═══════════════════════════════════════════════════════════════
// KI-PROZESS-LOG: Zeichnet jede Phase der Moderations-Pipeline auf
// (empfangen → gepuffert → analysiert → Ergebnis/Skip/Fehler).
// Reiner RAM-Ringpuffer, keine DB – praktisch kostenlos.
// Im Dashboard live sichtbar: Seite "KI-Prozesse".
// ═══════════════════════════════════════════════════════════════
const MAX = 80;
const ereignisse = [];
const zaehler = { nachrichten: 0, gepuffert: 0, analysen: 0, treffer: 0, fehler: 0 };

function log(typ, text) {
  ereignisse.unshift({ zeit: Date.now(), typ, text: String(text).slice(0, 300) });
  if (ereignisse.length > MAX) ereignisse.length = MAX;
}
function zaehle(k, n = 1) { zaehler[k] = (zaehler[k] || 0) + n; }
function snapshot() { return { zaehler, ereignisse: ereignisse.slice(0, 60) }; }

module.exports = { log, zaehle, snapshot };
