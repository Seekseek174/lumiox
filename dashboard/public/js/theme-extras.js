// ═══════════════════════════════════════════════════════════════
// LUMIOX GEHEIMPANEL – 100 % eigenständig (keine app.js-Abhängigkeit)
// Combo: "2085!" tippen ODER 3 Sek. aufs Logo drücken (Handy)
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const COMBO = '2085!';
  let idx = 0;

  // ── Sichtbare Punkte als Eingabe-Feedback ──
  function punkte() {
    let h = document.getElementById('comboDots');
    if (!h) {
      h = document.createElement('div');
      h.id = 'comboDots';
      h.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:99998;font:700 22px monospace;color:#22d3ee;text-shadow:0 0 10px #22d3ee;pointer-events:none';
      document.body.appendChild(h);
    }
    h.textContent = '•'.repeat(idx);
  }
  function punkteWeg() {
    const h = document.getElementById('comboDots');
    if (h) h.textContent = '';
  }

  // ── Combo-Laucher ──
  document.addEventListener('keydown', (e) => {
    const ziel = e.target;
    if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' ||
                 ziel.tagName === 'SELECT' || ziel.isContentEditable)) return;
    const z = e.key.length === 1 ? e.key : '';
    if (!z) return;
    idx = (z === COMBO[idx]) ? idx + 1 : (z === COMBO[0] ? 1 : 0);
    punkte();
    if (idx >= COMBO.length) {
      idx = 0;
      setTimeout(punkteWeg, 450);
      oeffnePanel();
    }
  });

  // ── Handy: 3 Sek. Logo-Druck ──
  let timer = null;
  document.addEventListener('DOMContentLoaded', () => {
    const logo = document.querySelector('.logo');
    if (!logo) return;
    logo.addEventListener('touchstart', () => { timer = setTimeout(oeffnePanel, 3000); }, { passive: true });
    ['touchend', 'touchcancel', 'touchmove'].forEach((ev) =>
      logo.addEventListener(ev, () => clearTimeout(timer), { passive: true }));
  });

  // ── Eigene Toast- & API-Helfer ──
  function toast(msg, typ) {
    const host = document.getElementById('toasts') || document.body;
    const t = document.createElement('div');
    t.className = 'toast ' + (typ || 'info');
    t.style.cssText = 'position:relative;padding:12px 18px;border-radius:14px;background:rgba(24,28,46,.95);color:#eef1f7;border-left:4px solid ' +
      (typ === 'ok' ? '#2ECC71' : typ === 'err' ? '#E74C3C' : '#6c8cff') +
      ';box-shadow:0 10px 30px rgba(0,0,0,.4);font:500 14px system-ui;margin-top:8px;max-width:340px';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  async function api(methode, url, body) {
    const opt = { method: methode, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const res = await fetch('/api' + url, opt);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }
  const fmt = (n) => Number(n || 0).toLocaleString('de-DE');
  const esc = (t) => String(t ?? '').replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  function gid_() { const s = document.getElementById('guildSelect'); return s ? s.value : ''; }

  // ── Das Panel ──
  function oeffnePanel() {
    if (document.getElementById('geheimOverlay')) return;
    toast('🔓 Zutritt bestätigt …', 'ok');

    const overlay = document.createElement('div');
    overlay.id = 'geheimOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:90000;background:rgba(5,8,18,.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px';
    const karte = document.createElement('div');
    karte.style.cssText = 'width:100%;max-width:640px;max-height:88vh;overflow-y:auto;background:rgba(14,18,34,.97);border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:18px;color:#eef1f7;font:15px/1.5 system-ui;box-shadow:0 30px 80px rgba(0,0,0,.7)';
    karte.innerHTML = `
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <h3 style="flex:1;font-size:18px">🌌 GEHEIMES PANEL</h3>
        <button id="ghX" style="background:none;border:none;color:#8b93a7;font-size:20px;cursor:pointer">✕</button>
      </div>
      <p style="color:#8b93a7;font-size:13px;margin-bottom:12px">🔒 Offiziell existiert dieses Panel nicht.</p>
      <div id="ghTabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button class="ghT" data-t="eintraege">🗑️ Einträge</button>
        <button class="ghT" data-t="system">🚨 System</button>
        <button class="ghT" data-t="kasse">💰 Kasse</button>
        <button class="ghT" data-t="wartung">🧹 Wartung</button>
        <button class="ghT" data-t="dev">📊 Dev</button>
        <button class="ghT" data-t="trailers">🎬 Trailer</button>
        <button class="ghT" data-t="markt">📈 Markt</button>
        <button class="ghT" data-t="diagramm">🎨 Diagramm</button>
        <button class="ghT" data-t="spion">🕵️ Spion</button>
        <button class="ghT" data-t="nuke">💣 Nuke</button>
        <button class="ghT" data-t="troll">🎭 Troll</button>
      </div>
      <div id="ghInhalt"><p style="color:#8b93a7">Lade …</p></div>
      <style>
        #geheimOverlay .ghT { padding:7px 13px;border-radius:10px;border:1px solid rgba(127,127,127,.3);
          background:rgba(127,127,127,.1);color:#eef1f7;cursor:pointer;font:500 13px system-ui }
        #geheimOverlay .ghT.aktiv { background:linear-gradient(120deg,#22d3ee,#f43f5e);border-color:transparent;color:#fff }
        #geheimOverlay .ghK { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
          border-radius:14px;padding:14px;margin-bottom:12px }
        #geheimOverlay .ghK h4 { margin:0 0 10px;font-size:15px }
        #geheimOverlay .ghI { width:100%;padding:9px 12px;border-radius:10px;border:1px solid rgba(127,127,127,.3);
          background:rgba(8,12,28,.5);color:#eef1f7;font:14px system-ui;margin-bottom:8px;box-sizing:border-box }
        #geheimOverlay .ghB { padding:9px 16px;border-radius:10px;border:none;cursor:pointer;font:600 13px system-ui;color:#fff }
        #geheimOverlay .ghB.p { background:linear-gradient(120deg,#22d3ee,#818cf8) }
        #geheimOverlay .ghB.r { background:#c0392b }
        #geheimOverlay .ghU { display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;
          cursor:pointer;border:1px solid transparent;margin-bottom:4px }
        #geheimOverlay .ghU:hover { background:rgba(127,127,127,.1) }
        #geheimOverlay .ghU.aktiv { border-color:#22d3ee }
        #geheimOverlay .badge { font-size:11px;padding:2px 9px;border-radius:20px;background:rgba(244,63,94,.18);color:#fda4af }
        #geheimOverlay .badge.g { background:rgba(52,211,153,.16);color:#6ee7b7 }
        #geheimOverlay .dim { color:#8b93a7 }
        #geheimOverlay pre { white-space:pre-wrap;font:12px ui-monospace;max-height:220px;overflow:auto;
          background:rgba(0,0,0,.3);padding:10px;border-radius:10px }
      </style>`;
    overlay.appendChild(karte);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    karte.querySelector('#ghX').addEventListener('click', () => overlay.remove());

    let st = null;
    const inhalt = karte.querySelector('#ghInhalt');

    // Tabs
    karte.querySelectorAll('.ghT').forEach((b) => b.addEventListener('click', () => {
      karte.querySelectorAll('.ghT').forEach((x) => x.classList.toggle('aktiv', x === b));
      zeige(b.dataset.t);
    }));

    async function start() {
      try { st = await api('GET', '/secret/state?guildId=' + gid_()); } catch (_) {}
      karte.querySelector('.ghT[data-t=eintraege]').classList.add('aktiv');
      await zeige('eintraege');
    }

    async function zeige(tab) {
      const gid = gid_();
      if (tab === 'eintraege') {
        inhalt.innerHTML = '<div class="ghK"><h4>🗑️ Mod-Einträge verwalten</h4>' +
          '<input class="ghI" id="ghSuch" placeholder="🔍 Spieler suchen …">' +
          '<div id="ghListe" style="max-height:190px;overflow-y:auto"><p class="dim">Lade …</p></div>' +
          '<div id="ghVor" style="margin:8px 0;font-size:13px" class="dim"></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><label style="display:flex;gap:6px;align-items:center;font-size:12px">' +
          '<input type="checkbox" id="ghAuch"> Auch KI-Erkennungen</label>' +
          '<button class="ghB p" id="ghResolve" style="margin-left:auto;background:#2c7a52">✅ Erledigt setzen</button>' +
          '<button class="ghB r" id="ghPurge">🗑️ Löschen</button></div></div>';
        let gew = null, alle = [];
        async function lade() {
          try {
            alle = (await api('GET', '/secret/userlist?guildId=' + gid)).liste;
            zeichnen(karte.querySelector('#ghSuch').value.toLowerCase().trim());
          } catch (e) { karte.querySelector('#ghListe').innerHTML = '<p class="dim">' + esc(e.message) + '</p>'; }
        }
        function zeichnen(f) {
          const box = karte.querySelector('#ghListe');
          const gf = alle.filter((u) => !f || u.name.toLowerCase().includes(f) || u.userId.includes(f));
          box.innerHTML = gf.length ? '' : '<p class="dim">Keine Spieler mit Einträgen. 🎉</p>';
          for (const u of gf) {
            const z = document.createElement('div');
            z.className = 'ghU';
            z.innerHTML = (u.avatar ? '<img src="' + esc(u.avatar) + '" style="width:28px;height:28px;border-radius:50%">' : '') +
              '<div style="flex:1"><b style="font-size:13px">' + esc(u.name) + '</b>' +
              '<div class="dim" style="font-size:11px;font-family:monospace">' + esc(u.userId).slice(-8) + '</div></div>' +
              '<span class="badge">' + u.eintraege + ' Einträge</span>' +
              (u.erkennungen ? '<span class="badge" style="background:rgba(129,140,248,.2);color:#c7d2fe">' + u.erkennungen + ' KI</span>' : '');
            z.addEventListener('click', () => {
              gew = u;
              box.querySelectorAll('.ghU').forEach((x) => x.classList.toggle('aktiv', x === z));
              karte.querySelector('#ghVor').innerHTML = 'Ausgewählt: <b>' + esc(u.name) + '</b> · ' + u.eintraege + ' Einträge';
            });
            box.appendChild(z);
          }
        }
        karte.querySelector('#ghSuch').addEventListener('input', (e) => zeichnen(e.target.value.toLowerCase().trim()));
        karte.querySelector('#ghResolve').addEventListener('click', async () => {
          if (!gew) return toast('Erst einen Spieler anklicken', 'err');
          const r = await api('POST', '/secret/resolve?guildId=' + gid, { userId: gew.userId });
          toast(r.erledigt + ' Einträge auf erledigt ✔', 'ok'); lade();
        });
        karte.querySelector('#ghPurge').addEventListener('click', async () => {
          if (!gew) return toast('Erst einen Spieler anklicken', 'err');
          if (!confirm('WIRKLICH ALLE Einträge von ' + gew.name + ' löschen? Unumkehrbar (wird protokolliert).')) return;
          const r = await api('POST', '/secret/purge?guildId=' + gid, { userId: gew.userId, auchErkennungen: karte.querySelector('#ghAuch').checked });
          toast('Gelöscht: ' + r.geloescht + ' Einträge' + (r.det ? ' + ' + r.det + ' KI' : ''), 'ok');
          gew = null; lade();
        });
        lade();
      }

      if (tab === 'system') {
        inhalt.innerHTML = '<div class="ghK"><h4>🚨 PANIK-Modus</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 10px">Wortfilter + Auto-Mod + KI-Moderation gleichzeitig aus/an.</p>' +
          '<span class="badge ' + (st && st.panik ? '' : 'g') + '">' + (st ? (st.panik ? 'PANIK AKTIV' : 'Moderation aktiv') : '?') + '</span> ' +
          '<button class="ghB ' + (st && st.panik ? 'p' : 'r') + '" id="ghPanik">' +
          (st && st.panik ? '🔊 Alles einschalten' : '🚨 ALLES aus') + '</button></div>';
        karte.querySelector('#ghPanik').addEventListener('click', async () => {
          const an = !(st && st.panik);
          if (an && !confirm('Moderation komplett ausschalten?')) return;
          await api('POST', '/secret/panic?guildId=' + gid_, { an });
          st = await api('GET', '/secret/state?guildId=' + gid_());
          toast(an ? '🚨 PANIK AKTIV' : '🔊 Wieder aktiv', an ? 'err' : 'ok');
          zeige('system');
        });
      }

      if (tab === 'kasse') {
        inhalt.innerHTML = '<div class="ghK"><h4>💰 Kassen-Spritze</h4>' +
          '<p class="dim" style="font-size:12px">Kasse: <b id="ghKasse">' + (st ? fmt(st.kasse) : '—') + '</b></p>' +
          '<input class="ghI" type="number" id="ghBetrag" placeholder="z. B. 10000 oder -5000">' +
          '<button class="ghB p" id="ghSpritze" style="width:100%;margin-top:8px">💸 Buchen (negativ = entnehmen)</button>' +
          '<div id="ghKasseErg" class="dim" style="font-size:12px;margin-top:8px"></div></div>';
        karte.querySelector('#ghSpritze').addEventListener('click', async () => {
          const feld = karte.querySelector('#ghBetrag');
          const betrag = Number(feld && feld.value);
          if (!betrag) { toast('Betrag eingeben (negativ = entnehmen)', 'err'); return; }
          try {
            const r = await api('POST', '/secret/treasury?guildId=' + gid_(), { betrag });
            toast('Neue Kasse: ' + fmt(r.stand), 'ok');
            const erg = karte.querySelector('#ghKasseErg');
            if (erg) erg.textContent = '✔ Gebucht. Neuer Stand: ' + fmt(r.stand);
            st = await api('GET', '/secret/state?guildId=' + gid_());
          } catch (e) { toast('Fehler: ' + e.message, 'err'); }
        });
      }

      if (tab === 'wartung') {
        inhalt.innerHTML = '<div class="ghK"><h4>🧹 Deep Clean</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 10px">Löscht: Filter-Treffer &amp; KI-Erkennungen &gt;30 Tg. · Transaktionen &gt;180 Tg. · abgelaufene Jobs.</p>' +
          '<button class="ghB p" id="ghClean">🧹 Aufräumen</button><div id="ghErg" class="dim" style="font-size:12px;margin-top:8px"></div></div>';
        karte.querySelector('#ghClean').addEventListener('click', async () => {
          const r = await api('POST', '/secret/clean?guildId=' + gid_, {});
          karte.querySelector('#ghErg').textContent = 'Gelöscht: ' + r.filterTreffer + ' Treffer · ' +
            r.kiErkennungen + ' KI · ' + r.transaktionen + ' Transaktionen · ' + r.abgelaufeneJobs + ' Jobs';
        });
      }

      if (tab === 'trailers') {
        const WUNSCH = ['tiktok.html','tiktok2.html','trailer-boerse.html','trailer-staat.html','trailer-hangar.html','embed-studio.html','trailer-lang.html','trailer.html','trailer-soon-kurz.html','trailer-soon.html'];
          const filme = [
          ['tiktok.html', '📱 TikTok-Edit (9:16)', '24 Sek. · Beat-Sync · vertikal für TikTok/Shorts', false],
          ['tiktok2.html', '✨ Dashboard-Glow-Edit (9:16)', '22 Sek. · Rainbow, Lichter, Highlighting', false],
          ['trailer-boerse.html', '📈 DIE BÖRSE – 0.8.7', 'Kurse, Manipulation, Pfade, BTC', true],
          ['trailer-staat.html', '🏛️ DER STAAT – 0.8.43e', 'Finanzamt, Polizei, Börse-Teaser', false],
          ['trailer-hangar.html', '🏗️ THE FULL EXPERIENCE', 'Alle Module in kurzen Szenen', false],
          ['embed-studio.html', '🪄 Embed-Studio – 0.8', 'Das Studio im Detail', false],
          ['trailer-lang.html', '🎬 Der große Trailer', 'Übersicht aller Features', false],
          ['trailer.html', '✨ Der Klassiker', 'Kurz & knackig', false],
          ['trailer-soon-kurz.html', '⚡ Coming Soon – Kurz', 'Für Shorts/TikTok', false],
          ['trailer-soon.html', '🪐 Coming Soon – EPIC 3D', 'Sternenfeld-Warp & Feature-Würfel', false],
        ].sort((a, b) => WUNSCH.indexOf(a[0]) - WUNSCH.indexOf(b[0]));
        inhalt.innerHTML = '<div class="ghK"><h4>🎬 Film-Sammlung</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 10px">Klick auf ▶ startet hier, ⛶ im Vollbild-Tab.</p>' +
          '<div id="ghFilme">' + filme.map((f) =>
            '<div class="ghU" data-f="' + f[0] + '" style="cursor:pointer">' +
            '<div style="flex:1"><b style="font-size:13px">' + f[1] + (f[3] ? ' <span class="badge">NEU</span>' : '') + '</b>' +
            '<div class="dim" style="font-size:11px">' + f[2] + '</div></div>' +
            '<span class="badge g" data-play="' + f[0] + '">▶</span> ' +
            '<span class="badge" data-fs="' + f[0] + '" style="background:rgba(129,140,248,.2);color:#c7d2fe">⛶ Vollbild</span></div>').join('') + '</div>' +
          '<div id="ghKino" style="margin-top:12px;display:none">' +
          '<div id="ghKinoWrap" style="background:#000;border-radius:12px;overflow:hidden">' +
          '<iframe id="ghKinoFrame" allowfullscreen allow="fullscreen" style="width:100%;height:300px;border:none;display:block" title="Trailer"></iframe></div>' +
          '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<button class="ghB p" id="ghKinoFs" style="flex:1">⛶ Vollbild</button>' +
          '<button class="ghB r" id="ghKinoZu" style="flex:1">✕ Schließen</button></div></div></div>';
        const kino = inhalt.querySelector('#ghKino');
        const frame = inhalt.querySelector('#ghKinoFrame');
        inhalt.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          kino.style.display = 'block';
          frame.src = '/' + b.dataset.play;
          kino.scrollIntoView({ behavior: 'smooth' });
        }));
        inhalt.querySelectorAll('[data-fs]').forEach((b) => b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          window.open('/' + b.dataset.fs, '_blank');
        }));
        inhalt.querySelector('#ghKinoFs').addEventListener('click', () => {
          const w = inhalt.querySelector('#ghKinoWrap');
          if (document.fullscreenElement) { document.exitFullscreen(); return; }
          (w.requestFullscreen ? w.requestFullscreen() : Promise.reject()).catch(() => {});
        });
        inhalt.querySelector('#ghKinoZu').addEventListener('click', () => {
          kino.style.display = 'none';
          frame.src = 'about:blank';
        });
      }

      if (tab === 'btc') {
        inhalt.innerHTML = '<div class="ghK"><h4>🟠 Bitcoin-Zentrale</h4>' +
          '<p class="dim" style="font-size:12px">Max. Gesamtmenge: <b>21.000.000 BTC</b> (wie echt). Du entscheidest, wie viel existiert.</p>' +
          '<div id="btcInfo" class="dim" style="font-size:13px;margin-bottom:8px">Lade …</div>' +
          '<div class="row" style="gap:8px">' +
          '<input class="ghI" type="number" id="btcMenge" placeholder="Menge minten" style="width:120px" value="100">' +
          '<button class="ghB p" id="btcMint">🟠 Minten</button></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">📈 BTC-Kurs beeinflussen:</b>' +
          '<div class="row" style="gap:8px;margin-top:6px">' +
          '<button class="ghB p" id="btcHoch">📈 +50%</button>' +
          '<button class="ghB r" id="btcRunter">📉 −50%</button>' +
          '<input class="ghI" type="number" id="btcPz" placeholder="eigene %" style="width:90px">' +
          '<button class="ghB" id="btcEig">Setzen</button></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">🎯 BTC-Pfad:</b>' +
          '<div class="row" style="gap:6px;margin-top:6px">' +
          '<input class="ghI" type="number" id="btcPfadZ" placeholder="Ziel %" style="width:80px" value="200">' +
          '<input class="ghI" type="number" id="btcPfadD" placeholder="Dauer" style="width:70px" value="3">' +
          '<select class="ghI" id="btcPfadE" style="width:100px"><option value="tage">Tage</option><option value="stunden">Std</option><option value="minuten">Min</option></select></div>' +
          '<button class="ghB p" id="btcPfad" style="width:100%;margin-top:8px">🎯 Pfad starten</button>' +
          '<div id="btcLog" class="dim" style="font-size:12px;margin-top:8px"></div></div>';
        const gid2 = gid_();
        const lade = async () => {
          const r = await api('GET', '/secret/btc?guildId=' + gid2);
          const prozent = Math.round(r.gesamt / 210000 * 100) / 100;
          karte.querySelector('#btcInfo').innerHTML =
            'Umlauf: <b>' + fmt(r.gesamt) + ' / 21.000.000 BTC</b> (' + prozent + '% gemint)<br>' +
            'Aktueller Kurs: <b>' + (r.preis || 25000).toLocaleString('de-DE') + ' 🪙</b>' +
            (r.preise && r.preise.length ? '<br><span class="dim">Letzte Mints: ' + r.preise.slice(-3).reverse().map((p) => '+' + p.menge + ' (' + esc(p.von) + ')').join(', ') + '</span>' : '');
        };
        lade();
        karte.querySelector('#btcMint').addEventListener('click', async () => {
          try {
            const r = await api('POST', '/secret/btc/mint?guildId=' + gid2, { menge: Number(karte.querySelector('#btcMenge').value) });
            toast('🟠 ' + r.gesamt.toLocaleString('de-DE') + ' BTC im Umlauf', 'ok');
            lade();
          } catch (e) { toast(e.message, 'err'); }
        });
        karte.querySelector('#btcHoch').addEventListener('click', async () => {
          const r = await api('POST', '/secret/btc/kurs?guildId=' + gid2, { prozent: 50 });
          toast('📈 BTC → ' + r.preis.toLocaleString('de-DE'), 'ok'); lade();
        });
        karte.querySelector('#btcRunter').addEventListener('click', async () => {
          const r = await api('POST', '/secret/btc/kurs?guildId=' + gid2, { prozent: -50 });
          toast('📉 BTC → ' + r.preis.toLocaleString('de-DE'), 'ok'); lade();
        });
        karte.querySelector('#btcEig').addEventListener('click', async () => {
          const pz = Number(karte.querySelector('#btcPz').value);
          if (!pz) return toast('Prozent eingeben', 'err');
          const r = await api('POST', '/secret/btc/kurs?guildId=' + gid2, { prozent: pz });
          toast('BTC → ' + r.preis.toLocaleString('de-DE'), 'ok'); lade();
        });
        karte.querySelector('#btcPfad').addEventListener('click', async () => {
          const z = Number(karte.querySelector('#btcPfadZ').value) || 200;
          const d2 = Number(karte.querySelector('#btcPfadD').value) || 3;
          const mult = { tage: 86400, stunden: 3600, minuten: 60 }[karte.querySelector('#btcPfadE').value];
          await api('POST', '/secret/markt?guildId=' + gid2, { aktion: 'pfad', sym: 'BTC', zielProzent: z, dauerSek: Math.round(d2 * mult) });
          toast('🎯 BTC-Pfad aktiv: ' + z + '% über ' + d2 + ' ' + karte.querySelector('#btcPfadE').value, 'ok');
        });
      }

      if (tab === 'btc') {
        inhalt.innerHTML = '<div class="ghK"><h4>🟠 Bitcoin-Zentrale</h4>' +
          '<p class="dim" style="font-size:12px">Max. Gesamtmenge: <b>21.000.000 BTC</b> (wie echt). Du entscheidest, wie viel existiert.</p>' +
          '<div id="btcInfo" class="dim" style="font-size:13px;margin-bottom:8px">Lade …</div>' +
          '<div class="row" style="gap:8px">' +
          '<input class="ghI" type="number" id="btcMenge" placeholder="Menge minten" style="width:120px" value="100">' +
          '<button class="ghB p" id="btcMint">🟠 Minten</button></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">📈 BTC-Kurs beeinflussen:</b>' +
          '<div class="row" style="gap:8px;margin-top:6px">' +
          '<button class="ghB p" id="btcHoch">📈 +50%</button>' +
          '<button class="ghB r" id="btcRunter">📉 −50%</button>' +
          '<input class="ghI" type="number" id="btcPz" placeholder="eigene %" style="width:90px">' +
          '<button class="ghB" id="btcEig">Setzen</button></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">🎯 BTC-Pfad:</b>' +
          '<div class="row" style="gap:6px;margin-top:6px">' +
          '<input class="ghI" type="number" id="btcPfadZ" placeholder="Ziel %" style="width:80px" value="200">' +
          '<input class="ghI" type="number" id="btcPfadD" placeholder="Dauer" style="width:70px" value="3">' +
          '<select class="ghI" id="btcPfadE" style="width:100px"><option value="tage">Tage</option><option value="stunden">Std</option><option value="minuten">Min</option></select></div>' +
          '<button class="ghB p" id="btcPfad" style="width:100%;margin-top:8px">🎯 Pfad starten</button>' +
          '<div id="btcLog" class="dim" style="font-size:12px;margin-top:8px"></div></div>';
        const gid2 = gid_();
        const lade = async () => {
          const r = await api('GET', '/secret/btc?guildId=' + gid2);
          const prozent = Math.round(r.gesamt / 210000 * 100) / 100;
          karte.querySelector('#btcInfo').innerHTML =
            'Umlauf: <b>' + fmt(r.gesamt) + ' / 21.000.000 BTC</b> (' + prozent + '% gemint)<br>' +
            'Aktueller Kurs: <b>' + (r.preis || 25000).toLocaleString('de-DE') + ' 🪙</b>' +
            (r.preise && r.preise.length ? '<br><span class="dim">Letzte Mints: ' + r.preise.slice(-3).reverse().map((p) => '+' + p.menge + ' (' + esc(p.von) + ')').join(', ') + '</span>' : '');
        };
        lade();
        karte.querySelector('#btcMint').addEventListener('click', async () => {
          try {
            const r = await api('POST', '/secret/btc/mint?guildId=' + gid2, { menge: Number(karte.querySelector('#btcMenge').value) });
            toast('🟠 ' + r.gesamt.toLocaleString('de-DE') + ' BTC im Umlauf', 'ok');
            lade();
          } catch (e) { toast(e.message, 'err'); }
        });
        karte.querySelector('#btcHoch').addEventListener('click', async () => {
          const r = await api('POST', '/secret/btc/kurs?guildId=' + gid2, { prozent: 50 });
          toast('📈 BTC → ' + r.preis.toLocaleString('de-DE'), 'ok'); lade();
        });
        karte.querySelector('#btcRunter').addEventListener('click', async () => {
          const r = await api('POST', '/secret/btc/kurs?guildId=' + gid2, { prozent: -50 });
          toast('📉 BTC → ' + r.preis.toLocaleString('de-DE'), 'ok'); lade();
        });
        karte.querySelector('#btcEig').addEventListener('click', async () => {
          const pz = Number(karte.querySelector('#btcPz').value);
          if (!pz) return toast('Prozent eingeben', 'err');
          const r = await api('POST', '/secret/btc/kurs?guildId=' + gid2, { prozent: pz });
          toast('BTC → ' + r.preis.toLocaleString('de-DE'), 'ok'); lade();
        });
        karte.querySelector('#btcPfad').addEventListener('click', async () => {
          const z = Number(karte.querySelector('#btcPfadZ').value) || 200;
          const d2 = Number(karte.querySelector('#btcPfadD').value) || 3;
          const mult = { tage: 86400, stunden: 3600, minuten: 60 }[karte.querySelector('#btcPfadE').value];
          await api('POST', '/secret/markt?guildId=' + gid2, { aktion: 'pfad', sym: 'BTC', zielProzent: z, dauerSek: Math.round(d2 * mult) });
          toast('🎯 BTC-Pfad aktiv: ' + z + '% über ' + d2 + ' ' + karte.querySelector('#btcPfadE').value, 'ok');
        });
      }

      if (tab === 'aktien') {
        inhalt.innerHTML = '<div class="ghK"><h4>🏢 Aktien-Verwaltung</h4>' +
          '<b style="font-size:13px">Eigene Aktie erstellen:</b>' +
          '<div class="row" style="gap:6px;margin-top:6px">' +
          '<input class="ghI" id="akSym" placeholder="SYMBOL" style="width:90px">' +
          '<input class="ghI" id="akName" placeholder="Name" style="width:130px">' +
          '<input class="ghI" type="number" id="akBasis" placeholder="Startkurs" style="width:90px" value="50">' +
          '<button class="ghB p" id="akAdd">+ Erstellen</button></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">Alle Aktien (⚙️ = autoUpdate an/aus, ✕ = löschen):</b>' +
          '<div id="akListe" style="margin-top:6px"><p class="dim">Lade …</p></div></div>';
        const gid2 = gid_();
        async function ladeAk() {
          const r = await api('GET', '/secret/aktien?guildId=' + gid2);
          const box = karte.querySelector('#akListe');
          box.innerHTML = r.liste.map((a) => {
            const eigene = r.liste.find((x) => x.sym === a.sym && x.custom);
            return '<div class="ghU" style="cursor:default">' +
              '<span style="flex:1"><b style="font-size:13px">' + esc(a.sym) + '</b>' +
              '<div class="dim" style="font-size:11px">' + esc(a.name) + (a.custom ? ' · eigene' : '') + '</div></span>' +
              '<label style="display:flex;gap:5px;align-items:center;font-size:11px;cursor:pointer">' +
              '<input type="checkbox" data-au="' + esc(a.sym) + '"' + (a.autoUpdate !== false ? ' checked' : '') + '> Auto</label>' +
              (a.custom ? '<button class="ghB r" data-del="' + esc(a.sym) + '" style="padding:4px 10px">✕</button>' : '') +
              '</div>';
          }).join('');
          box.querySelectorAll('[data-au]').forEach((c) => c.addEventListener('change', async () => {
            await api('POST', '/secret/aktien/autoupdate?guildId=' + gid2, { sym: c.dataset.au, auto: c.checked });
            toast(c.dataset.au + ': Auto-Update ' + (c.checked ? 'AN' : 'AUS (eingefroren)'), 'ok');
          }));
          box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
            if (!confirm('Aktie ' + b.dataset.del + ' löschen? (Depot-Besitz bleibt, aber kurslos)')) return;
            await api('DELETE', '/secret/aktien/' + b.dataset.del + '?guildId=' + gid2);
            toast('Gelöscht ✔', 'ok'); ladeAk();
          }));
        }
        ladeAk();
        karte.querySelector('#akAdd').addEventListener('click', async () => {
          try {
            await api('POST', '/secret/aktien?guildId=' + gid2, {
              sym: karte.querySelector('#akSym').value,
              name: karte.querySelector('#akName').value,
              basis: Number(karte.querySelector('#akBasis').value) || 50,
            });
            toast('Aktie erstellt ✔', 'ok'); ladeAk();
          } catch (e) { toast(e.message, 'err'); }
        });
      }

      if (tab === 'markt') {
        inhalt.innerHTML = '<div class="ghK"><h4>📈 Markt-Manipulation</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 10px">Nur für dich. Sofort-Sprung oder geplanter Pfad.</p>' +
          '<select class="ghI" id="mkSym"></select>' +
          '<div class="row" style="gap:8px;margin:8px 0">' +
          '<button class="ghB p" id="mkHoch" style="flex:1">📈 HOCH +25%</button>' +
          '<button class="ghB r" id="mkRunter" style="flex:1">📉 RUNTER −25%</button></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">🎯 Pfad festlegen (über Zeit schweben):</b>' +
          '<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">' +
          '<input class="ghI" type="number" id="mkPz" placeholder="Ziel %" style="width:80px" value="50">' +
          '<input class="ghI" type="number" id="mkD" placeholder="Dauer" style="width:70px" value="2">' +
          '<select class="ghI" id="mkEin" style="width:100px"><option value="tage">Tage</option><option value="stunden">Stunden</option><option value="minuten">Minuten</option><option value="sekunden">Sekunden</option></select></div>' +
          '<button class="ghB p" id="mkPfad" style="width:100%;margin-top:8px">🎯 Pfad starten</button>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">⏱️ Update-Intervall der Kurse:</b>' +
          '<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">' +
          '<button class="ghB" data-iv="60">1 Min</button>' +
          '<button class="ghB" data-iv="300">5 Min</button>' +
          '<button class="ghB" data-iv="900">15 Min</button>' +
          '<button class="ghB" data-iv="3600">1 Std</button>' +
          '<input class="ghI" type="number" id="mkEigSek" placeholder="eigene Sek." style="width:100px">' +
          '<button class="ghB p" id="mkEig">Setzen</button></div>' +
          '<div id="mkErg" class="dim" style="font-size:12px;margin-top:8px"></div></div>';
        const gid2 = gid_();
        // Aktien dynamisch laden (eigene inklusive!)
        api('GET', '/secret/aktien?guildId=' + gid2).then((r) => {
          const sel = karte.querySelector('#mkSym');
          sel.innerHTML = r.liste.map((a) => '<option value="' + esc(a.sym) + '">' + esc(a.sym) + ' · ' + esc(a.name) + '</option>').join('');
        }).catch(() => {});
        const sende = (body) => api('POST', '/secret/markt?guildId=' + gid2, body);
        karte.querySelector('#mkHoch').addEventListener('click', async () => {
          try {
            const r = await sende({ aktion: 'sprung', sym: karte.querySelector('#mkSym').value, prozent: 25 });
            toast('📈 ' + r.sym + ' → ' + r.neuKurs, 'ok');
          } catch (e) { toast(e.message, 'err'); }
        });
        karte.querySelector('#mkRunter').addEventListener('click', async () => {
          try {
            const r = await sende({ aktion: 'sprung', sym: karte.querySelector('#mkSym').value, prozent: -25 });
            toast('📉 ' + r.sym + ' → ' + r.neuKurs, 'ok');
          } catch (e) { toast(e.message, 'err'); }
        });
        karte.querySelector('#mkPfad').addEventListener('click', async () => {
          try {
            const z = Number(karte.querySelector('#mkPz').value) || 50;
            const d2 = Number(karte.querySelector('#mkD').value) || 2;
            const e2 = karte.querySelector('#mkEin').value;
            const mult = { tage: 86400, stunden: 3600, minuten: 60, sekunden: 1 }[e2];
            const r = await sende({ aktion: 'pfad', sym: karte.querySelector('#mkSym').value, zielProzent: z, dauerSek: Math.round(d2 * mult) });
            toast('🎯 Pfad aktiv: ' + r.sym + ' über ' + r.dauerSek + 's', 'ok');
          } catch (e) { toast(e.message, 'err'); }
        });
        karte.querySelectorAll('[data-iv]').forEach((b) => b.addEventListener('click', async () => {
          try {
            const r = await api('POST', '/boerse/intervall?guildId=' + gid2, { sekunden: Number(b.dataset.iv) });
            const erg = karte.querySelector('#mkErg');
            if (erg) erg.textContent = '⏱️ Kurs-Update jetzt alle ' + r.intervallSek + 's';
            toast('Intervall: ' + r.intervallSek + 's', 'ok');
          } catch (e) { toast(e.message, 'err'); }
        }));
        karte.querySelector('#mkEig').addEventListener('click', async () => {
          const sek = Number(karte.querySelector('#mkEigSek').value);
          if (!sek) return toast('Sekunden eingeben', 'err');
          try {
            const r = await api('POST', '/boerse/intervall?guildId=' + gid2, { sekunden: sek });
            const erg = karte.querySelector('#mkErg');
            if (erg) erg.textContent = '⏱️ Kurs-Update jetzt alle ' + r.intervallSek + 's';
            toast('Intervall: ' + r.intervallSek + 's', 'ok');
          } catch (e) { toast(e.message, 'err'); }
        });
      }

      if (tab === 'diagramm') {
        inhalt.innerHTML = '<div class="ghK"><h4>🎨 Diagramm-Editor</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 8px">✏️ <b>Zeichen-Modus:</b> klicken ODER ziehen = Kurve malen! · ✋ <b>Verschieben-Modus:</b> ziehen = bewegen · Scrollen = Zoom</p>' +
          '<div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
          '<button class="ghB p" id="dgModeDraw">✏️ Zeichnen</button>' +
          '<button class="ghB" id="dgModePan">✋ Verschieben</button>' +
          '<button class="ghB" id="dgPanL">⬅</button><button class="ghB" id="dgPanR">➡</button>' +
          '<button class="ghB" id="dgPanU">⬆</button><button class="ghB" id="dgPanD">⬇</button>' +
          '<button class="ghB" id="dgZoomIn">🔍+</button><button class="ghB" id="dgZoomOut">🔍−</button>' +
          '<button class="ghB" id="dgReset">Reset</button></div>' +
          '<div class="row" style="gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
          '<select class="ghI" id="dgSym" style="width:150px"></select>' +
          '<input class="ghI" type="number" id="dgSek" placeholder="Dauer (Sek.)" style="width:110px" value="120">' +
          '<button class="ghB p" id="dgStart">🚀 Kurve starten</button>' +
          '<button class="ghB" id="dgClear">🗑️ Punkte löschen</button></div>' +
          '<div id="dgWrap" style="position:relative;user-select:none">' +
          '<canvas id="dgCanvas" width="600" height="300" style="width:100%;height:300px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.2);border-radius:10px;cursor:crosshair;touch-action:none"></canvas>' +
          '<div class="dim mono" id="dgMaus" style="position:absolute;top:6px;right:10px;font-size:11px"></div></div>' +
          '<div class="row mt" style="justify-content:space-between">' +
          '<span class="dim mono" id="dgInfo">–</span>' +
          '<span class="dim small">Modus: <b id="dgMod">✏️ Zeichnen</b> · Punkte: <span id="dgAnz">0</span></span></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">🟠 Eigene Crypto (begrenzte Menge):</b>' +
          '<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">' +
          '<input class="ghI" id="crSym" placeholder="SYMBOL" style="width:90px">' +
          '<input class="ghI" id="crName" placeholder="Name" style="width:130px">' +
          '<input class="ghI" type="number" id="crSupply" placeholder="Menge" style="width:100px" value="1000">' +
          '<input class="ghI" type="number" id="crKurs" placeholder="Startkurs" style="width:90px" value="1">' +
          '<button class="ghB p" id="crAdd">🪙 Erstellen</button></div>' +
          '<div id="crErg" class="dim" style="font-size:12px;margin-top:6px"></div></div>';
        const gid2 = gid_();
        let punkte = [];
        let modus = 'zeichnen';
        const cv = inhalt.querySelector('#dgCanvas');
        const ctx2 = cv.getContext('2d');
        const LINKS = 52, UNTEN = 26;
        let view = { x0: 0, x1: 120, y0: 0, y1: 100 };
        let ziehen = false;
        function gesamtSekunden() { return Number(inhalt.querySelector('#dgSek').value) || 120; }
        function dZuPx(x, y) {
          const B = cv.width - LINKS, Ho = cv.height - UNTEN;
          return [LINKS + ((x - view.x0) / (view.x1 - view.x0)) * B, Ho - ((y - view.y0) / (view.y1 - view.y0)) * Ho];
        }
        function pxD(x, y) {
          const B = cv.width - LINKS, Ho = cv.height - UNTEN;
          return [view.x0 + ((x - LINKS) / B) * (view.x1 - view.x0), view.y0 + ((Ho - y) / Ho) * (view.y1 - view.y0)];
        }
        function fmtZ(s) { if (s >= 86400) return (s/86400).toFixed(1)+' Tg'; if (s >= 3600) return (s/3600).toFixed(1)+' Std'; if (s >= 60) return (s/60).toFixed(0)+' Min'; return Math.round(s)+' s'; }
        function fmtK(k) { return k >= 1000 ? (k/1000).toFixed(1)+'k' : k.toFixed(0); }
        function zeichne() {
          const W = cv.width, H = cv.height;
          ctx2.clearRect(0,0,W,H);
          ctx2.fillStyle = 'rgba(0,0,0,.35)'; ctx2.fillRect(0,0,W,H);
          ctx2.font = '10px monospace'; ctx2.lineWidth = 1;
          for (let i = 0; i <= 6; i++) {
            const xv = view.x0 + (i/6)*(view.x1-view.x0);
            const [px] = dZuPx(xv, 0);
            ctx2.strokeStyle = 'rgba(255,255,255,.07)';
            ctx2.beginPath(); ctx2.moveTo(px,0); ctx2.lineTo(px,H-UNTEN); ctx2.stroke();
            ctx2.fillStyle = '#8b93a7'; ctx2.fillText(fmtZ(xv), px-14, H-8);
          }
          for (let i = 0; i <= 5; i++) {
            const yv = view.y0 + (i/5)*(view.y1-view.y0);
            const [,py] = dZuPx(0, yv);
            ctx2.strokeStyle = 'rgba(255,255,255,.07)';
            ctx2.beginPath(); ctx2.moveTo(LINKS,py); ctx2.lineTo(W,py); ctx2.stroke();
            ctx2.fillStyle = '#8b93a7'; ctx2.fillText(fmtK(yv), 4, py+3);
          }
          if (punkte.length) {
            ctx2.strokeStyle = '#22d3ee'; ctx2.lineWidth = 2.5;
            ctx2.beginPath();
            punkte.forEach((p,i) => { const [px,py] = dZuPx(p.x,p.y); i===0?ctx2.moveTo(px,py):ctx2.lineTo(px,py); });
            ctx2.stroke();
            punkte.forEach((p) => { const [px,py] = dZuPx(p.x,p.y);
              ctx2.fillStyle = '#e879f9'; ctx2.beginPath(); ctx2.arc(px,py,5,0,7); ctx2.fill();
              ctx2.fillStyle = '#fff'; ctx2.font = '9px monospace';
              ctx2.fillText(fmtZ(p.x)+' · '+fmtK(p.y), px+7, py-6); });
          }
          ctx2.strokeStyle = 'rgba(255,255,255,.3)';
          ctx2.beginPath(); ctx2.moveTo(LINKS,0); ctx2.lineTo(LINKS,H-UNTEN); ctx2.lineTo(W,H-UNTEN); ctx2.stroke();
          const info = inhalt.querySelector('#dgInfo');
          if (info) info.textContent = 'Zeit: '+fmtZ(view.x0)+' – '+fmtZ(view.x1)+' · Kurs: '+fmtK(view.y0)+' – '+fmtK(view.y1);
          const anz = inhalt.querySelector('#dgAnz');
          if (anz) anz.textContent = punkte.length;
        }
        function pan(dx2, dy2) {
          const B = view.x1 - view.x0, Ho = view.y1 - view.y0;
          view.x0 += dx2 * B * 0.25; view.x1 += dx2 * B * 0.25;
          view.y0 += dy2 * Ho * 0.25; view.y1 += dy2 * Ho * 0.25;
          zeichne();
        }
        function zoom(f) {
          const mx = (view.x0 + view.x1) / 2, my = (view.y0 + view.y1) / 2;
          const bx0 = mx + (view.x0 - mx) * f, bx1 = mx + (view.x1 - mx) * f;
          const by0 = my + (view.y0 - my) * f, by1 = my + (view.y1 - my) * f;
          if (bx1 - bx0 > 1 && bx1 - bx0 < 31536000 * 4) { view.x0 = bx0; view.x1 = bx1; }
          if (by1 - by0 > 1 && by1 - by0 < 10e6) { view.y0 = by0; view.y1 = by1; }
          zeichne();
        }
        inhalt.querySelector('#dgPanL').addEventListener('click', () => pan(-1, 0));
        inhalt.querySelector('#dgPanR').addEventListener('click', () => pan(1, 0));
        inhalt.querySelector('#dgPanU').addEventListener('click', () => pan(0, 1));
        inhalt.querySelector('#dgPanD').addEventListener('click', () => pan(0, -1));
        inhalt.querySelector('#dgZoomIn').addEventListener('click', () => zoom(0.75));
        inhalt.querySelector('#dgZoomOut').addEventListener('click', () => zoom(1.33));
        inhalt.querySelector('#dgReset').addEventListener('click', () => { view = { x0: 0, x1: gesamtSekunden(), y0: 0, y1: 100 }; zeichne(); });
        // Modus-Schalter
        const btnDraw = inhalt.querySelector('#dgModeDraw'), btnPan = inhalt.querySelector('#dgModePan');
        function setModus(m) {
          modus = m;
          btnDraw.classList.toggle('p', m === 'zeichnen');
          btnPan.classList.toggle('p', m === 'verschieben');
          const md = inhalt.querySelector('#dgMod');
          if (md) md.textContent = m === 'zeichnen' ? '✏️ Zeichnen' : '✋ Verschieben';
          cv.style.cursor = m === 'verschieben' ? 'grab' : 'crosshair';
        }
        btnDraw.addEventListener('click', () => setModus('zeichnen'));
        btnPan.addEventListener('click', () => setModus('verschieben'));
        // Maus: zeichnen (freihändig!) oder verschieben
        let zeichnetAktiv = false, verschiebt = false, lastPx = 0, lastPy = 0;
        function mausPos(e) {
          const r = cv.getBoundingClientRect();
          return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)];
        }
        function addPunkt(px, py) {
          if (px < LINKS) return;
          const [x, y] = pxD(px, py);
          const nx = Math.max(0, Math.round(x)), ny = Math.max(0.01, Math.round(y * 100) / 100);
          const letzter = punkte[punkte.length - 1];
          if (letzter && Math.abs(letzter.x - nx) < 1 && Math.abs(letzter.y - ny) < 1) return;
          punkte.push({ x: nx, y: ny });
          punkte.sort((a, b) => a.x - b.x);
          zeichne();
        }
        cv.addEventListener('mousedown', (e) => {
          const [px, py] = mausPos(e);
          if (modus === 'verschieben' || e.button === 2) {
            verschiebt = true; lastPx = px; lastPy = py; cv.style.cursor = 'grabbing';
          } else if (e.button === 0) {
            zeichnetAktiv = true; addPunkt(px, py);
          }
        });
        cv.addEventListener('mousemove', (e) => {
          const [px, py] = mausPos(e);
          const [dx, dy] = pxD(px, py);
          const m = inhalt.querySelector('#dgMaus');
          if (m) m.textContent = fmtZ(Math.max(0, dx)) + ' · ' + fmtK(Math.max(0, dy));
          if (verschiebt) {
            const B = view.x1 - view.x0, Ho = view.y1 - view.y0;
            view.x0 -= (px - lastPx) / (cv.width - LINKS) * B; view.x1 -= (px - lastPx) / (cv.width - LINKS) * B;
            view.y0 += (py - lastPy) / (cv.height - UNTEN) * Ho; view.y1 += (py - lastPy) / (cv.height - UNTEN) * Ho;
            lastPx = px; lastPy = py; zeichne();
          } else if (zeichnetAktiv) {
            addPunkt(px, py); // Freihand-Zeichnen beim Ziehen!
          }
        });
        addEventListener('mouseup', () => { zeichnetAktiv = false; verschiebt = false; cv.style.cursor = modus === 'verschieben' ? 'grab' : 'crosshair'; });
        cv.addEventListener('contextmenu', (e) => e.preventDefault());
        cv.addEventListener('wheel', (e) => {
          e.preventDefault();
          zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);
        }, { passive: false });
        inhalt.querySelector('#dgClear').addEventListener('click', () => { punkte = []; zeichne(); });
        inhalt.querySelector('#dgReset').addEventListener('click', () => { view = { x0: 0, x1: gesamtSekunden(), y0: 0, y1: 100 }; zeichne(); });
        inhalt.querySelector('#dgSek').addEventListener('change', () => { view.x0 = 0; view.x1 = gesamtSekunden(); zeichne(); });
        (async () => {
          try {
            const r = await api('GET', '/secret/aktien?guildId=' + gid2);
            const sel = inhalt.querySelector('#dgSym');
            if (sel) sel.innerHTML = r.liste.map((a) => '<option value="' + esc(a.sym) + '">' + esc(a.sym) + (a.crypto ? ' 🪙' : '') + '</option>').join('');
          } catch (_) {}
        })();
        inhalt.querySelector('#dgStart').addEventListener('click', async () => {
          const sym = inhalt.querySelector('#dgSym').value;
          const gesamt = gesamtSekunden();
          if (punkte.length < 2) return toast('Mindestens 2 Punkte!', 'err');
          try {
            const akt = await api('GET', '/boerse/verlauf/' + encodeURIComponent(sym) + '?guildId=' + gid2).catch(() => null);
            const startKurs = akt ? (akt.kurs || 100) : 100;
            const punkte2 = punkte.map((p) => [Math.round(p.x), Math.max(0.01, Math.round((p.y / 100) * startKurs * 3 * 100) / 100)]);
            await api('POST', '/boerse/zeichnen/' + encodeURIComponent(sym) + '?guildId=' + gid2, { punkte: punkte2 });
            toast('🚀 Kurve aktiv: ' + sym + ' über ' + fmtDauer(gesamt * 1000), 'ok');
            punkte = []; zeichne();
          } catch (e) { toast(e.message, 'err'); }
        });
        inhalt.querySelector('#crAdd').addEventListener('click', async () => {
          try {
            const r = await api('POST', '/boerse/crypto?guildId=' + gid2, {
              sym: inhalt.querySelector('#crSym').value, name: inhalt.querySelector('#crName').value,
              supply: Number(inhalt.querySelector('#crSupply').value) || 1000,
              basis: Number(inhalt.querySelector('#crKurs').value) || 1,
            });
            toast('🪙 ' + r.sym + '! Supply: ' + r.supply, 'ok');
            const erg = inhalt.querySelector('#crErg');
            if (erg) erg.textContent = r.sym + ' existiert – max. ' + r.supply + ' Stück!';
            (async () => { try { const r2 = await api('GET', '/secret/aktien?guildId=' + gid2);
              const sel = inhalt.querySelector('#dgSym');
              if (sel) sel.innerHTML = r2.liste.map((a) => '<option value="' + esc(a.sym) + '">' + esc(a.sym) + '</option>').join(''); } catch (_) {} })();
          } catch (e) { toast(e.message, 'err'); }
        });
        setModus('zeichnen');
        zeichne();
      }

      if (tab === 'spion') {
        inhalt.innerHTML = '<div class="ghK"><h4>🕵️ Dashboard-Spion</h4>' +
          '<p class="dim" style="font-size:12px">Die letzten 30 Dashboard-Logins:</p>' +
          '<div id="spionListe"><p class="dim">Lade …</p></div></div>';
        api('GET', '/secret/spion').then((r) => {
          const box = inhalt.querySelector('#spionListe');
          box.innerHTML = r.liste.length ? r.liste.map((l) =>
            '<div class="ghU" style="cursor:default"><span style="flex:1"><b style="font-size:13px">' + esc(l.benutzername) + '</b>' +
            '<div class="dim" style="font-size:11px">' + new Date(l.zeit).toLocaleString('de-DE') + '</div></div>' +
            '<span class="badge g">Login</span></div>').join('')
            : '<p class="dim">Noch keine Logins seit Neustart der Aufzeichnung.</p>';
        }).catch((e) => { inhalt.querySelector('#spionListe').textContent = e.message; });
      }

      if (tab === 'nuke') {
        inhalt.innerHTML = '<div class="ghK"><h4>💣 Nuke-Reset (Gilde)</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 10px">Löscht WIRKLICH ALLES dieser Gilde: Wirtschaft, Level, Mod-Einträge, KI-Erkennungen, Transaktionen.</p>' +
          '<p class="dim" style="font-size:12px;margin:0 0 8px">Tippe zur Bestätigung: <b id="nukeCodeHin">…</b></p>' +
          '<input class="ghI" id="nukeCode" placeholder="Bestätigungscode">' +
          '<button class="ghB r" id="nukeBtn" style="width:100%;margin-top:8px">💣 WIRKLICH ALLES LÖSCHEN</button>' +
          '<div id="nukeErg" class="dim" style="font-size:12px;margin-top:8px"></div></div>';
        const gid2 = gid_();
        const code = 'NUKE-' + gid2.slice(-4);
        const hin = karte.querySelector('#nukeCodeHin');
        if (hin) hin.textContent = code;
        karte.querySelector('#nukeBtn').addEventListener('click', async () => {
          const eingabe = karte.querySelector('#nukeCode').value.trim();
          if (eingabe !== code) return toast('Code falsch (siehe Hinweis oben)', 'err');
          if (!confirm('LETZTE WARNUNG: Alle Daten dieser Gilde löschen?')) return;
          try {
            const r = await api('POST', '/secret/nuke?guildId=' + gid2, { code: eingabe });
            toast('💣 ' + r.geloescht + ' Datensätze gelöscht', 'ok');
            karte.querySelector('#nukeErg').textContent = 'Gelöscht: ' + r.geloescht + ' Datensätze.';
          } catch (e) { toast(e.message, 'err'); }
        });
      }

      if (tab === 'troll') {
        inhalt.innerHTML = '<div class="ghK"><h4>🎭 Troll-Modus</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 10px">Bot heißt überall „⛔ Wartungsmodus", Status: beschäftigt. Perfekt, um kurz abzutauchen.</p>' +
          '<div class="row" style="gap:8px">' +
          '<button class="ghB r" id="trollAn">🎭 AN</button>' +
          '<button class="ghB p" id="trollAus">🔊 AUS</button></div></div>';
        karte.querySelector('#trollAn').addEventListener('click', async () => {
          await api('POST', '/secret/troll?guildId=' + gid_(), { an: true });
          toast('🎭 Troll-Modus AN', 'ok');
        });
        karte.querySelector('#trollAus').addEventListener('click', async () => {
          await api('POST', '/secret/troll?guildId=' + gid_(), { an: false });
          toast('🔊 Alles normal wieder', 'ok');
        });
      }

      // Dynamische Aktien-Auswahl für den Markt-Tab nachladen
      (async function ladeSymbole() {
        try {
          const r = await api('GET', '/secret/aktien?guildId=' + gid_());
          const sel = karte.querySelector('[data-mkSymDyn]');
          if (sel) {
            sel.innerHTML = r.liste.map((a) => '<option value="' + esc(a.sym) + '">' + esc(a.sym) + ' · ' + esc(a.name) + '</option>').join('');
          }
        } catch (_) {}
      })();

      if (tab === 'dev') {
        inhalt.innerHTML = '<div class="ghK"><h4>📊 Dev-Statistiken</h4><pre id="ghStats">Lade …</pre></div>';
        try {
          const d = await api('GET', '/secret/stats');
          karte.querySelector('#ghStats').textContent =
            'RAM:  ' + d.ram.rss + ' MB (Heap ' + d.ram.heap + ')\n' +
            'Uptime: ' + Math.floor(d.uptime / 60) + ' Min. · Node ' + d.node + '\n' +
            'Ping: ' + (d.ping ?? '–') + ' ms · Server: ' + d.gilden + ' · Commands: ' + d.commands + '\n\n' +
            'DB-Collections:\n' + Object.entries(d.collections).sort((a, b) => b[1] - a[1])
              .map(([k, v]) => '  ' + k.padEnd(20) + v).join('\n');
        } catch (e) { karte.querySelector('#ghStats').textContent = e.message; }
      }
    }

    start();
  }
})();
