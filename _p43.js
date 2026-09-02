const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const P = 'dashboard/public/js/design.js';
function checkStr(txt) {
  const tmp = path.join(__dirname, '__chk_design.js'); // .js-Endung!
  fs.writeFileSync(tmp, txt);
  try { execSync(`node --check "${tmp}"`, { stdio: 'pipe' }); fs.unlinkSync(tmp); return null; }
  catch (e) {
    const msg = e.stderr ? e.stderr.toString() : e.message;
    const m = msg.match(/__chk_design\.js:(\d+)/);
    let ctx = '';
    if (m) {
      const z = parseInt(m[1], 10);
      const zeilen = txt.split('\n');
      for (let i = Math.max(0, z - 4); i < Math.min(zeilen.length, z + 2); i++)
        ctx += (i + 1 === z ? '→ ' : '  ') + (i + 1) + ': ' + zeilen[i] + '\n';
    }
    fs.unlinkSync(tmp);
    return msg.split('\n').slice(0, 3).join('\n') + '\n' + ctx;
  }
}
let d = fs.readFileSync(P, 'utf8');
let geaendert = false;

// a) setRainbow v3.1
if (!d.includes('rb-rahmen')) {
  const fStart = d.indexOf('  // ── Rainbow-Animation (v3');
  const fEnd = d.indexOf('  // ── Anwenden ──', fStart);
  if (fStart === -1 || fEnd === -1) { console.error('✘ setRainbow-Marker fehlt'); process.exit(1); }
  const FUNK = `  // ── Rainbow-Animation (v3.1: Spur, Schatten, nahtlos) ──
  let rainbowTimer = 0;
  function setRainbow(r) {
    r = r || {};
    if (!Array.isArray(r.ziele)) r.ziele = ['hintergrund'];
    if (!Array.isArray(r.textZiele) || !r.textZiele.length) r.textZiele = ['ueberschriften', 'zahlen', 'logo'];
    const altLayer = document.getElementById('rainbowLayer');
    if (altLayer) altLayer.remove();
    if (rainbowTimer) { clearInterval(rainbowTimer); rainbowTimer = 0; }
    document.body.classList.remove('rb-leisten', 'rb-text', 'rb-rahmen', 'rb-glow');
    const dynAlt = document.getElementById('rainbowDynamic');
    if (dynAlt) dynAlt.remove();
    document.documentElement.style.removeProperty('--accent');
    if (!r.aktiv) return;
    const farben = Array.isArray(r.farben) && r.farben.length >= 2
      ? r.farben : ['#ff004c', '#ff9d00', '#ffe600', '#2bff88', '#22d3ee', '#b06cff'];
    const speed = Math.max(1, Number(r.speed) || 10);
    const grad = 'linear-gradient(90deg,' + farben.join(',') + ',' + farben[0] + ')';
    document.documentElement.style.setProperty('--rb-grad', grad);
    document.documentElement.style.setProperty('--rb-speed', speed + 's');
    if (!document.getElementById('rainbowKeyframes')) {
      const st = document.createElement('style');
      st.id = 'rainbowKeyframes';
      st.textContent = '@keyframes rainbowShift{0%{background-position:0% 50%}100%{background-position:-200% 50%}}';
      document.head.appendChild(st);
    }
    const ziele = r.ziele || [];
    if (ziele.includes('hintergrund')) {
      const host = document.createElement('div');
      host.id = 'rainbowLayer';
      host.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:' +
        (r.deckkraft != null ? r.deckkraft : 0.85) +
        ';background-image:' + grad + ';background-size:200% 100%;' +
        'animation:rainbowShift ' + speed + 's linear infinite';
      document.body.appendChild(host);
    }
    if (ziele.includes('leisten') || ziele.includes('text')) {
      let css = '';
      if (ziele.includes('leisten')) {
        document.body.classList.add('rb-leisten');
        css += 'body.rb-leisten .progress i,body.rb-leisten .meter i,body.rb-leisten .btn.primary,' +
          'body.rb-leisten .nav-btn.aktiv,body.rb-leisten .toggle input:checked+i{background-image:' + grad +
          '!important;background-size:200% 100%!important;animation:rainbowShift ' + speed + 's linear infinite;}';
      }
      if (ziele.includes('text')) {
        const sel = [];
        if (r.textZiele.includes('ueberschriften')) sel.push('h2', 'h3');
        if (r.textZiele.includes('zahlen')) sel.push('.stat .val');
        if (r.textZiele.includes('logo')) sel.push('.logo-text b', '.lx');
        if (sel.length) {
          document.body.classList.add('rb-text');
          css += 'body.rb-text ' + sel.join(',body.rb-text ') + '{' +
            'background-image:' + grad + '!important;background-size:200% 100%!important;' +
            '-webkit-background-clip:text!important;background-clip:text!important;' +
            'color:transparent!important;-webkit-text-fill-color:transparent!important;' +
            'animation:rainbowShift ' + speed + 's linear infinite;}';
        }
      }
      const st = document.createElement('style');
      st.id = 'rainbowDynamic';
      st.textContent = css;
      document.head.appendChild(st);
    }
    if (ziele.includes('rahmen')) {
      document.body.classList.add('rb-rahmen');
    }
    if (ziele.includes('glow')) {
      document.body.classList.add('rb-glow');
      const step = 100 / farben.length;
      let frames = '';
      farben.forEach((f, i) => {
        frames += Math.round(i * step) + '%{box-shadow:0 0 30px ' + f + '66,0 0 60px ' + f + '33,inset 0 0 20px ' + f + '22;}';
      });
      frames += '100%{box-shadow:0 0 30px ' + farben[0] + '66,0 0 60px ' + farben[0] + '33,inset 0 0 20px ' + farben[0] + '22;}';
      const st = document.createElement('style');
      st.id = 'rainbowGlowKF';
      st.textContent = '@keyframes rbGlowAnim{' + frames + '}';
      document.head.appendChild(st);
    }
  }
`;
  d = d.slice(0, fStart) + FUNK + d.slice(fEnd);
  geaendert = true;
  console.log('→ setRainbow v3.1 eingesetzt');
}

