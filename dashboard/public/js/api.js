// ═══════════════════════════════════════════════════════════════
// Gemeinsame Helfer: API-Client, DOM-Kürzel, Toasts, Modals,
// Formatierung. Lädt auf JEDER Seite zuerst (login, setup, index).
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── API-Client ──────────────────────────────────────────────────
window.API = {
  async request(methode, url, body) {
    const opt = { method: methode, headers: {} };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch('/api' + url, opt);
    let data = null;
    try { data = await res.json(); } catch (_) { /* z. B. Text-Download */ }
    // 401 außerhalb von Login/Setup -> zum Login schicken (nur im Dashboard)
    if (res.status === 401 && document.getElementById('page') &&
        !url.startsWith('/setup') && url !== '/login' && url !== '/me') {
      location.href = 'login.html';
      throw new Error('Sitzung abgelaufen');
    }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  },
  get: (u) => API.request('GET', u),
  post: (u, b) => API.request('POST', u, b === undefined ? {} : b),
  del: (u) => API.request('DELETE', u),
};

// ── DOM-Kürzel ──────────────────────────────────────────────────
window.$ = (sel, el) => (el || document).querySelector(sel);
window.$$ = (sel, el) => [...(el || document).querySelectorAll(sel)];

// HTML-String escapen (XSS-Schutz bei allen Nutzereingaben im UI)
window.esc = (t) => String(t ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// Element aus HTML-String erzeugen
window.el = function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

// ── Toast (Bestätigungen wie "Gespeichert ✔") ───────────────────
window.toast = function toast(msg, typ = 'info', dauer = 3200) {
  const host = document.getElementById('toasts');
  if (!host) { console.log('[' + typ + '] ' + msg); return; }
  const t = el(`<div class="toast ${typ}">${esc(msg)}</div>`);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('weg'); setTimeout(() => t.remove(), 350); }, dauer);
};

// ── Modal ───────────────────────────────────────────────────────
window.openModal = function openModal(titel, inhaltNode, fussButtons = []) {
  const host = document.getElementById('modalHost');
  host.innerHTML = '';
  const overlay = el('<div class="modal-overlay"></div>');
  const karte = el(`
    <div class="panel modal-card">
      <div class="modal-kopf"><h3>${esc(titel)}</h3>
      <button class="modal-x" title="Schließen">✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-fuss"></div>
    </div>`);
  $('.modal-body', karte).appendChild(inhaltNode);
  const schliessen = () => overlay.remove();
  $('.modal-x', karte).addEventListener('click', schliessen);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) schliessen(); });
  for (const b of fussButtons) {
    const btn = el(`<button class="btn ${b.klasse || ''}">${esc(b.label)}</button>`);
    btn.addEventListener('click', () => b.action(schliessen));
    $('.modal-fuss', karte).appendChild(btn);
  }
  overlay.appendChild(karte);
  host.appendChild(overlay);
  return schliessen;
};

// Bestätigungsdialog -> Promise<boolean>
window.confirmDlg = function confirmDlg(text, titel = 'Bitte bestätigen') {
  return new Promise((resolve) => {
    const body = el(`<p style="line-height:1.6">${esc(text)}</p>`);
    openModal(titel, body, [
      { label: 'Abbrechen', action: (zu) => { resolve(false); zu(); } },
      { label: 'Ja, weiter', klasse: 'danger', action: (zu) => { resolve(true); zu(); } },
    ]);
  });
};

// ── Formatierung ────────────────────────────────────────────────
window.fmtZahl = (n) => Number(n || 0).toLocaleString('de-DE');
window.fmtDatum = (ts) => new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
window.fmtRelativ = (ts) => {
  const d = Date.now() - ts;
  if (d < 60000) return 'gerade eben';
  if (d < 3600000) return Math.floor(d / 60000) + ' Min.';
  if (d < 86400000) return Math.floor(d / 3600000) + ' Std.';
  return Math.floor(d / 86400000) + ' Tg.';
};
window.fmtDauer = (ms) => {
  if (ms >= 86400000) return (ms / 86400000).toFixed(ms % 86400000 ? 1 : 0) + ' Tg.';
  if (ms >= 3600000) return Math.round(ms / 3600000) + ' Std.';
  if (ms >= 60000) return Math.round(ms / 60000) + ' Min.';
  return Math.round(ms / 1000) + ' Sek.';
};

// Debounce für Suchfelder
window.debounce = function debounce(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

// Datei-Download (Export/Backup)
window.download = function download(dateiname, inhalt, typ = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(a.href);
};
