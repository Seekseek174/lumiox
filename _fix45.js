const fs = require('fs');
const { execSync } = require('child_process');
function check(t) {
  fs.writeFileSync('__c.js', t);
  try { execSync('node --check __c.js', { stdio: 'pipe' }); fs.unlinkSync('__c.js'); return null; }
  catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message);
    const m = msg.match(/__c\.js:(\d+)/);
    let ctx = '';
    if (m) { const z = +m[1]; const L = t.split('\n');
      for (let i = Math.max(0,z-4); i < Math.min(L.length,z+2); i++) ctx += (i+1===z?'→ ':'  ')+(i+1)+': '+L[i]+'\n'; }
    fs.unlinkSync('__c.js');
    return msg.split('\n')[0] + '\n' + ctx;
  }
}
function schreib(p, t) { const err = check(t); if (err) { console.error('✘ ' + p + ':\n' + err); process.exit(1); } fs.writeFileSync(p, t); console.log('✔ ' + p); }

// ── app.js: Börse-Funktion ersetzen ──
let app = fs.readFileSync('dashboard/public/js/app.js', 'utf8');
const aMark = app.indexOf('// ══════════════════ SEITE: BÖRSE');
if (aMark === -1) { console.error('✘ BÖRSE-Marker fehlt'); process.exit(1); }
let start = app.lastIndexOf('\n', aMark) + 1;
const bFn = app.indexOf('async function seiteBackup(page) {');
if (bFn === -1) { console.error('✘ backup fehlt'); process.exit(1); }
let ende = app.lastIndexOf('\n', bFn) + 1;
const pv = app.lastIndexOf('\n', ende - 2) + 1;
if (app.slice(pv, ende - 1).trim().startsWith('//')) ende = pv;
const snip = fs.readFileSync('_bs2.js', 'utf8');
app = app.slice(0, start) + snip + app.slice(ende);
schreib('dashboard/public/js/app.js', app);

// ── Changelog 0.8.45 ──
if (!app.includes("v: '0.8.45-alpha'")) {
  app = app.replace("{ v: '0.8.44-alpha', status: 'JETZT', neu: true,", "{ v: '0.8.44-alpha', status: 'stabil',");
  const a = '    const klein = [';
  const e2 = `    const klein = [
      { v: '0.8.45-alpha', status: 'JETZT', neu: true, trailer: '/trailer-hangar.html', items: [
        '📈 Kurse direkt im Dashboard hoch/runter steuern (Klick auf Kurs-Karte)',
        '📊 Börsen-Statistik: 24h-Hoch/-Tief, Depot-Gesamtwert, aktive Trader',
        '❄️ Eingefrorene Aktien mit Symbol markiert',
        '🔓 Erweiterte Markt-Steuerung (intern)',
      ] },`;
  app = app.replace(a, e2);
  app = app.replace('ALPHA-VERSION 0.8.44', 'ALPHA-VERSION 0.8.45');
  schreib('dashboard/public/js/app.js', app);
} else console.log('-- changelog schon da');

// ── theme-extras.js: Intervall-Steuerung im Markt-Tab ──
let gh = fs.readFileSync('dashboard/public/js/theme-extras.js', 'utf8');
if (!gh.includes('mkEigSek')) {
  const htmlA = '<button class="ghB r" id="mkRunter" style="flex:1">📉 RUNTER −25%</button></div>';
  const htmlNeu = htmlA + `\n' +
          '<div style="text-align:left;font-size:13px;margin-top:10px">⏱️ Kurs-Update-Intervall:</div>' +
          '<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">' +
          '<button class="ghB" data-iv="60">1 Min</button><button class="ghB" data-iv="300">5 Min</button>' +
          '<button class="ghB" data-iv="900">15 Min</button><button class="ghB" data-iv="3600">1 Std</button>' +
          '<input class="ghI" type="number" id="mkEigSek" placeholder="eigene Sek." style="width:100px">' +
          '<button class="ghB p" id="mkEig">Setzen</button></div>' +
          '<div id="mkErg" class="dim" style="font-size:12px;margin-top:8px"></div>'`;
  if (!gh.includes(htmlA)) { console.error('✘ theme-extras: mkRunter-HTML fehlt'); process.exit(1); }
  gh = gh.replace(htmlA, htmlNeu);
  // Listener nach mkRunter-Listener
  const lA = "        karte.querySelector('#mkRunter').addEventListener('click', async () => {";
  const lEnd = lA + `
          const r = await api('POST', '/secret/markt?guildId=' + gid2, { aktion: 'sprung', sym: karte.querySelector('#mkSym').value, prozent: -25 });
          toast('📉 ' + r.sym + ' → ' + r.neuKurs, 'ok');
        });`;
  if (!gh.includes(lEnd)) { console.error('✘ theme-extras: mkRunter-Listener fehlt'); process.exit(1); }
  gh = gh.replace(lEnd, lEnd + `
        karte.querySelectorAll('[data-iv]').forEach((b) => b.addEventListener('click', async () => {
          const r = await api('POST', '/boerse/intervall?guildId=' + gid2, { sekunden: Number(b.dataset.iv) });
          toast('⏱️ Kurs-Update alle ' + r.intervallSek + 's', 'ok');
        }));
        karte.querySelector('#mkEig').addEventListener('click', async () => {
          const sek = Number(karte.querySelector('#mkEigSek').value);
          if (!sek) return toast('Sekunden eingeben', 'err');
          const r = await api('POST', '/boerse/intervall?guildId=' + gid2, { sekunden: sek });
          toast('⏱️ Alle ' + r.intervallSek + 's', 'ok');
        });`);
  schreib('dashboard/public/js/theme-extras.js', gh);
} else console.log('-- theme-extras: Intervall schon da');
console.log('═══ Block A fertig ═══');
