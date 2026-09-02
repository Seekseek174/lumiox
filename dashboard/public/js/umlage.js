// ═══════════════════════════════════════════════════════════════
// UMLAGE-WIDGET – eigenständig (keine app.js-Abhängigkeit)
// Injiziert "Serverkasse → Staatskasse" in die Staat-Seite.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  let injiziert = false;

  function gid() {
    const s = document.getElementById('guildSelect');
    return s ? s.value : '';
  }
  function esc(t) { return String(t ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(n) { return Number(n || 0).toLocaleString('de-DE'); }
  async function api(m, u, b) {
    const o = { method: m, headers: { 'Content-Type': 'application/json' } };
    if (b !== undefined) o.body = JSON.stringify(b);
    const r = await fetch('/api' + u, o);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d;
  }
  function toast(msg, typ) {
    const host = document.getElementById('toasts') || document.body;
    const t = document.createElement('div');
    t.style.cssText = 'position:relative;padding:12px 18px;border-radius:14px;background:rgba(24,28,46,.95);color:#eef1f7;border-left:4px solid ' +
      (typ === 'ok' ? '#2ECC71' : typ === 'err' ? '#E74C3C' : '#6c8cff') + ';box-shadow:0 10px 30px rgba(0,0,0,.4);margin-top:8px;font:500 14px system-ui;max-width:340px';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  async function werteLaden(kassenIds) {
    try {
      const ov = await api('GET', '/overview?guildId=' + gid());
      const [s1, s2, mx] = kassenIds;
      if (s1) s1.textContent = fmt(ov.kasse);
      if (s2) s2.textContent = fmt(ov.staatsKasse || 0);
      return ov.kasse;
    } catch (_) { return 0; }
  }

  function injizieren(staBtn) {
    injiziert = true;
    // Karte direkt nach dem "Staat speichern"-Button einfügen
    const html = document.createElement('div');
    html.innerHTML = `
      <hr style="border:none;border-top:1px solid rgba(127,127,127,.2);margin:14px 0">
      <b style="font-size:.9rem">💰 Umlage: Serverkasse → Staatskasse</b>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0">
        <input id="umBetrag" type="number" placeholder="Betrag" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:rgba(0,0,0,.3);color:inherit;width:150px">
        <button id="umAllBtn" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:rgba(127,127,127,.12);color:inherit;cursor:pointer;font:600 13px system-ui">Max</button>
        <button id="umGoBtn" style="padding:8px 16px;border-radius:10px;border:none;background:linear-gradient(120deg,#22d3ee,#818cf8,#e879f9);color:#fff;cursor:pointer;font:700 13px system-ui">🏛️ Umlagern</button>
        <button id="umRefreshBtn" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:rgba(127,127,127,.12);color:inherit;cursor:pointer;font:600 13px system-ui">↻</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
        <div><div style="font-size:1.4rem;font-weight:800" id="umServerWert">?</div><div style="font-size:.75rem;opacity:.6">Serverkasse aktuell</div></div>
        <div><div style="font-size:1.4rem;font-weight:800" id="umStaatWert">?</div><div style="font-size:.75rem;opacity:.6">Staatskasse aktuell</div></div>
      </div>`;
    staBtn.parentElement.insertBefore(html, staBtn.nextSibling);
    const staBtn2 = staBtn.cloneNode(true);
    staBtn.parentElement.insertBefore(staBtn2, html); // Button bleibt unter der Karte? Nein:
    // Korrektur: Button soll UNTEN bleiben -> umordnen:
    staBtn.parentElement.insertBefore(staBtn, html);

    const werte = [html.querySelector('#umServerWert'), html.querySelector('#umStaatWert')];
    werteLaden(werte);

    html.querySelector('#umRefreshBtn').addEventListener('click', () => werteLaden(werte));
    html.querySelector('#umAllBtn').addEventListener('click', async () => {
      const stand = await werteLaden(werte);
      const f = html.querySelector('#umBetrag');
      if (f) f.value = stand;
    });
    html.querySelector('#umGoBtn').addEventListener('click', async () => {
      const b = Number(html.querySelector('#umBetrag').value);
      if (!b || b <= 0) return toast('Bitte Betrag eingeben', 'err');
      if (!confirm('Um ' + fmt(b) + ' von der Serverkasse in die Staatskasse umlagern?')) return;
      try {
        const r = await api('POST', '/ext/umlage?guildId=' + gid(), { betrag: b });
        toast('🏛️ Umgelagert! Staatskasse: ' + fmt(r.staatKasse), 'ok');
        werteLaden(werte);
      } catch (e) { toast(e.message, 'err'); }
    });
    console.log('[Umlage] Widget aktiv'); // nur zur Fehlersuche, einmalig beim Injizieren
  }

  // Poller: wartet, bis die Staat-Seite den staSave-Button zeigt
  const iv = setInterval(() => {
    const staBtn = document.getElementById('staSave');
    const seiteAktiv = staBtn && staBtn.offsetParent !== null; // sichtbar?
    if (seiteAktiv && !injiziert) { injizieren(staBtn); clearInterval(iv); }
  }, 800);
  // Bei Seitenwechsel (SPA-Route zurück zu Staat) erneut ermöglichen
  document.getElementById('guildSelect')?.addEventListener('change', () => { injiziert = false; });
})();