// b) apply(): glow-rb-Klasse für den unabhängigen Karten-Glow-Rainbow
const ankerApply = "document.body.classList.toggle('bg-anim', d.bg.typ === 'anim');";
if (d.includes(ankerApply) && !d.includes("classList.toggle('glow-rb'")) {
  d = d.replace(ankerApply, ankerApply + `
    document.body.classList.toggle('glow-rb', !!(d.licht && d.licht.glowRainbow && d.licht.cardGlow > 0));
    if ((d.licht && d.licht.glowRainbow) && !document.documentElement.style.getPropertyValue('--rb-speed')) {
      document.documentElement.style.setProperty('--rb-speed', '8s');
    }`);
  geaendert = true;
  console.log('→ apply(): glow-rb');
}

// c) Ziele-Checkboxen (Spur + Schatten)
const altZ = "[['hintergrund', '🌌 Hintergrund'], ['leisten', '📊 Leisten & Buttons'], ['text', '🔤 Text']]";
const neuZ = "[['hintergrund', '🌌 Hintergrund'], ['leisten', '📊 Leisten & Buttons'], ['text', '🔤 Text'], ['rahmen', '🖼️ Rainbow-Spur (Rahmen um Panels)'], ['glow', '💡 Rainbow-Schatten (Glow)']]";
if (d.includes(altZ)) { d = d.replace(altZ, neuZ); geaendert = true; console.log('→ Ziele erweitert'); }

// d) Licht & Glow: Karten-Glow-Rainbow-Toggle (einzeln!)
const glowAnker = "sliderZeile('Glow-Radius', 0, 60, 1, () => current.licht.glowRadius, lAkt('glowRadius'), (v) => v + ' px'),";
if (d.includes(glowAnker) && !d.includes('glowRainbow')) {
  d = d.replace(glowAnker, glowAnker + `
      toggleZeile('🌈 Karten-Glow als RAINBOW (einzeln, ohne Rest-Rainbow)', () => !!current.licht.glowRainbow, (v) => { current.licht.glowRainbow = v; apply(current, { speichern: false }); }),`);
  geaendert = true;
  console.log('→ Licht&Glow: Karten-Glow-Rainbow-Toggle');
}
if (!d.includes('glowRainbow')) { console.error('✘ glowRainbow konnte nicht eingebaut werden'); process.exit(1); }
if (geaendert) schreib(P, d);
else console.log('-- design.js unverändert');
