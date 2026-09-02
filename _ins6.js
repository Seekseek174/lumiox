const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const P = path.join(__dirname, 'dashboard/public/js/app.js');
let app = fs.readFileSync(P, 'utf8');
if (app.includes('async function seiteStudio(page)')) { console.log('-- schon da'); process.exit(0); }

// Vor seiteBoerse einfügen
const aFn = app.indexOf('async function seiteBoerse(page) {');
if (aFn === -1) { console.error('FEHLT: seiteBoerse'); process.exit(1); }
let start = app.lastIndexOf('\n', aFn) + 1;
const pv = app.lastIndexOf('\n', start - 2) + 1;
if (app.slice(pv, start - 1).trim().startsWith('//')) start = pv;
const snip = fs.readFileSync(path.join(__dirname, '_studio2.js'), 'utf8');
let neu = app.slice(0, start) + snip + app.slice(start);

// Nav + Route
if (!app.includes("['studio', 'Studio'")) {
  const a = "['embeds', 'Embed-Studio', '🪄'],";
  if (app.includes(a)) { neu = neu.replace(a, a + "\n    ['studio', 'Command-Studio', '🧩'],"); }
}
if (!app.includes('studio: seiteStudio')) {
  const a = 'embeds: seiteEmbedStudio,';
  if (app.includes(a)) { neu = neu.replace(a, a + '\n      studio: seiteStudio,'); }
}
fs.writeFileSync('__chk.js', neu);
try { execSync('node --check __chk.js', { stdio: 'pipe' }); }
catch (e) {
  const msg = (e.stderr ? e.stderr.toString() : e.message);
  const m = msg.match(/__chk\.js:(\d+)/);
  if (m) { const z = +m[1]; const L = neu.split('\n');
    for (let i = Math.max(0, z - 4); i < Math.min(L.length, z + 2); i++)
      console.error((i + 1 === z ? '→ ' : '  ') + (i + 1) + ': ' + L[i]); }
  fs.unlinkSync('__chk.js');
  console.error('SYNTAX: ' + msg.split('\n')[0]);
  process.exit(1);
}
fs.unlinkSync('__chk.js');
fs.writeFileSync(P, neu);
console.log('GESPEICHERT ✔');
