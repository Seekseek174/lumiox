// ═══════════════════════════════════════════════════════════════
// LUMIOX RELEASE-BUILDER
// Erzeugt ~/lumiox-alpha/ = verteilbare Version mit verschleiertem
// Code (kein Klartext-JS). Public-HTML (Dashboard-Design) bleibt
// lesbar – dort steht keine sensible Logik.
// Aufruf:  node make-release.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const HOME = require('os').homedir();
const QUELLE = path.join(HOME, 'dcbot1');
const ZIEL = path.join(HOME, 'lumiox-alpha');
const OBF = path.join(QUELLE, 'node_modules', '.bin', 'javascript-obfuscator');

// Was wird verschleiert (deine Logik) vs. kopiert (Design/Texte)?
const OBFUSKATE = ['core', 'bot', 'dashboard/routes', 'dashboard'];
const KOPIERE = ['dashboard/public', 'node_modules', 'package.json'];

console.log('═══ LUMIOX RELEASE-BUILDER ═══\n');

// Aufräumen
fs.rmSync(ZIEL, { recursive: true, force: true });
fs.mkdirSync(ZIEL, { recursive: true });

// 1) Verschlüsseln der Logik
function obfuskieren(rel) {
  const q = path.join(QUELLE, rel);
  const z = path.join(ZIEL, rel);
  if (!fs.existsSync(q)) return;
  for (const f of fs.readdirSync(q, { withFileTypes: true })) {
    const qf = path.join(q, f.name);
    const zf = path.join(z, f.name);
    if (f.isDirectory()) { fs.mkdirSync(zf, { recursive: true }); obfuskieren(path.join(rel, f.name)); continue; }
    if (!f.name.endsWith('.js')) { fs.copyFileSync(qf, zf); continue; }
    try {
      execSync(`"${OBF}" "${qf}" --output "${zf}" --compact true ` +
        `--control-flow-flattening true --control-flow-flattening-threshold 0.75 ` +
        `--string-array true --string-array-encoding rc4 --string-array-threshold 1 ` +
        `--self-defending true --identifier-names-generator hexadecimal`, { stdio: 'pipe' });
      process.stdout.write('🔒 ' + path.join(rel, f.name) + '\n');
    } catch (e) {
      console.log('⚠ übersprungen (obfuscator): ' + f.name);
      fs.copyFileSync(qf, zf); // Fallback: unverschlüsselt kopieren
    }
  }
}
for (const o of OBFUSKATE) obfuskieren(o);

// 2) Design/Texte + Abhängigkeiten kopieren (1:1)
for (const k of KOPIERE) {
  const q = path.join(QUELLE, k), z = path.join(ZIEL, k);
  if (fs.existsSync(q)) {
    fs.cpSync(q, z, { recursive: true });
    console.log('📄 ' + k + ' (kopiert)');
  }
}

// 3) index.js verschleiern
if (fs.existsSync(path.join(QUELLE, 'index.js'))) {
  execSync(`"${OBF}" "${path.join(QUELLE, 'index.js')}" --output "${path.join(ZIEL, 'index.js')}" ` +
    `--compact true --control-flow-flattening true --string-array true --string-array-encoding rc4 --self-defending true`, { stdio: 'pipe' });
  console.log('🔒 index.js');
}

// 4) Start-Skript + Hinweis für Nutzer
fs.writeFileSync(path.join(ZIEL, 'START-HIER.sh'), `#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════
#  LUMIOX – Start (Alpha)
# ═══════════════════════════════════
termux-wake-lock
cd "$(dirname "$0")"
if ! npm ls discord.js >/dev/null 2>&1; then
  echo "📦 Installiere Abhängigkeiten (einmalig) ..."
  npm install --no-audit --no-fund
fi
node index.js
`);
fs.writeFileSync(path.join(ZIEL, 'LIES-MICH.txt'), `LUMIOX v0.8.0-alpha – © ginizw, Alle Rechte vorbehalten.

START (Termux):
  chmod +x START-HIER.sh
  ./START-HIER.sh

Das erste Mal dauert die Installation ein paar Minuten.
Danach: Dashboard unter http://localhost:3000 öffnen.

Der Code dieses Pakets ist verschlüsselt. Reverse Engineering,
Dekompilierung und Weitergabe sind laut Lizenz untersagt.
Viel Spaß in der Alpha! 🌟
`);
console.log('\n✔ FERTIG: ' + ZIEL);
console.log('→ Weiter mit Schritt 2 (ZIP packen)');
