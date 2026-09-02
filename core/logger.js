// Kleiner, abhängigkeitsfreier Logger mit Farben und Zeitstempeln.
'use strict';

const ts = () => new Date().toLocaleTimeString('de-DE', { hour12: false });

function zeile(stufe, farbe, msg) {
  // Farbige Ausgabe; unter Termux (TTY) und im Pipe-Fall gleichermaßen harmlos
  console.log(`\x1b[${farbe}m[${ts()}] [${stufe}]\x1b[0m ${msg}`);
}

module.exports = {
  info: (msg) => zeile('INFO ', '36', msg),
  ok: (msg) => zeile(' OK  ', '32', msg),
  warn: (msg) => zeile('WARN ', '33', msg),
  error: (msg) => zeile('FEHLER', '31', msg),
  debug: (msg) => { if (process.env.LUMIOX_DEBUG) zeile('DEBUG', '90', msg); },

  banner() {
    console.log('\x1b[36m');
    console.log('  ╔═══════════════════════════════════════════╗');
    console.log('  ║   LUMIOX  –  KI-Moderation & Economy     ║');
    console.log('  ║   Bot + Dashboard in einem Prozess        ║');
    console.log('  ╚═══════════════════════════════════════════╝');
    console.log('\x1b[0m');
  },
};
