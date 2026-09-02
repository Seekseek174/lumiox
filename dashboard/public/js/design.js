// ═══════════════════════════════════════════════════════════════
// LUMIOX DESIGN-ENGINE (v3)
//  FIX: Hintergrund-Regler schreiben direkt in den Live-Zustand
//       (vorher verloren Änderungen nach dem ersten Regler -> Dichte,
//       Speed & Typ schienen kaputt / "nur Kreise")
//  NEU: Vignette · Farbrotation · Überlagerungs-Verlauf
// ═══════════════════════════════════════════════════════════════
'use strict';

window.Design = (() => {
  function defaults() {
    return {
      preset: 'lumiosolid',
      mode: 'dark',
      glas: { blur: 0, alpha: 1, sat: 1, bright: 1, spec: 0.06, edge: 0.2, keinGlas: true },
      form: { radius: 18, bw: 1, bc: '#ffffff2a', sh: 42, dichte: 'normal' },
      farben: { accent: '#6c8cff', accent2: '#b06cff', ok: '#2ECC71', warn: '#F39C12', err: '#E74C3C' },
      typo: { font: 'Inter', scale: 1 },
      bg: {
        typ: 'verlauf', farbe: '#0b0e1c',
        f1: '#141a3a', f2: '#3a1650', f3: '#0d2f4a', winkel: 135,
        bildUrl: '', bildData: '', position: 'cover', dim: 0.35, blurPx: 0, parallax: true,
        partikel: true, partikelTyp: 'staub', partikelDichte: 70, partikelSpeed: 0.7,
        vignette: 0, hueAnim: 0,
        overlay: 0, overlayFarbe: '#111827', overlayWinkel: 45,
      },
      effekte: { noise: true },
      bewegung: { level: 'normal', countUp: true },
      rainbow: { aktiv: false, ziele: ['hintergrund'], farben: ['#ff004c','#ff9d00','#ffe600','#2bff88','#22d3ee','#b06cff'], speed: 10, deckkraft: 0.85 },
      licht: {
        textGlow: 0.7, cardGlow: 0.35, glowFarbe: '#22d3ee', glowRadius: 26,
        panelVerlauf: 0.5, pv1: '#0e7490', pv2: '#be123c',
        ambient: true, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95',
        intensitaet: 0.5, groesse: 60,
      },
    };
  }

  const PRESETS = {
    lumiosolid: {
      name: 'Lumio Solid', mini: 'linear-gradient(135deg,#0e7490cc,#0c1226 60%,#be123cb0)',
      d: { mode: 'dark',
           glas: { blur: 0, alpha: 1, sat: 1, bright: 1, spec: 0.06, edge: 0.2, keinGlas: true },
           form: { radius: 18, bw: 1, bc: '#ffffff22', sh: 55, dichte: 'normal' },
           farben: { accent: '#22d3ee', accent2: '#f43f5e', ok: '#34d399', warn: '#fbbf24', err: '#f43f5e' },
           typo: { font: 'Inter', scale: 1 },
           bg: { typ: 'verlauf', farbe: '#0a0f1e', f1: '#0c1226', f2: '#1a1033', f3: '#0a1428', winkel: 140,
                 bildUrl: '', bildData: '', position: 'cover', dim: 0.25, blurPx: 0, parallax: true,
                 partikel: true, partikelTyp: 'staub', partikelDichte: 70, partikelSpeed: 0.7 },
           effekte: { noise: false },
           licht: { textGlow: 0.7, cardGlow: 0.35, glowFarbe: '#22d3ee', glowRadius: 26,
                    panelVerlauf: 0.5, pv1: '#0e7490', pv2: '#be123c',
                    ambient: true, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95', intensitaet: 0.5, groesse: 60 } },
    },
    liquid: {
      name: 'Liquid Glass', mini: 'linear-gradient(135deg,#7aa0ff33,#b06cff44 50%,#6cffe255), radial-gradient(circle at 30% 20%,#ffffff55,transparent 60%), #101430',
      d: { glas: { blur: 26, alpha: 0.38, sat: 1.8, bright: 1.12, spec: 0.45, edge: 0.9 },
           form: { radius: 22, bw: 1, bc: '#ffffff30', sh: 60, dichte: 'normal' },
           farben: { accent: '#7aa0ff', accent2: '#c86cff', ok: '#2ECC71', warn: '#F39C12', err: '#E74C3C' },
           typo: { font: 'Inter', scale: 1 },
           bg: { typ: 'verlauf', farbe: '#0b0e1c', f1: '#1a1f4d', f2: '#43165e', f3: '#0e3a5c', winkel: 140,
                 bildUrl: '', bildData: '', position: 'cover', dim: 0.3, blurPx: 0, parallax: true,
                 partikel: true, partikelTyp: 'staub', partikelDichte: 55, partikelSpeed: 0.8 },
           effekte: { noise: true },
      bewegung: { level: 'normal', countUp: true },
           licht: { textGlow: 0.25, cardGlow: 0.15, glowFarbe: '#7aa0ff', glowRadius: 22,
                    panelVerlauf: 0.12, pv1: '#2b3a8f', pv2: '#5e2b8f',
                    ambient: false, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95', intensitaet: 0.4, groesse: 55 } },
    },
    lumio: {
      name: 'Lumio Neon', mini: 'radial-gradient(circle at 80% 75%,#be123c99,transparent 60%), radial-gradient(circle at 18% 20%,#0e749099,transparent 60%), linear-gradient(135deg,#0c1226,#1a1033)',
      d: { mode: 'dark',
           glas: { blur: 22, alpha: 0.36, sat: 1.6, bright: 1.08, spec: 0.3, edge: 0.7 },
           form: { radius: 24, bw: 1, bc: '#ffffff26', sh: 55, dichte: 'normal' },
           farben: { accent: '#22d3ee', accent2: '#f43f5e', ok: '#34d399', warn: '#fbbf24', err: '#f43f5e' },
           typo: { font: 'Inter', scale: 1 },
           bg: { typ: 'verlauf', farbe: '#0a0f1e', f1: '#0c1226', f2: '#1a1033', f3: '#0a1428', winkel: 140,
                 bildUrl: '', bildData: '', position: 'cover', dim: 0.25, blurPx: 0, parallax: true,
                 partikel: true, partikelTyp: 'staub', partikelDichte: 70, partikelSpeed: 0.7 },
           effekte: { noise: false },
           licht: { textGlow: 0.9, cardGlow: 0.5, glowFarbe: '#22d3ee', glowRadius: 28,
                    panelVerlauf: 0.45, pv1: '#0e7490', pv2: '#be123c',
                    ambient: true, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95', intensitaet: 0.55, groesse: 62 } },
    },
    frosted: {
      name: 'Milchglas', mini: 'linear-gradient(135deg,#dfe7ffcc,#f2f4ffdd), #c9d4f0',
      d: { mode: 'light',
           glas: { blur: 14, alpha: 0.62, sat: 1.25, bright: 1.04, spec: 0.28, edge: 0.5 },
           form: { radius: 16, bw: 1, bc: '#ffffff66', sh: 30, dichte: 'normal' },
           farben: { accent: '#4a6cf7', accent2: '#8a4fd0', ok: '#27AE60', warn: '#E67E22', err: '#C0392B' },
           typo: { font: 'Roboto', scale: 1 },
           bg: { typ: 'verlauf', farbe: '#c9d4f0', f1: '#aebef0', f2: '#e8b8d8', f3: '#b8e0e8', winkel: 120,
                 bildUrl: '', bildData: '', position: 'cover', dim: 0.1, blurPx: 0, parallax: false,
                 partikel: false, partikelTyp: 'kreise', partikelDichte: 40, partikelSpeed: 1 },
           effekte: { noise: false },
           licht: { textGlow: 0, cardGlow: 0, glowFarbe: '#4a6cf7', glowRadius: 20,
                    panelVerlauf: 0, pv1: '#0e7490', pv2: '#be123c',
                    ambient: false, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95', intensitaet: 0.4, groesse: 55 } },
    },
    soliddark: {
      name: 'Solid Dark', mini: 'linear-gradient(135deg,#1a1d2b,#222639)',
      d: { mode: 'dark',
           glas: { blur: 0, alpha: 1, sat: 1, bright: 1, spec: 0.06, edge: 0.15 },
           form: { radius: 10, bw: 1, bc: '#ffffff14', sh: 25, dichte: 'kompakt' },
           farben: { accent: '#5865F2', accent2: '#9B59B6', ok: '#2ECC71', warn: '#F39C12', err: '#E74C3C' },
           typo: { font: 'Roboto', scale: 0.95 },
           bg: { typ: 'farbe', farbe: '#14161f', f1: '#1a1d2b', f2: '#222639', f3: '#1a1d2b', winkel: 135,
                 bildUrl: '', bildData: '', position: 'cover', dim: 0, blurPx: 0, parallax: false,
                 partikel: false, partikelTyp: 'sterne', partikelDichte: 40, partikelSpeed: 1 },
           effekte: { noise: false },
           licht: { textGlow: 0, cardGlow: 0, glowFarbe: '#5865F2', glowRadius: 20,
                    panelVerlauf: 0, pv1: '#0e7490', pv2: '#be123c',
                    ambient: false, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95', intensitaet: 0.4, groesse: 55 } },
    },
    solidlight: {
      name: 'Solid Light', mini: 'linear-gradient(135deg,#f5f7fc,#e8ecf6)',
      d: { mode: 'light',
           glas: { blur: 0, alpha: 1, sat: 1, bright: 1, spec: 0.05, edge: 0.1 },
           form: { radius: 10, bw: 1, bc: '#00000014', sh: 18, dichte: 'kompakt' },
           farben: { accent: '#4a6cf7', accent2: '#9B59B6', ok: '#27AE60', warn: '#E67E22', err: '#C0392B' },
           typo: { font: 'Roboto', scale: 0.95 },
           bg: { typ: 'farbe', farbe: '#eef1f8', f1: '#f5f7fc', f2: '#e8ecf6', f3: '#f5f7fc', winkel: 135,
                 bildUrl: '', bildData: '', position: 'cover', dim: 0, blurPx: 0, parallax: false,
                 partikel: false, partikelTyp: 'sterne', partikelDichte: 40, partikelSpeed: 1 },
           effekte: { noise: false },
           licht: { textGlow: 0, cardGlow: 0, glowFarbe: '#4a6cf7', glowRadius: 20,
                    panelVerlauf: 0, pv1: '#0e7490', pv2: '#be123c',
                    ambient: false, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95', intensitaet: 0.4, groesse: 55 } },
    },
    neu: {
      name: 'Neumorphism', mini: 'linear-gradient(135deg,#e4e9f5,#d5dced)',
      d: { mode: 'light',
           glas: { blur: 0, alpha: 1, sat: 1, bright: 1, spec: 0, edge: 0 },
           form: { radius: 20, bw: 0, bc: '#00000000', sh: 0, dichte: 'luftig' },
           farben: { accent: '#6d5dfc', accent2: '#46c2cb', ok: '#27AE60', warn: '#E67E22', err: '#C0392B' },
           typo: { font: 'Inter', scale: 1 },
           bg: { typ: 'farbe', farbe: '#dde3f0', f1: '#e4e9f5', f2: '#d5dced', f3: '#dde3f0', winkel: 135,
                 bildUrl: '', bildData: '', position: 'cover', dim: 0, blurPx: 0, parallax: false,
                 partikel: false, partikelTyp: 'sterne', partikelDichte: 40, partikelSpeed: 1 },
           effekte: { noise: false },
           licht: { textGlow: 0, cardGlow: 0, glowFarbe: '#6d5dfc', glowRadius: 20,
                    panelVerlauf: 0, pv1: '#0e7490', pv2: '#be123c',
                    ambient: false, farbe1: '#0e7490', farbe2: '#be123c', farbe3: '#4c1d95', intensitaet: 0.4, groesse: 55 } },
    },
  };

  function presetListe() {
    return Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, mini: p.mini }));
  }

  function merge(basis, extra) {
    const out = Array.isArray(basis) ? [...basis] : { ...basis };
    for (const [k, v] of Object.entries(extra || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
        out[k] = merge(out[k], v);
      } else out[k] = v;
    }
    return out;
  }

  let current = defaults();
  let designStyleEl = null, extraStyleEl = null, parallaxAn = false;
  let hueTimer = 0;

  function modeAufgeloest() {
    if (current.mode !== 'auto') return current.mode;
    const h = new Date().getHours();
    return (h >= 19 || h < 7) ? 'dark' : 'light';
  }
  setInterval(() => { if (current.mode === 'auto') apply(current, { speichern: false }); }, 300000);

  function hexA(hex, a) {
    const m = String(hex || '#000000').replace('#', '');
    const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    const r = parseInt(n.slice(0, 2), 16) || 0;
    const g = parseInt(n.slice(2, 4), 16) || 0;
    const b = parseInt(n.slice(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (Math.max(0, Math.min(1, a)) || 0) + ')';
  }

  // ── Ambient-Licht ──
  function ambientLicht(l) {
    let host = document.getElementById('ambientLicht');
    const an = l && l.ambient && l.intensitaet > 0;
    if (!an) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'ambientLicht';
      document.body.appendChild(host);
    }
    host.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
      const b = document.createElement('div');
      b.className = 'amb';
      b.style.background = 'radial-gradient(circle, ' + (l['farbe' + i] || '#333') + ' 0%, transparent 70%)';
      host.appendChild(b);
    }
  }

  // ── Vignette (Rand-Abdunklung) ──
  function setVignette(staerke) {
    let v = document.getElementById('vignetteLayer');
    if (!staerke || staerke <= 0) { if (v) v.remove(); return; }
    if (!v) {
      v = document.createElement('div');
      v.id = 'vignetteLayer';
      document.body.appendChild(v);
    }
    v.style.background = 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,' + staerke + ') 100%)';
  }

  // ── Farbrotation (Hue-Shift über JS – robust, kombiniert mit Dim/Blur) ──
  function setHueAnim(sekunden) {
    if (hueTimer) { clearInterval(hueTimer); hueTimer = 0; }
    const scene = document.getElementById('bgScene');
    if (!scene) return;
    if (!sekunden || sekunden <= 0) { scene.style.filter = ''; return; }
    let winkel = 0;
    const schritt = 360 / (sekunden * 20); // 20 Aktualisierungen/s
    hueTimer = setInterval(() => {
      winkel = (winkel + schritt) % 360;
      scene.style.filter = 'hue-rotate(' + winkel.toFixed(1) + 'deg) brightness(calc(1 - var(--bg-dim, 0))) blur(var(--bg-blur, 0px))';
    }, 50);
  }

  // ── Partikel ──
  const pk = { canvas: null, ctx: null, raf: 0, liste: [], speed: 1, resizeHandler: null };
  function startPartikel(cfg) {
    stopPartikel();
    if (!cfg.partikel) return;
    const c = document.getElementById('partikel');
    if (!c) return;
    pk.canvas = c; pk.ctx = c.getContext('2d'); pk.speed = cfg.partikelSpeed || 1;
    pk.resizeHandler = () => { c.width = innerWidth; c.height = innerHeight; };
    pk.resizeHandler();
    removeEventListener('resize', pk.resizeHandler);
    addEventListener('resize', pk.resizeHandler);
    const n = Math.max(5, Math.min(250, Number(cfg.partikelDichte) || 60));
    pk.liste = [];
    for (let i = 0; i < n; i++) {
      pk.liste.push({
        x: Math.random() * c.width, y: Math.random() * c.height,
        r: cfg.partikelTyp === 'kreise' ? 2 + Math.random() * 22 : 0.6 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        ph: Math.random() * Math.PI * 2,
      });
    }
    const anim = () => {
      const ctx = pk.ctx, s = pk.speed;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of pk.liste) {
        p.x += p.vx * s; p.y += p.vy * s; p.ph += 0.02 * s;
        if (p.x < -30) p.x = c.width + 30; if (p.x > c.width + 30) p.x = -30;
        if (p.y < -30) p.y = c.height + 30; if (p.y > c.height + 30) p.y = -30;
        if (cfg.partikelTyp === 'sterne') {
          ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(p.ph));
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
        } else if (cfg.partikelTyp === 'kreise') {
          ctx.globalAlpha = 0.06;
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#8ab';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
        } else {
          ctx.globalAlpha = 0.12 + 0.18 * Math.abs(Math.sin(p.ph));
          ctx.fillStyle = '#cfd8ff';
          ctx.beginPath();
          ctx.arc(p.x + Math.sin(p.ph) * 8, p.y, p.r, 0, 7); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      pk.raf = requestAnimationFrame(anim);
    };
    anim();
  }
  function stopPartikel() {
    if (pk.raf) cancelAnimationFrame(pk.raf);
    pk.raf = 0;
    if (pk.resizeHandler) removeEventListener('resize', pk.resizeHandler);
    if (pk.canvas && pk.ctx) pk.ctx.clearRect(0, 0, pk.canvas.width, pk.canvas.height);
  }

  function setParallax(an) {
    if (parallaxAn === an) return;
    parallaxAn = an;
    if (!an) { document.documentElement.style.setProperty('--parallax', '0px'); return; }
    addEventListener('mousemove', (e) => {
      const y = ((e.clientY / innerHeight) - 0.5) * -24;
      document.documentElement.style.setProperty('--parallax', y.toFixed(1) + 'px');
    }, { passive: true });
  }


  // ── Rainbow-Animation (v3.1: Spur, Schatten, nahtlos) ──
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
  // ── Anwenden ──
  function apply(design, opts = {}) {
    current = merge(defaults(), design || {});
    const d = current, m = modeAufgeloest();
    const dark = m === 'dark';
    const g = d.glas, f = d.form, c = d.farben, l = d.licht;

    if (!designStyleEl) { designStyleEl = document.createElement('style'); document.head.appendChild(designStyleEl); }
    if (!extraStyleEl) { extraStyleEl = document.createElement('style'); document.head.appendChild(extraStyleEl); }

    const tint = dark ? 'rgba(16,20,38,' + g.alpha + ')' : 'rgba(255,255,255,' + g.alpha + ')';
    const text = dark ? '#eef1f7' : '#1a2030';
    const dim = dark ? 'rgba(238,241,247,.6)' : 'rgba(26,32,48,.62)';
    const inputBg = dark ? 'rgba(8,12,28,.42)' : 'rgba(255,255,255,.55)';
    const pad = f.dichte === 'kompakt' ? '12px' : f.dichte === 'luftig' ? '22px' : '16px';

    designStyleEl.textContent = ':root{' +
      '--g-blur:' + g.blur + 'px;--g-alpha:' + g.alpha + ';--g-sat:' + g.sat + ';--g-bright:' + g.bright + ';' +
      '--g-spec:' + g.spec + ';--g-edge:' + g.edge + ';--g-tint:' + tint + ';' +
      '--radius:' + f.radius + 'px;--bw:' + f.bw + 'px;--bc:' + f.bc + ';--sh:' + f.sh + ';--pad:' + pad + ';' +
      '--accent:' + c.accent + ';--accent2:' + c.accent2 + ';--ok:' + c.ok + ';--warn:' + c.warn + ';--err:' + c.err + ';' +
      '--text:' + text + ';--dim:' + dim + ';--input-bg:' + inputBg + ';' +
      "--font:'" + d.typo.font + "',system-ui,sans-serif;--fscale:" + d.typo.scale + ';' +
      '--noise:' + (d.effekte.noise ? 0.05 : 0) + ';--bg-anim:' + (d.bg.typ === 'anim' ? 1 : 0) + ';' +
      '--bg-dim:' + (d.bg.dim || 0) + ';--bg-blur:' + (d.bg.blurPx || 0) + 'px;' +
      '--glow-f:' + l.glowFarbe + ';--glow-r:' + l.glowRadius + ';--glow-t:' + l.textGlow + ';--glow-c:' + l.cardGlow + ';' +
      '--pv1:' + l.pv1 + ';--pv2:' + l.pv2 + ';--pv-a:' + l.panelVerlauf + ';' +
      '--amb-o:' + l.intensitaet + ';--amb-g:' + l.groesse + ';}';

    let extra = '#vignetteLayer{position:fixed;inset:0;z-index:-1;pointer-events:none}' +
      '.panel{box-shadow:0 1px 2px rgba(0,0,0,calc(.03 + var(--sh)*.0008)),' +
      '0 calc(4px + var(--sh)*.10px) calc(10px + var(--sh)*.30px) rgba(0,0,0,calc(.08 + var(--sh)*.0016)),' +
      '0 calc(14px + var(--sh)*.24px) calc(30px + var(--sh)*.62px) rgba(0,0,0,calc(.13 + var(--sh)*.0022)),' +
      '0 0 calc(var(--glow-r)*1px) color-mix(in srgb,var(--glow-f) calc(var(--glow-c)*55%),transparent),' +
      '0 0 calc(var(--glow-r)*2.6px) color-mix(in srgb,var(--glow-f) calc(var(--glow-c)*22%),transparent);}' +
      '.panel{background:linear-gradient(140deg,color-mix(in srgb,var(--pv1) calc(var(--pv-a)*70%),transparent),transparent 55%),' +
      'linear-gradient(320deg,color-mix(in srgb,var(--pv2) calc(var(--pv-a)*70%),transparent),transparent 55%),var(--g-tint);}' +
      '.stat .val{text-shadow:0 0 calc(var(--glow-r)*.9px) color-mix(in srgb,var(--glow-f) calc(var(--glow-t)*100%),transparent),' +
      '0 0 calc(var(--glow-r)*2px) color-mix(in srgb,var(--glow-f) calc(var(--glow-t)*40%),transparent);}' +
      '.card h3{text-shadow:0 0 calc(var(--glow-r)*.55px) color-mix(in srgb,var(--glow-f) calc(var(--glow-t)*55%),transparent);}' +
      '#ambientLicht{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}' +
      '#ambientLicht .amb{position:absolute;width:calc(var(--amb-g)*1vmax);height:calc(var(--amb-g)*1vmax);' +
      'border-radius:50%;filter:blur(48px);opacity:var(--amb-o);animation:ambDrift 22s ease-in-out infinite alternate}' +
      '#ambientLicht .amb:nth-child(1){top:-18%;left:-12%}' +
      '#ambientLicht .amb:nth-child(2){top:-12%;right:-15%;animation-duration:28s}' +
      '#ambientLicht .amb:nth-child(3){bottom:-24%;left:26%;animation-duration:34s}' +
      '@keyframes ambDrift{from{transform:translate(0,0) scale(1)}to{transform:translate(5%,-7%) scale(1.18)}}';
    if (g.blur === 0) extra += '.panel{-webkit-backdrop-filter:none;backdrop-filter:none;}';
    if (g.keinGlas) extra += '.panel::before,.panel::after{display:none!important}' +
      '.panel{border:1px solid ' + (f.bc || '#ffffff24') + '!important;}' +
      '.toast,.modal-card,.auth-card,.setup-card{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}';
    if (d.preset === 'neu') {
      extra += '.panel{border:none;background:#e4e9f5;box-shadow:calc(6px + var(--sh)*.06px) calc(6px + var(--sh)*.06px) calc(14px + var(--sh)*.2px) rgba(163,177,198,.65),calc(-6px - var(--sh)*.06px) calc(-6px - var(--sh)*.06px) calc(14px + var(--sh)*.2px) rgba(255,255,255,.95);}' +
        '.panel::before,.panel::after{display:none;}body{color:#2a3040;}:root{--text:#2a3040;--dim:rgba(42,48,64,.55);--input-bg:rgba(255,255,255,.6);}';
    }
    extraStyleEl.textContent = extra;
    document.body.dataset.preset = d.preset;
    document.documentElement.dataset.mode = m;
    document.body.classList.toggle('bg-anim', d.bg.typ === 'anim');
    document.body.classList.toggle('glow-rb', !!(d.licht && d.licht.glowRainbow && d.licht.cardGlow > 0));
    if (d.licht && d.licht.glowRainbow) {
      document.documentElement.style.setProperty('--rb-glow-i', (d.licht.glowRainbowIntensitaet != null ? d.licht.glowRainbowIntensitaet : 1));
      if (!document.documentElement.style.getPropertyValue('--rb-speed')) document.documentElement.style.setProperty('--rb-speed', (d.licht.glowRainbowSpeed || 8) + 's');
    } else if (d.rainbow && d.rainbow.speed) {
      document.documentElement.style.setProperty('--rb-speed', d.rainbow.speed + 's');
    }
    if ((d.licht && d.licht.glowRainbow) && !document.documentElement.style.getPropertyValue('--rb-speed')) {
      document.documentElement.style.setProperty('--rb-speed', '8s');
    }
    const bew = d.bewegung || { level: 'normal', countUp: true };
    document.body.classList.toggle('motion-off', bew.level === 'off');
    document.body.classList.toggle('motion-low', bew.level === 'low');
    window.__countUpAn = bew.countUp !== false;

    // Hintergrund aufbauen (inkl. Überlagerungs-Verlauf als oberste Ebene)
    const scene = document.getElementById('bgScene');
    if (scene) {
      const ebenen = [];
      if (d.bg.overlay > 0) {
        ebenen.push('linear-gradient(' + d.bg.overlayWinkel + 'deg,' +
          hexA(d.bg.overlayFarbe, d.bg.overlay) + ' 0%,' +
          hexA(d.bg.overlayFarbe, d.bg.overlay * 0.45) + ' 55%,' +
          hexA(d.bg.overlayFarbe, 0) + ' 100%)');
      }
      if (d.bg.typ === 'farbe') {
        scene.style.background = [...ebenen, d.bg.farbe].join(', ');
        scene.style.backgroundSize = 'cover';
        scene.style.backgroundPosition = 'center';
        scene.style.backgroundRepeat = 'no-repeat';
      } else if (d.bg.typ === 'bild') {
        const quelle = d.bg.bildData || d.bg.bildUrl;
        const size = d.bg.position === 'contain' ? 'contain' : 'cover';
        scene.style.background = [...ebenen, quelle ? 'url("' + quelle + '")' : d.bg.farbe].join(', ');
        scene.style.backgroundSize = [...ebenen.map(() => '100% 100%'), size].join(', ');
        scene.style.backgroundPosition = [...ebenen.map(() => 'center'), 'center'].join(', ');
        scene.style.backgroundRepeat = [...ebenen.map(() => 'no-repeat'), 'no-repeat'].join(', ');
      } else {
        const f3 = d.bg.f3 && d.bg.f3 !== d.bg.f2 ? ', ' + d.bg.f3 : '';
        ebenen.push('linear-gradient(' + d.bg.winkel + 'deg,' + d.bg.f1 + ',' + d.bg.f2 + f3 + ')');
        scene.style.background = ebenen.join(', ');
        scene.style.backgroundSize = 'cover';
        scene.style.backgroundPosition = 'center';
        scene.style.backgroundRepeat = 'no-repeat';
      }
    }
    setParallax(!!d.bg.parallax);
    setRainbow(d.rainbow);
    startPartikel(d.bg);
    setVignette(d.bg.vignette);
    setHueAnim(d.bg.hueAnim);
    ambientLicht(l);

    try { localStorage.setItem('lumiox_design_v2', JSON.stringify(d)); } catch (_) {}
    if (opts.speichern !== false && document.getElementById('page')) {
      API.post('/design', { design: d }).catch(() => {});
    }
  }

  function applyPreset(id, opts = {}) {
    const p = PRESETS[id];
    if (!p) return;
    apply({ preset: id, ...JSON.parse(JSON.stringify(p.d)) }, opts);
  }
  function currentDesign() { return JSON.parse(JSON.stringify(current)); }

  // ══════════════════ EDITOR ══════════════════
  function editor(host) {
    host.innerHTML = '';
    const zeile = (label, ctrl) => {
      const r = el('<div style="display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:center;margin-bottom:9px"><span class="small dim">' + esc(label) + '</span></div>');
      r.appendChild(ctrl);
      return r;
    };
    const sliderZeile = (label, min, max, step, hole, setz, fmt) => {
      const r = el('<div style="display:grid;grid-template-columns:150px 1fr 64px;gap:10px;align-items:center;margin-bottom:9px"><span class="small dim">' + esc(label) + '</span><span class="wert small mono" style="text-align:right"></span></div>');
      const s = el('<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + hole() + '">');
      const wertEl = $('.wert', r);
      const aktual = () => { wertEl.textContent = fmt ? fmt(s.value) : s.value; };
      s.addEventListener('input', () => { setz(parseFloat(s.value)); aktual(); });
      r.insertBefore(s, wertEl);
      aktual();
      return r;
    };
    const farb = (wert, fn) => {
      const i = el('<input type="color" value="' + wert + '">');
      i.addEventListener('input', () => fn(i.value));
      return i;
    };
    const farbZeile = (label, hole, setz) => {
      const r = el('<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px"><span class="small dim" style="flex:1">' + esc(label) + '</span></div>');
      r.appendChild(farb(hole(), setz));
      return r;
    };
    const tog = (wert, fn) => {
      const w = el('<label class="toggle"><input type="checkbox" ' + (wert ? 'checked' : '') + '><i></i></label>');
      $('input', w).addEventListener('change', () => fn($('input', w).checked));
      return w;
    };
    const toggleZeile = (label, hole, setz) => {
      const r = el('<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px"><span class="small dim" style="flex:1">' + esc(label) + '</span></div>');
      r.appendChild(tog(hole(), setz));
      return r;
    };
    const txt = (wert, fn, platz) => {
      const i = el('<input class="input" value="' + esc(wert || '') + '" placeholder="' + esc(platz || '') + '">');
      i.addEventListener('change', () => fn(i.value));
      return i;
    };
    const sel = (optionen, wert, fn) => {
      const s = el('<select class="input">' + optionen.map((o) =>
        '<option value="' + esc(o[0]) + '"' + (o[0] === wert ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>');
      s.addEventListener('change', () => fn(s.value));
      return s;
    };
    const karte = (titel, ...kinder) => {
      const k = el('<section class="panel card"><h3>' + titel + '</h3></section>');
      kinder.flat().forEach((x) => k.appendChild(x));
      host.appendChild(k);
      return k;
    };

    // Presets
    const presetGrid = el('<div class="preset-grid mb"></div>');
    const neuZeichnen = () => {
      presetGrid.innerHTML = '';
      for (const p of presetListe()) {
        const b = el('<button type="button" class="preset-card ' + (current.preset === p.id ? 'aktiv' : '') + '"><div class="mini" style="background:' + p.mini + '"></div><span>' + esc(p.name) + '</span></button>');
        b.addEventListener('click', () => { applyPreset(p.id); neuZeichnen(); toast('Preset angewendet: ' + p.name, 'ok'); });
        presetGrid.appendChild(b);
      }
    };
    neuZeichnen();
    karte('🎨 Presets', presetGrid,
      el('<div class="row"><button class="btn small" id="dPresetSave">💾 Als Preset speichern</button>' +
        '<select class="input small" id="dPresetSel" style="max-width:180px"></select>' +
        '<button class="btn small" id="dPresetLoad">Laden</button>' +
        '<button class="btn small" id="dPresetDel">Löschen</button>' +
        '<button class="btn small" id="dExport">⬇ Export</button>' +
        '<label class="btn small" style="position:relative">⬆ Import<input type="file" id="dImport" accept=".json" hidden></label>' +
        '<button class="btn small danger" id="dReset">Auf Standard</button></div>'));
    (async () => {
      try {
        const { liste } = await API.get('/designpresets');
        const sel2 = $('#dPresetSel', host);
        sel2.innerHTML = '<option value="">– gespeicherte Presets –</option>' +
          liste.map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
        $('#dPresetSave', host).addEventListener('click', async () => {
          const name = prompt('Name fürs Preset:', 'Mein Design');
          if (!name) return;
          await API.post('/designpresets', { name, design: currentDesign() });
          toast('Preset gespeichert ✔', 'ok');
        });
        $('#dPresetLoad', host).addEventListener('click', async () => {
          if (!sel2.value) return toast('Kein Preset gewählt', 'err');
          const { liste: l2 } = await API.get('/designpresets');
          const p = l2.find((x) => x.id === sel2.value);
          if (p) { apply(p.design); neuZeichnen(); toast('Preset geladen ✔', 'ok'); }
        });
        $('#dPresetDel', host).addEventListener('click', async () => {
          if (!sel2.value) return;
          if (!(await confirmDlg('Preset wirklich löschen?'))) return;
          await API.del('/designpresets/' + sel2.value);
          sel2.remove(sel2.selectedIndex);
          toast('Gelöscht ✔', 'ok');
        });
      } catch (_) {}
    })();
    $('#dExport', host).addEventListener('click', () => download('lumiox-design.json', JSON.stringify(currentDesign(), null, 2)));
    $('#dImport', host).addEventListener('change', (e) => {
      const f2 = e.target.files[0]; if (!f2) return;
      const r = new FileReader();
      r.onload = () => {
        try { apply(JSON.parse(r.result)); neuZeichnen(); toast('Design importiert ✔', 'ok'); }
        catch (_) { toast('Ungültige Design-Datei', 'err'); }
      };
      r.readAsText(f2);
    });
    $('#dReset', host).addEventListener('click', async () => {
      if (!(await confirmDlg('Design auf Standard zurücksetzen?'))) return;
      apply(defaults()); neuZeichnen();
    });

    karte('🌗 Modus',
      zeile('Hell/Dunkel', sel([['dark', 'Dunkel'], ['light', 'Hell'], ['auto', 'Auto (nach Uhrzeit)']],
        current.mode, (v) => { current.mode = v; apply(current, { speichern: false }); })));

    const gAkt = (k) => (v) => { current.glas[k] = v; apply(current, { speichern: false }); };
    karte('🧊 Glas',
      toggleZeile('Glas-Optik komplett aus (empfohlen: Solid-Look)', () => !!current.glas.keinGlas,
        (v) => { current.glas.keinGlas = v; apply(current, { speichern: false }); }),
      sliderZeile('Blur-Schärfe (0–40 px)', 0, 40, 1, () => current.glas.blur, gAkt('blur'), (v) => v + ' px'),
      sliderZeile('Deckkraft', 0, 1, 0.01, () => current.glas.alpha, gAkt('alpha'), (v) => Math.round(v * 100) + ' %'),
      sliderZeile('Sättigung', 0, 3, 0.05, () => current.glas.sat, gAkt('sat'), (v) => '×' + v),
      sliderZeile('Helligkeit', 0.6, 1.6, 0.01, () => current.glas.bright, gAkt('bright'), (v) => '×' + v),
      sliderZeile('Glanz-Intensität', 0, 1, 0.01, () => current.glas.spec, gAkt('spec'), (v) => Math.round(v * 100) + ' %'),
      sliderZeile('Kanten-Glanz', 0, 1, 0.01, () => current.glas.edge, gAkt('edge'), (v) => Math.round(v * 100) + ' %'));

    const fAkt = (k) => (v) => { current.form[k] = v; apply(current, { speichern: false }); };
    karte('📐 Form',
      sliderZeile('Eckenradius', 0, 32, 1, () => current.form.radius, fAkt('radius'), (v) => v + ' px'),
      sliderZeile('Rahmenbreite', 0, 4, 1, () => current.form.bw, fAkt('bw'), (v) => v + ' px'),
      zeile('Rahmenfarbe', farb(rgbaBisHex(current.form.bc), (v) => fAkt('bc')(v + '55'))),
      sliderZeile('Schattentiefe', 0, 100, 1, () => current.form.sh, fAkt('sh'), (v) => v),
      zeile('Dichte', sel([['kompakt', 'Kompakt'], ['normal', 'Normal'], ['luftig', 'Luftig']], current.form.dichte, (v) => fAkt('dichte')(v))));

    const cAkt = (k) => (v) => { current.farben[k] = v; apply(current, { speichern: false }); };
    karte('🌈 Farben',
      farbZeile('Akzentfarbe', () => current.farben.accent, cAkt('accent')),
      farbZeile('Sekundärfarbe', () => current.farben.accent2, cAkt('accent2')),
      farbZeile('Erfolg', () => current.farben.ok, cAkt('ok')),
      farbZeile('Warnung', () => current.farben.warn, cAkt('warn')),
      farbZeile('Fehler', () => current.farben.err, cAkt('err')));

    const lAkt = (k) => (v) => { current.licht[k] = v; apply(current, { speichern: false }); };
    karte('💡 Licht & Glow',
      sliderZeile('Text-Glow', 0, 1, 0.05, () => current.licht.textGlow, lAkt('textGlow'), (v) => Math.round(v * 100) + ' %'),
      sliderZeile('Karten-Glow', 0, 1, 0.05, () => current.licht.cardGlow, lAkt('cardGlow'), (v) => Math.round(v * 100) + ' %'),
      farbZeile('Glow-Farbe', () => current.licht.glowFarbe, lAkt('glowFarbe')),
      sliderZeile('Glow-Radius', 0, 60, 1, () => current.licht.glowRadius, lAkt('glowRadius'), (v) => v + ' px'),
      el('<hr class="trenner">'),
      sliderZeile('Panel-Verlauf (innen)', 0, 1, 0.05, () => current.licht.panelVerlauf, lAkt('panelVerlauf'), (v) => Math.round(v * 100) + ' %'),
      farbZeile('Verlauf Farbe 1 (links)', () => current.licht.pv1, lAkt('pv1')),
      farbZeile('Verlauf Farbe 2 (rechts)', () => current.licht.pv2, lAkt('pv2')),
      el('<hr class="trenner">'),
      toggleZeile('Ambient-Licht', () => current.licht.ambient, lAkt('ambient')),
      farbZeile('Licht 1 (links oben)', () => current.licht.farbe1, lAkt('farbe1')),
      farbZeile('Licht 2 (rechts oben)', () => current.licht.farbe2, lAkt('farbe2')),
      farbZeile('Licht 3 (unten)', () => current.licht.farbe3, lAkt('farbe3')),
      sliderZeile('Licht-Intensität', 0, 1, 0.05, () => current.licht.intensitaet, lAkt('intensitaet'), (v) => Math.round(v * 100) + ' %'),
      sliderZeile('Licht-Größe', 20, 120, 5, () => current.licht.groesse, lAkt('groesse'), (v) => v + ' %'));

    const tAkt = (k) => (v) => { current.typo[k] = v; apply(current, { speichern: false }); };
    karte('🔤 Typografie',
      zeile('Schriftart', sel([['Inter', 'Inter'], ['Roboto', 'Roboto'], ['JetBrains Mono', 'JetBrains Mono'], ['System', 'System']],
        current.typo.font, (v) => tAkt('font')(v === 'System' ? 'system-ui' : v))),
      sliderZeile('Schriftgröße', 0.8, 1.3, 0.01, () => current.typo.scale, tAkt('scale'), (v) => Math.round(v * 100) + ' %'));

    // ── HINTERGRUND (FIX: schreibt direkt in current.bg) ──
    const bgBox = el('<div></div>');
    karte('🖼️ Hintergrund', bgBox);
    function bgEditor() {
      bgBox.innerHTML = '';
      const b = current.bg;
      // FIX: immer in current.bg schreiben (frisches Objekt nach jedem apply)
      const bAkt = (k) => (v) => {
        current.bg[k] = v;
        apply(current, { speichern: false });
        if (k === 'typ') bgEditor();
      };
      bgBox.appendChild(zeile('Typ', sel(
        [['farbe', 'Vollfarbe'], ['verlauf', 'Verlauf'], ['bild', 'Bild (URL/Upload)'], ['anim', 'Animierter Verlauf']],
        b.typ, bAkt('typ'))));
      if (b.typ === 'farbe') bgBox.appendChild(farbZeile('Farbe', () => b.farbe, bAkt('farbe')));
      if (b.typ === 'verlauf' || b.typ === 'anim') {
        bgBox.appendChild(farbZeile('Farbe 1', () => b.f1, bAkt('f1')));
        bgBox.appendChild(farbZeile('Farbe 2', () => b.f2, bAkt('f2')));
        bgBox.appendChild(farbZeile('Farbe 3 (optional)', () => b.f3, bAkt('f3')));
        bgBox.appendChild(sliderZeile('Winkel', 0, 360, 5, () => b.winkel, bAkt('winkel'), (v) => v + '°'));
      }
      if (b.typ === 'bild') {
        bgBox.appendChild(zeile('Bild-URL', txt(b.bildUrl, (v) => { current.bg.bildUrl = v; apply(current, { speichern: false }); }, 'https://…')));
        const up = el('<input type="file" accept="image/*" hidden>');
        const btn = el('<button class="btn small">📁 Datei hochladen</button>');
        btn.addEventListener('click', () => up.click());
        up.addEventListener('change', () => {
          const f2 = up.files[0]; if (!f2) return;
          if (f2.size > 2 * 1024 * 1024) return toast('Bild zu groß (max. 2 MB)', 'err');
          const r = new FileReader();
          r.onload = () => { current.bg.bildData = r.result; apply(current, { speichern: false }); toast('Bild gesetzt ✔', 'ok'); };
          r.readAsDataURL(f2);
        });
        bgBox.appendChild(zeile('…oder Upload', btn));
        bgBox.appendChild(zeile('Position', sel([['cover', 'Cover (füllen)'], ['contain', 'Contain (einpassen)']], b.position, bAkt('position'))));
        bgBox.appendChild(sliderZeile('Abdunkelung', 0, 1, 0.05, () => b.dim, bAkt('dim'), (v) => Math.round(v * 100) + ' %'));
        bgBox.appendChild(sliderZeile('Unschärfe', 0, 30, 1, () => b.blurPx, bAkt('blurPx'), (v) => v + ' px'));
        bgBox.appendChild(toggleZeile('Parallax', () => b.parallax, bAkt('parallax')));
      }
      // NEU: 3 weitere Hintergrund-Features
      bgBox.appendChild(el('<hr class="trenner">'));
      bgBox.appendChild(sliderZeile('Vignette (Rand-Abdunklung)', 0, 1, 0.05, () => b.vignette, bAkt('vignette'), (v) => Math.round(v * 100) + ' %'));
      bgBox.appendChild(sliderZeile('Farbrotation (Sek./Umlauf, 0 = aus)', 0, 60, 1, () => b.hueAnim, bAkt('hueAnim'), (v) => v ? v + ' s' : 'aus'));
      bgBox.appendChild(el('<hr class="trenner">'));
      bgBox.appendChild(farbZeile('Überlagerungs-Farbe (2. Ebene)', () => b.overlayFarbe, bAkt('overlayFarbe')));
      bgBox.appendChild(sliderZeile('Überlagerung Deckkraft', 0, 1, 0.05, () => b.overlay, bAkt('overlay'), (v) => Math.round(v * 100) + ' %'));
      bgBox.appendChild(sliderZeile('Überlagerung Winkel', 0, 360, 5, () => b.overlayWinkel, bAkt('overlayWinkel'), (v) => v + '°'));
      bgBox.appendChild(el('<hr class="trenner">'));
      bgBox.appendChild(toggleZeile('Partikel-Effekt', () => b.partikel, bAkt('partikel')));
      bgBox.appendChild(zeile('Partikel-Typ', sel(
        [['sterne', 'Sterne ✨'], ['kreise', 'Kreise ⚪'], ['staub', 'Staub 🌫️']], b.partikelTyp, bAkt('partikelTyp'))));
      bgBox.appendChild(sliderZeile('Partikel-Dichte', 5, 250, 5, () => b.partikelDichte, bAkt('partikelDichte'), (v) => v));
      bgBox.appendChild(sliderZeile('Partikel-Speed', 0.1, 4, 0.1, () => b.partikelSpeed, bAkt('partikelSpeed'), (v) => '×' + v));
    }
    bgEditor();

    // ── RAINBOW-ANIMATION v3 ──
    {
      const MUSTER = [
        ['🌈 Klassisch', ['#ff004c', '#ff9d00', '#ffe600', '#2bff88', '#22d3ee', '#4463ff', '#b06cff']],
        ['🌅 Sonnenuntergang', ['#ff4e00', '#ff8a00', '#ffb300', '#ff2e63', '#c81d76']],
        ['🌊 Ozean', ['#032a5c', '#0e7490', '#22d3ee', '#67e8f9', '#3b82f6']],
        ['🎆 Neon-Party', ['#ff00e5', '#00f0ff', '#faff00', '#8b5cf6']],
        ['🌲 Aurora', ['#00ffa3', '#22d3ee', '#3b82f6', '#8b5cf6']],
        ['🔥 Feuer', ['#ff0a0a', '#ff6a00', '#ffc300', '#ff3d00']],
        ['🍬 Candy', ['#ff8ad8', '#c084fc', '#8ad9ff']],
      ];
      // WICHTIG: Immer FRISCH aus current lesen (kein gemerktes Objekt –
      // genau das war der Bug, warum Muster "nicht gingen")
      const rk = () => {
        if (!current.rainbow || typeof current.rainbow !== 'object') current.rainbow = {};
        const r = current.rainbow;
        if (!Array.isArray(r.ziele)) r.ziele = ['hintergrund'];
        if (!Array.isArray(r.textZiele) || !r.textZiele.length) r.textZiele = ['ueberschriften', 'zahlen', 'logo'];
        if (!Array.isArray(r.farben) || r.farben.length < 2) r.farben = ['#ff004c', '#ff9d00', '#ffe600', '#2bff88', '#22d3ee', '#b06cff'];
        if (!r.speed) r.speed = 10;
        if (r.deckkraft == null) r.deckkraft = 0.85;
        return r;
      };
      const anw = () => apply(current, { speichern: false });
      const boxR = el('<div></div>');

      const zielBox = el('<div class="row mb" style="gap:16px;flex-wrap:wrap"></div>');
      [['hintergrund', '🌌 Hintergrund'], ['leisten', '📊 Leisten & Buttons'], ['text', '🔤 Text'], ['rahmen', '🖼️ Rainbow-Spur (Rahmen um Panels)'], ['glow', '💡 Rainbow-Schatten (Glow)']].forEach(([wert, label]) => {
        const l = el('<label style="display:flex;gap:7px;align-items:center;font-size:.85rem;cursor:pointer">' +
          '<input type="checkbox" value="' + wert + '"><span>' + label + '</span></label>');
        l.querySelector('input').addEventListener('change', (e) => {
          const r = rk();
          if (e.target.checked) { if (!r.ziele.includes(e.target.value)) r.ziele.push(e.target.value); }
          else r.ziele = r.ziele.filter((x) => x !== e.target.value);
          anw();
          if (e.target.value === 'text') zeichneTextZiele();
        });
        zielBox.appendChild(l);
      });

      const textBox = el('<div class="mb" style="margin-left:26px"></div>');
      function zeichneTextZiele() {
        const r = rk();
        const an = r.ziele.includes('text');
        textBox.innerHTML = an
          ? '<span class="dim small" style="display:block;margin-bottom:6px">Welcher Text? (Mehrfachauswahl)</span>'
          : '<span class="dim small">„Text" oben anwählen für die Feinauswahl</span>';
        [['ueberschriften', 'Alle Überschriften (h2/h3)'],
         ['zahlen', 'Statistik-Zahlen (Werte auf Karten)'],
         ['logo', 'Logo & Wortmarke']].forEach(([wert, label]) => {
          const l = el('<label style="display:flex;gap:7px;align-items:center;font-size:.82rem;cursor:pointer;' +
            (an ? '' : 'opacity:.45') + '"><input type="checkbox" value="' + wert + '"' +
            (r.textZiele.includes(wert) ? ' checked' : '') + (an ? '' : ' disabled') + '><span>' + label + '</span></label>');
          l.querySelector('input').addEventListener('change', (e) => {
            const r2 = rk();
            const v = e.target.value;
            if (e.target.checked) {
              if (!r2.textZiele.includes(v)) r2.textZiele.push(v);
            } else {
              if (r2.textZiele.length <= 1) {
                e.target.checked = true;
                return toast('Mindestens ein Text-Element muss an bleiben', 'err');
              }
              r2.textZiele = r2.textZiele.filter((x) => x !== v);
            }
            anw();
          });
          textBox.appendChild(l);
        });
      }

      const presetRow = el('<div class="row mb" style="flex-wrap:wrap;gap:8px"></div>');
      MUSTER.forEach(([name, fs]) => {
        const b = el('<button class="btn small" style="background:linear-gradient(90deg,' + fs.join(',') + ');color:#fff;border:none;text-shadow:0 1px 3px rgba(0,0,0,.7)">' + esc(name) + '</button>');
        b.addEventListener('click', () => {
          const r = rk();
          r.farben = fs.slice();
          r.aktiv = true;
          zeichneFarben();
          anw();
          toast('Muster aktiv: ' + name, 'ok');
        });
        presetRow.appendChild(b);
      });

      function zeichneFarben() {
        const r = rk();
        boxR.innerHTML = '';
        r.farben.forEach((f, i) => {
          const row = el('<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">' +
            '<span class="dim small mono" style="width:34px">#' + (i + 1) + '</span></div>');
          const inp = el('<input type="color" value="' + (f || '#ffffff') + '">');
          inp.addEventListener('input', () => { rk().farben[i] = inp.value; anw(); });
          const del = el('<button class="btn small danger">✕</button>');
          del.addEventListener('click', () => {
            const r2 = rk();
            if (r2.farben.length <= 2) return toast('Mindestens 2 Farben nötig', 'err');
            r2.farben.splice(i, 1);
            zeichneFarben();
            anw();
          });
          row.appendChild(inp);
          row.appendChild(del);
          boxR.appendChild(row);
        });
      }

      karte('🌈 Rainbow-Animation',
        toggleZeile('Aktiv', () => !!rk().aktiv, (v) => { rk().aktiv = v; anw(); }),
        el('<b class="small" style="display:block;margin-bottom:8px">Wo soll es regnen?</b>'),
        zielBox,
        textBox,
        el('<b class="small" style="display:block;margin:8px 0">Fertige Muster (Klick = sofort aktiv)</b>'),
        presetRow,
        sliderZeile('Geschwindigkeit (Sek. pro Umlauf)', 1, 30, 1, () => rk().speed, (v) => { rk().speed = v; anw(); }, (v) => v + ' s'),
        sliderZeile('Deckkraft (Hintergrund)', 0, 1, 0.05, () => rk().deckkraft, (v) => { rk().deckkraft = v; anw(); }, (v) => Math.round(v * 100) + ' %'),
        el('<hr class="trenner">'),
        el('<b class="small">Eigene Farben (2–8)</b>'),
        boxR,
        (() => {
          const b = el('<button class="btn small mt">+ Farbe hinzufügen</button>');
          b.addEventListener('click', () => {
            const r = rk();
            if (r.farben.length >= 8) return toast('Maximum: 8 Farben', 'err');
            r.farben.push('#ffffff');
            zeichneFarben();
            anw();
          });
          return b;
        })(),
        el('<p class="dim small mt">Nahtloser Loop: die erste Farbe fließt in die letzte – kein Klippen am Übergang.</p>')
      );
      zeichneTextZiele();
      zeichneFarben();
    }

    karte('✨ Effekte',
      toggleZeile('Noise-Textur (feines Rauschen)', () => current.effekte.noise,
        (v) => { current.effekte.noise = v; apply(current, { speichern: false }); }));

    karte('🎬 Bewegung & Animationen',
      zeile('Animations-Stärke', sel([['off', 'Aus (max. Performance)'], ['low', 'Reduziert'], ['normal', 'Normal']],
        (current.bewegung || {}).level || 'normal', (v) => { current.bewegung = current.bewegung || {}; current.bewegung.level = v; apply(current, { speichern: false }); })),
      toggleZeile('Zahlen hochzählen (Übersicht)', () => (current.bewegung || {}).countUp !== false,
        (v) => { current.bewegung = current.bewegung || {}; current.bewegung.countUp = v; apply(current, { speichern: false }); }));

    host.appendChild(el('<p class="dim small center" style="margin-top:8px">Jede Änderung wird sofort live angewendet und automatisch gespeichert. Kein Reload nötig.</p>'));
    return host;
  }

  function rgbaBisHex(v) {
    if (/^#[0-9a-f]{6}/i.test(v)) return v.slice(0, 7);
    const m = String(v).match(/\d+/g);
    if (!m) return '#ffffff';
    return '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
  }

  try {
    const lokal = localStorage.getItem('lumiox_design_v2');
    if (lokal) apply(JSON.parse(lokal), { speichern: false });
    else applyPreset('lumiosolid', { speichern: false });
  } catch (_) { applyPreset('lumiosolid', { speichern: false }); }

  return { apply, applyPreset, current: currentDesign, presetListe, editor, defaults };
})();
