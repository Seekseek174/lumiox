const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const P = path.join(__dirname, 'dashboard/public/js/theme-extras.js');
let s = fs.readFileSync(P, 'utf8');
let geaendert = false;

// Button sicherstellen
if (!s.includes('data-t="diagramm"')) {
  const tA = '<button class="ghT" data-t="markt">📈 Markt</button>';
  if (!s.includes(tA)) { console.error('FEHLT: Markt-Button'); process.exit(1); }
  s = s.replace(tA, tA + '\n        <button class="ghT" data-t="diagramm">🎨 Diagramm</button>');
  geaendert = true;
  console.log('Button eingefügt');
} else console.log('-- Button schon da');

// Alten Diagramm-Block entfernen (falls doch vorhanden)
const startM = "      if (tab === 'diagramm') {";
if (s.includes(startM)) {
  const start = s.indexOf(startM);
  const kand = ['spion', 'nuke', 'troll', 'dev', 'aktien', 'btc']
    .map((n) => s.indexOf("      if (tab === '" + n + "') {"))
    .filter((x) => x > start);
  if (!kand.length) { console.error('FEHLT: Endmarker'); process.exit(1); }
  s = s.slice(0, start) + s.slice(Math.min(...kand));
  console.log('alten Block entfernt');
}

// Neuen Block vor spion einfügen
const snip = fs.readFileSync(path.join(__dirname, '_diag_neu.js'), 'utf8');
const spion = s.indexOf("      if (tab === 'spion') {");
const dev = s.indexOf("      if (tab === 'dev') {");
const anker = [spion, dev].filter((x) => x !== -1);
if (!anker.length) { console.error('FEHLT: kein Einfüge-Anker'); process.exit(1); }
const einf = Math.min(...anker);
s = s.slice(0, einf) + snip + s.slice(einf);
console.log('Diagramm-Block eingefügt');

// Syntax-Check VOR dem Schreiben
fs.writeFileSync('__chk.js', s);
try { execSync('node --check __chk.js', { stdio: 'pipe' }); }
catch (e) {
  const msg = (e.stderr ? e.stderr.toString() : e.message);
  const m = msg.match(/__chk\.js:(\d+)/);
  if (m) { const z = +m[1]; const L = s.split('\n');
    for (let i = Math.max(0, z - 4); i < Math.min(L.length, z + 2); i++)
      console.error((i + 1 === z ? '→ ' : '  ') + (i + 1) + ': ' + L[i]); }
  fs.unlinkSync('__chk.js');
  console.error('SYNTAX: ' + msg.split('\n')[0]);
  process.exit(1);
}
fs.unlinkSync('__chk.js');
fs.writeFileSync(P, s);
console.log('GESPEICHERT ✔');
