// ═══════════════════════════════════════════════════════════════
// HTML-Transkript-Generator: Wandelt Discord-Nachrichten in eine
// saubere, eigenständige HTML-Datei um (chatähnliche Optik, ohne
// externe Abhängigkeiten). Wird in der DB gespeichert und im
// Dashboard unter "Tickets → Transkripte" angezeigt.
// ═══════════════════════════════════════════════════════════════
'use strict';

// HTML-Escaping gegen XSS (Nachrichten könnten <script> enthalten)
function esc(text) {
  return String(text || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// Einfache Discord-Formatierung -> HTML
function markdown(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

module.exports = function buildTranscriptHTML(nachrichten, meta) {
  const msgs = [...nachrichten]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(m => {
      const zeit = new Date(m.createdTimestamp).toLocaleString('de-DE');
      const inhalt = m.content
        ? `<div class="inhalt">${markdown(m.content)}</div>`
        : (m.attachments?.size ? '<div class="inhalt leer">📎 (Anhänge)</div>' : '');
      return `
      <div class="nachricht">
        <img class="avatar" src="${esc(m.author?.displayAvatarURL?.() || '')}" alt="" onerror="this.style.display='none'">
        <div class="koerper">
          <div class="kopf"><span class="name">${esc(m.author?.username || 'Unbekannt')}</span>
          <span class="zeit">${esc(zeit)}</span></div>
          ${inhalt}
        </div>
      </div>`;
    }).join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Transkript · ${esc(meta.kanal)}</title>
<style>
  :root { --bg:#1e1f22; --panel:#2b2d31; --text:#dbdee1; --akzent:#5865f2; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text);
         font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:24px; }
  .kopfzeile { background:var(--panel); border-radius:12px; padding:16px 20px; margin-bottom:16px;
               border-left:4px solid var(--akzent); }
  .kopfzeile h1 { font-size:1.2rem; margin-bottom:6px; }
  .kopfzeile .meta { font-size:.85rem; opacity:.75; line-height:1.6; }
  .nachricht { display:flex; gap:12px; padding:10px 14px; border-radius:10px; }
  .nachricht:hover { background:rgba(255,255,255,.04); }
  .avatar { width:36px; height:36px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .name { font-weight:600; color:#fff; margin-right:8px; }
  .zeit { font-size:.75rem; opacity:.6; }
  .inhalt { margin-top:2px; line-height:1.5; word-break:break-word; }
  .inhalt.leer { opacity:.6; font-style:italic; }
  code { background:rgba(255,255,255,.1); padding:1px 5px; border-radius:4px; }
</style>
</head>
<body>
  <div class="kopfzeile">
    <h1>📄 Transkript: #${esc(meta.kanal)}</h1>
    <div class="meta">
      Server: <b>${esc(meta.gilde)}</b> · Kategorie: <b>${esc(meta.kategorie)}</b> ·
      Erstellt: ${new Date().toLocaleString('de-DE')} · ${nachrichten.length} Nachrichten
    </div>
  </div>
  ${msgs || '<p><i>Keine Nachrichten im Zeitraum.</i></p>'}
</body>
</html>`;
};
